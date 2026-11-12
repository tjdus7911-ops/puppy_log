package com.mungroad.trip

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mungroad.BuildConfig
import com.mungroad.MungRoadApp
import com.mungroad.data.local.DataSource
import com.mungroad.data.local.DriveLegEntity
import com.mungroad.data.local.LegKind
import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import com.mungroad.data.local.PlaceCategory
import com.mungroad.data.local.RestSessionEntity
import com.mungroad.data.local.TripEntity
import com.mungroad.data.local.TripLocationEntity
import com.mungroad.data.local.TripPhase
import com.mungroad.data.local.TripStatus
import com.mungroad.data.local.VisitedPlaceEntity
import com.mungroad.domain.EngineEvent
import com.mungroad.domain.EngineState
import com.mungroad.domain.EngineStatus
import com.mungroad.domain.Korean
import com.mungroad.domain.Region
import com.mungroad.domain.Regions
import com.mungroad.domain.RestCare
import com.mungroad.domain.RestPolicy
import com.mungroad.domain.TripEngine
import com.mungroad.providers.DemoNavigationProvider
import com.mungroad.providers.DemoTrafficInfoProvider
import com.mungroad.providers.Destination
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.Hazard
import com.mungroad.providers.HazardType
import com.mungroad.providers.KakaoProxyPetPlaceProvider
import com.mungroad.providers.ManualDestinationNavigationProvider
import com.mungroad.providers.MapState
import com.mungroad.providers.NavEvent
import com.mungroad.providers.NavRequestResult
import com.mungroad.providers.NavigationProvider
import com.mungroad.providers.PetPlace
import com.mungroad.providers.PetPlaceProvider
import com.mungroad.providers.Provenance
import com.mungroad.providers.ProxyTrafficInfoProvider
import com.mungroad.providers.RouteSnapshot
import com.mungroad.providers.SamplePetPlaceProvider
import com.mungroad.providers.TrafficInfoProvider
import com.mungroad.sdk.PleosBindings
import com.mungroad.vehicle.AaosCabinSource
import com.mungroad.vehicle.AndroidLocationDataProvider
import com.mungroad.vehicle.AndroidSpeaker
import com.mungroad.vehicle.CabinCapabilities
import com.mungroad.vehicle.CabinContext
import com.mungroad.vehicle.CabinMemo
import com.mungroad.vehicle.CabinPrompt
import com.mungroad.vehicle.CabinPromptKind
import com.mungroad.vehicle.CabinRules
import com.mungroad.vehicle.CabinSource
import com.mungroad.vehicle.CabinState
import com.mungroad.vehicle.CombinedCabinSource
import com.mungroad.vehicle.DemoCabinSource
import com.mungroad.vehicle.DemoVehicleDataProvider
import com.mungroad.vehicle.FallbackSpeaker
import com.mungroad.vehicle.PleosVehicleDataProvider
import com.mungroad.vehicle.SpeechCenter
import com.mungroad.vehicle.SpeechPriority
import com.mungroad.vehicle.VehicleDataProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

/** 데모 화면의 '차량 상태 시뮬레이션' 버튼 */
enum class DemoCabinEvent(val label: String) {
    WINDOW("뒷창 열기"), HEAT("더운 날(31℃)"), REST_AREA_DOOR("휴게소 정차·뒷문"), TURN_SIGNAL("방향지시등"), ENGINE_OFF("시동 끄기")
}

data class Reminder(val due: Boolean, val drivenMinutes: Int, val minutesLeft: Int)

/** 휴식 중 반려견이 차에 남는지(펫 모드 안내) */
enum class PetStay { ASK, WITH_ME, IN_CAR }

data class LiveUi(
    val tripId: String,
    val pets: List<PetEntity>,
    val source: DataSource,
    val phase: TripPhase,
    val legKind: LegKind?,
    val engine: EngineState,
    val driven: List<GeoPoint>,
    val route: RouteSnapshot?,
    val destination: Destination?,
    val hazards: List<Hazard>,
    val hazardProvenance: Provenance,
    val places: List<PetPlace>,
    val placeProvenance: Provenance,
    val reminder: Reminder?,
    val demoSpeed: Int,
    val error: String?,
    val policy: RestPolicy,
    val routeComfortable: Boolean,
    val restWaypoint: Boolean,
    /** 휴식 경유지 추천(동반 가능 확인 여부와 함께) */
    val suggestedPlace: PetPlace?,
    val waypointName: String?,
    val cabin: CabinState,
    val cabinCaps: CabinCapabilities,
    val cabinPrompt: CabinPrompt?,
    val petStay: PetStay?,
    val showPetMode: Boolean,
    /** 끝난 구간 합계 */
    val doneKm: Double,
    val doneDrivingSec: Double,
    val doneRests: Int,
    val notice: String?,
) {
    val petNames: List<String> get() = pets.map { it.name }
    val petCall: String get() = Korean.petNames(petNames)
    val current: GeoPoint? get() = engine.lastFix?.let { GeoPoint(it.lat, it.lng) }
    val isDemo: Boolean get() = source == DataSource.DEMO
    val secondsUntilRest: Double get() = engine.snoozeUntilSec?.let { it - engine.drivingSinceRestSec } ?: (engine.restIntervalMin * 60 - engine.drivingSinceRestSec)
    val driving: Boolean get() = legKind != null && engine.status == EngineStatus.DRIVING
    val totalKm: Double get() = doneKm + if (legKind != null) engine.distanceKm else 0.0
    val totalDrivingSec: Double get() = doneDrivingSec + if (legKind != null) engine.drivingSec else 0.0
    val totalRests: Int get() = doneRests + if (legKind != null) engine.restCount else 0
    /** 주행 중 편집 잠금(데모는 시연을 위해 허용) */
    val editLocked: Boolean get() = driving && !isDemo
    fun mapState() = MapState(current, driven, route?.path.orEmpty(), route?.destination?.point ?: destination?.point, hazards, places)
}

/**
 * 여행 세션: 가는 길 → 여행지 → (돌아오는 길) → 여행 완료.
 * 차량 연동: Pleos NaviHelper(목적지·경유지·편한 길·도착), Vehicle SDK(창문·문·에어컨·방향지시등),
 * AAOS(외기 온도·시동·기어·차속), Pleos TextToSpeech. 지원하지 않는 기능은 끄고 나머지는 그대로 동작합니다.
 */
class TripViewModel(app: Application) : AndroidViewModel(app) {
    private val db = (app as MungRoadApp).db
    private val apiBase = BuildConfig.MUNGROAD_API_BASE_URL.trimEnd('/')
    private val prefs = app.getSharedPreferences("mungroad", Context.MODE_PRIVATE)

    val pets: StateFlow<List<PetEntity>> = db.petDao().observeAll().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val trips: StateFlow<List<TripEntity>> = db.tripDao().observeEnded().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _live = MutableStateFlow<LiveUi?>(null)
    val live: StateFlow<LiveUi?> = _live.asStateFlow()

    val demoMode = MutableStateFlow(prefs.getBoolean("demo", true))
    val homeRegion = MutableStateFlow(Regions.byId(prefs.getString("home", "seoul")))
    val hazardVoice = MutableStateFlow(prefs.getBoolean("hazardVoice", true))

    private val speakerImpl = FallbackSpeaker(PleosBindings.speaker(app), AndroidSpeaker(app))
    private val speech = SpeechCenter(speakerImpl)
    val usingPleosTts: Boolean get() = speakerImpl.usingPleos

    private var provider: VehicleDataProvider? = null
    private var navigation: NavigationProvider? = null
    private var traffic: TrafficInfoProvider? = null
    private var placesProvider: PetPlaceProvider? = null
    private var cabinSource: CabinSource? = null
    private var sampleJob: Job? = null
    private var sessionJobs = mutableListOf<Job>()
    private var openRest: RestSessionEntity? = null
    private var legId: String? = null
    private var legStart: Long = 0
    private var legStartFix: GeoPoint? = null
    private var cabinMemo = CabinMemo()
    private val spokenHazards = mutableSetOf<String>()
    private val pendingLocs = mutableListOf<TripLocationEntity>()

    fun setDemo(on: Boolean) { demoMode.value = on; prefs.edit().putBoolean("demo", on).apply() }
    fun setHome(r: Region) { homeRegion.value = r; prefs.edit().putString("home", r.id).apply() }
    fun setHazardVoice(on: Boolean) { hazardVoice.value = on; prefs.edit().putBoolean("hazardVoice", on).apply() }

    fun savePet(p: PetEntity) = viewModelScope.launch { db.petDao().upsert(p) }
    fun deletePet(id: String) = viewModelScope.launch { db.petDao().delete(id) }
    fun addPet(name: String, interval: Int) = savePet(newPet(name).copy(restIntervalMinutes = interval))
    fun newPet(name: String) = PetEntity(UUID.randomUUID().toString(), name.trim(), null, null, null, null, PetSize.SMALL, "", RestCare.APP_DEFAULT_INTERVAL, System.currentTimeMillis())

    private fun isAutomotive() = getApplication<Application>().packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)

    // ───────────────────────────── 여행 시작 ─────────────────────────────
    fun startTrip(petsIn: List<PetEntity>, destination: Destination?, routeComfortable: Boolean, restWaypoint: Boolean, demoSpeed: Int) {
        if (_live.value != null || petsIn.isEmpty()) return
        viewModelScope.launch {
            val ctx = getApplication<Application>()
            val now = System.currentTimeMillis()
            val demo = demoMode.value
            navigation = when {
                demo -> DemoNavigationProvider()
                PleosBindings.ENABLED -> PleosBindings.navigationProvider(ctx)
                else -> null
            } ?: ManualDestinationNavigationProvider(ctx) { _live.value?.destination }
            traffic = when {
                demo -> DemoTrafficInfoProvider()
                apiBase.isNotBlank() -> ProxyTrafficInfoProvider(apiBase)
                else -> null // 교통정보 미연동: 아무것도 표시하지 않음(임의 생성 금지)
            }
            placesProvider = if (apiBase.isNotBlank() && !demo) KakaoProxyPetPlaceProvider(apiBase) else SamplePetPlaceProvider()
            cabinSource = if (demo) DemoCabinSource() else CombinedCabinSource(listOfNotNull(PleosBindings.cabinSource(ctx), AaosCabinSource(ctx)))
            val policy = RestCare.resolve(petsIn, now)
            val source = when {
                demo -> DataSource.DEMO
                PleosBindings.ENABLED && isAutomotive() -> DataSource.PLEOS_VEHICLE
                else -> DataSource.DEVICE_LOCATION
            }
            val trip = TripEntity(
                id = UUID.randomUUID().toString(), title = "", titleEdited = false, startTime = now, endTime = null,
                startLat = null, startLng = null, startRegion = homeRegion.value?.name, endLat = null, endLng = null, endRegion = null,
                destinationName = destination?.name, totalDistanceKm = 0.0, drivingDurationSeconds = 0, elapsedDurationSeconds = 0,
                restIntervalMinutes = policy.intervalMinutes, status = TripStatus.STOPPED, diaryText = "", memo = "", coverPhotoUri = null,
                source = source, isDemo = demo, phase = TripPhase.OUTBOUND, updatedAt = now, restBasis = policy.basis.name, routeComfortable = routeComfortable,
            )
            if (!db.tripDao().createIfNoActive(trip, petsIn.map { it.id })) {
                _live.value = null
                return@launch
            }
            _live.value = LiveUi(
                trip.id, petsIn, source, TripPhase.OUTBOUND, null, EngineState(startTime = now, restIntervalMin = policy.intervalMinutes), emptyList(), null, destination,
                emptyList(), traffic?.provenance ?: Provenance.UNAVAILABLE, emptyList(), placesProvider!!.provenance, null, demoSpeed, null,
                policy, routeComfortable, restWaypoint, null, null, CabinState(), cabinSource?.capabilities ?: CabinCapabilities(), null, null, false,
                0.0, 0.0, 0, null,
            )
            // 차량 내비에 목적지 전달(편한 길). 좌표가 없으면 보호자가 내비에서 직접 설정
            if (!demo && destination?.point != null) {
                val r = navigation?.guideTo(destination.name, destination.point, preferWaypoint = false)
                navigation?.setRouteOption(routeComfortable)
                if (r is NavRequestResult.Failed) notice(r.reason)
            }
            startSessionWatchers()
            startLeg(LegKind.OUTBOUND)
            speech.speak("${Korean.petNames(petsIn.map { it.name })}${Korean.josa(Korean.petNames(petsIn.map { it.name }), "과", "와")} 여행을 시작할게요. 휴식은 ${policy.intervalMinutes}분마다 알려 드릴게요.", SpeechPriority.INFO)
        }
    }

    /** 여행 동안 계속 듣는 것: 차량 상태 · 내비 이벤트 · 경로 갱신 */
    private fun startSessionWatchers() {
        val cs = cabinSource
        if (cs != null) sessionJobs += viewModelScope.launch {
            cs.states().catch { }.collect { s ->
                _live.update { it?.copy(cabin = s, cabinCaps = cs.capabilities) }
                speech.setHold(CabinRules.shouldHold(s, cs.capabilities))
                evalCabin()
            }
        }
        navigation?.let { nav ->
            sessionJobs += viewModelScope.launch {
                nav.events().collect { ev ->
                    if (ev is NavEvent.Arrived && _live.value?.legKind != null) arrive()
                }
            }
        }
        sessionJobs += viewModelScope.launch {
            while (isActive) {
                refreshRouteAndHazards()
                speech.flush()
                delay(15_000)
            }
        }
    }

    private fun startLeg(kind: LegKind) {
        val cur = _live.value ?: return
        val ctx = getApplication<Application>()
        val now = System.currentTimeMillis()
        val p: VehicleDataProvider = when (cur.source) {
            DataSource.DEMO -> DemoVehicleDataProvider(now, cur.demoSpeed, reverse = kind == LegKind.RETURN)
            DataSource.PLEOS_VEHICLE -> PleosVehicleDataProvider(ctx)
            else -> AndroidLocationDataProvider(ctx)
        }
        provider = p
        legId = UUID.randomUUID().toString()
        legStart = p.now()
        legStartFix = null
        cabinMemo = CabinMemo()
        navigation?.setReturnLeg(kind == LegKind.RETURN)
        _live.update {
            it?.copy(
                legKind = kind, phase = if (kind == LegKind.RETURN) TripPhase.RETURNING else TripPhase.OUTBOUND,
                engine = EngineState(startTime = p.now(), restIntervalMin = it.policy.intervalMinutes), driven = emptyList(), reminder = null,
                suggestedPlace = null, cabinPrompt = null, petStay = null, showPetMode = false,
            )
        }
        sampleJob = viewModelScope.launch {
            p.samples()
                .catch { e -> _live.update { it?.copy(error = e.message) } }
                .collect { sample -> onSample(sample) }
            // 데모 경로 끝 = 도착
            if (p.isSimulated && _live.value?.legKind != null) arrive()
        }
        viewModelScope.launch { refreshRouteAndHazards() }
    }

    private suspend fun onSample(sample: com.mungroad.domain.VehicleSample) {
        val cur = _live.value ?: return
        if (cur.legKind == null) return
        val (next, events) = TripEngine.step(cur.engine, sample)
        var driven = cur.driven
        var reminder = cur.reminder
        val pet = cur.petNames.first()
        events.forEach { ev ->
            when (ev) {
                is EngineEvent.Point -> {
                    driven = driven + GeoPoint(ev.fix.lat, ev.fix.lng)
                    if (legStartFix == null) legStartFix = GeoPoint(ev.fix.lat, ev.fix.lng)
                    pendingLocs += TripLocationEntity(UUID.randomUUID().toString(), cur.tripId, ev.fix.lat, ev.fix.lng, ev.fix.t, ev.fix.acc)
                }
                is EngineEvent.RestSoon -> {
                    reminder = Reminder(false, (next.drivingSinceRestSec / 60).toInt(), ev.minutesLeft)
                    speech.speak(RestCare.soonVoice(pet), SpeechPriority.REST)
                    if (cur.restWaypoint) suggestRestStop()
                }
                is EngineEvent.RestDue -> {
                    reminder = Reminder(true, ev.drivenMinutes, 0)
                    speech.speak(RestCare.dueVoice(pet, cur.pets.any { RestCare.hasCare(it) }), SpeechPriority.REST)
                }
                is EngineEvent.StatusChanged -> Unit
            }
        }
        _live.value = cur.copy(engine = next, driven = driven, reminder = reminder)
        evalCabin()
        announceHazardsAhead()
        if (pendingLocs.size >= 20) flush()
    }

    // ───────────────────────────── 탑승 안전 안내 ─────────────────────────────
    private fun evalCabin() {
        val cur = _live.value ?: return
        if (cur.cabinPrompt != null) return // 한 번에 하나
        val resting = cur.engine.status == EngineStatus.RESTING
        val ctx = CabinContext(
            moving = cur.driving,
            parked = cur.legKind == null || cur.engine.status != EngineStatus.DRIVING,
            resting = resting,
            arrived = cur.legKind == null,
            petCall = cur.petCall,
            brachy = cur.pets.any { RestCare.isBrachy(it) },
            caps = cur.cabinCaps,
            now = System.currentTimeMillis(),
        )
        val (prompt, memo) = CabinRules.evaluate(cur.cabin, cabinMemo, ctx)
        cabinMemo = memo
        if (prompt != null) {
            _live.update { it?.copy(cabinPrompt = prompt) }
            speech.speak(prompt.text, if (prompt.safety) SpeechPriority.SAFETY else SpeechPriority.REST)
            if (!prompt.ask) viewModelScope.launch { delay(8_000); _live.update { s -> if (s?.cabinPrompt == prompt) s.copy(cabinPrompt = null) else s } }
        }
    }

    /** 안내 응답. accept=true: 에어컨 켜기 · 휴식 시작 · (내리기 전 확인) 펫 모드 안내 */
    fun answerCabin(accept: Boolean) = viewModelScope.launch {
        val prompt = _live.value?.cabinPrompt ?: return@launch
        _live.update { it?.copy(cabinPrompt = null) }
        if (!accept) return@launch
        when (prompt.kind) {
            CabinPromptKind.HEAT -> {
                val ok = cabinSource?.setAc(true) == true
                speech.speak(if (ok) "에어컨을 켰어요." else "에어컨을 켜지 못했어요. 직접 켜 주세요.", SpeechPriority.INFO)
            }
            CabinPromptKind.DOOR_REST -> beginRest()
            CabinPromptKind.LEAVE_CHECK -> _live.update { it?.copy(showPetMode = true) }
            CabinPromptKind.WINDOW -> Unit
        }
    }

    fun simulateCabin(ev: DemoCabinEvent) = viewModelScope.launch {
        val demoCabin = cabinSource as? DemoCabinSource ?: return@launch
        val demoCar = provider as? DemoVehicleDataProvider
        when (ev) {
            DemoCabinEvent.WINDOW -> demoCabin.set { it.copy(rearWindowOpenPct = 80) }
            DemoCabinEvent.HEAT -> demoCabin.set { it.copy(outsideTempC = 31f, acOn = false) }
            DemoCabinEvent.TURN_SIGNAL -> {
                demoCabin.set { it.copy(turnSignal = true) }
                delay(4_000)
                demoCabin.set { it.copy(turnSignal = false) }
            }
            DemoCabinEvent.REST_AREA_DOOR -> {
                demoCar?.stopHold = true
                delay(2_500) // 차가 멈출 때까지
                demoCabin.set { it.copy(rearDoorOpen = true) }
                delay(1_500)
                demoCabin.set { it.copy(rearDoorOpen = false) }
            }
            DemoCabinEvent.ENGINE_OFF -> {
                demoCar?.stopHold = true
                delay(2_000)
                demoCabin.set { it.copy(ignitionOn = false, rearDoorOpen = false) }
                delay(5_000)
                demoCabin.set { it.copy(ignitionOn = true) }
            }
        }
    }

    // ───────────────────────────── 휴식 ─────────────────────────────
    fun snooze() = _live.update { it?.copy(engine = TripEngine.snooze(it.engine), reminder = null) }
    fun dismissReminder() = _live.update { it?.copy(reminder = null) }

    /** '가까운 휴식 장소 찾기' */
    fun findRestPlaces() { _live.update { it?.copy(reminder = null) }; suggestRestStop() }

    private fun suggestRestStop() = viewModelScope.launch {
        loadPlaces().join()
        val cur = _live.value ?: return@launch
        val pick = cur.places.firstOrNull { it.category == PlaceCategory.REST_AREA || it.category == PlaceCategory.PARK } ?: cur.places.firstOrNull() ?: return@launch
        _live.update { it?.copy(suggestedPlace = pick) }
        speech.speak(RestCare.placeFoundVoice(pick.policy.petAllowed == true), SpeechPriority.PLACE)
    }

    fun dismissSuggestion() = _live.update { it?.copy(suggestedPlace = null) }

    fun beginRest() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val p = provider ?: return@launch
        if (cur.legKind == null) return@launch
        val started = TripEngine.startRest(cur.engine, p.now()) ?: return@launch // 중복 방지
        val rest = RestSessionEntity(UUID.randomUUID().toString(), cur.tripId, p.now(), null, cur.engine.lastFix?.lat, cur.engine.lastFix?.lng, legId)
        openRest = rest
        _live.update { it?.copy(engine = started, reminder = null, petStay = PetStay.ASK, cabinPrompt = null) }
        p.onRestChanged(true)
        db.tripDao().upsertRest(rest)
        val hot = CabinRules.isHot(cur.cabin, cur.pets.any { RestCare.isBrachy(it) })
        speech.speak(if (hot) CabinRules.restHeatCare(cur.petCall) else "휴식을 시작했어요. ${cur.petCall}와 물 마시고 잠깐 걸어요.", SpeechPriority.REST)
    }

    /** 휴식 중 반려견이 차에 남는지 — 남으면 펫 모드 켜는 방법 안내(앱이 직접 실행하지 않음) */
    fun setPetStay(stay: PetStay) = _live.update { it?.copy(petStay = stay, showPetMode = stay == PetStay.IN_CAR) }
    fun closePetMode() = _live.update { it?.copy(showPetMode = false) }

    fun endRest() = viewModelScope.launch {
        val p = provider ?: return@launch
        val rest = openRest ?: return@launch
        val at = p.now()
        openRest = null
        (p as? DemoVehicleDataProvider)?.stopHold = false
        _live.update { it?.copy(engine = TripEngine.endRest(it.engine, at), petStay = null, showPetMode = false) }
        p.onRestChanged(false)
        db.tripDao().upsertRest(rest.copy(endTime = at))
        speech.speak("다시 출발해요. 다음 휴식도 알려 드릴게요.", SpeechPriority.INFO)
    }

    fun resumeDemo() { (provider as? DemoVehicleDataProvider)?.stopHold = false }

    // ───────────────────────────── 장소 · 내비 ─────────────────────────────
    private suspend fun refreshRouteAndHazards() {
        val cur = _live.value ?: return
        val route = navigation?.currentRoute(cur.current)
        val hz = traffic?.hazardsNear(route?.path.orEmpty(), cur.current)
        _live.update {
            it?.copy(
                route = route ?: it.route,
                hazards = hz?.getOrNull() ?: it.hazards,
                error = hz?.exceptionOrNull()?.let { e -> "교통정보를 불러오지 못했어요: ${e.message}" } ?: it.error,
            )
        }
    }

    fun loadPlaces() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val center = cur.current ?: cur.destination?.point ?: return@launch
        val res = placesProvider?.search(null, center, 10.0) ?: return@launch
        _live.update { it?.copy(places = res.getOrDefault(emptyList()).sortedBy { p -> TripEngine.haversineKm(center.lat, center.lng, p.point.lat, p.point.lng) }.take(6)) }
    }

    /** 주행 중 과도한 팝업 없이: 진행 방향 3km 이내 위험 정보만 1회, 반려견 맞춤 문구로 음성 안내 */
    private fun announceHazardsAhead() {
        if (!hazardVoice.value) return
        val cur = _live.value ?: return
        val pos = cur.current ?: return
        val pet = cur.petCall
        cur.hazards.filter { it.id !in spokenHazards && TripEngine.haversineKm(pos.lat, pos.lng, it.point.lat, it.point.lng) < 3.0 }.forEach { h ->
            spokenHazards += h.id
            val prefix = if (h.provenance == Provenance.DEMO) "데모 정보예요. " else ""
            speech.speak(prefix + when (h.type) {
                HazardType.CONSTRUCTION -> "전방에 공사 구간이 있어요. ${pet}가 놀라지 않게 천천히 지나갈게요."
                HazardType.ACCIDENT -> "전방에 사고 신고가 있어요. 급정거에 대비해 속도를 줄여 주세요."
                HazardType.DEBRIS -> "전방에 낙하물 신고가 있어요. 차로를 미리 확인해 주세요."
                HazardType.CONGESTION -> "전방이 막혀요. ${pet}가 답답해하면 창문은 조금만 열어 주세요."
                else -> "전방 돌발 상황을 확인해 주세요."
            }, SpeechPriority.SAFETY)
        }
    }

    /** 휴식 장소를 경유지로(실패하면 목적지로) — 샘플 장소는 안내하지 않음 */
    fun guideTo(place: PetPlace, onResult: (NavRequestResult) -> Unit) = viewModelScope.launch {
        if (place.provenance == Provenance.SAMPLE) { onResult(NavRequestResult.Failed("샘플 장소라 길 안내를 할 수 없어요.")); return@launch }
        val nav = navigation ?: run { onResult(NavRequestResult.Failed("내비게이션 연결 없음")); return@launch }
        var r = nav.guideTo(place.name, place.point, preferWaypoint = true)
        if (r is NavRequestResult.Failed) r = nav.guideTo(place.name, place.point, preferWaypoint = false)
        if (r is NavRequestResult.WaypointAdded) _live.update { it?.copy(waypointName = place.name, suggestedPlace = null) }
        else _live.update { it?.copy(suggestedPlace = null) }
        onResult(r)
    }

    /** 여행 정보 수정(목적지 · 경로 옵션 · 경유지 · 휴식 간격). 주행 중(실차)에는 화면에서 잠금 */
    fun updateTripInfo(destination: Destination?, comfortable: Boolean, intervalMin: Int, removeWaypoint: Boolean) = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val nav = navigation
        val msgs = mutableListOf<String>()
        if (destination != null && destination.name != cur.destination?.name) {
            if (!cur.isDemo && destination.point != null && nav != null) {
                val r = nav.guideTo(destination.name, destination.point, preferWaypoint = false)
                msgs += if (r is NavRequestResult.Failed) r.reason else "목적지를 ${destination.name}(으)로 바꿨어요."
            } else msgs += "목적지를 ${destination.name}(으)로 바꿨어요."
            db.tripDao().get(cur.tripId)?.let { db.tripDao().upsert(it.copy(destinationName = destination.name, updatedAt = System.currentTimeMillis())) }
        }
        if (comfortable != cur.routeComfortable) {
            val ok = nav?.setRouteOption(comfortable) ?: false
            msgs += if (ok || cur.isDemo) (if (comfortable) "편한 길로 안내해요." else "추천 경로로 안내해요.") else "경로 옵션은 내비에서 바꿔 주세요."
        }
        if (removeWaypoint && cur.waypointName != null) {
            val ok = nav?.clearWaypoints() ?: false
            msgs += if (ok || cur.isDemo) "경유지를 지웠어요." else "경유지는 내비에서 지워 주세요."
        }
        val newInterval = intervalMin.coerceIn(RestCare.MIN_INTERVAL, RestCare.MAX_INTERVAL)
        if (newInterval != cur.policy.intervalMinutes) msgs += "휴식 알림을 ${newInterval}분마다로 바꿨어요."
        _live.update {
            it?.copy(
                destination = destination ?: it.destination,
                routeComfortable = comfortable,
                waypointName = if (removeWaypoint) null else it.waypointName,
                policy = if (newInterval != it.policy.intervalMinutes) it.policy.copy(intervalMinutes = newInterval, basis = com.mungroad.domain.RestBasis.GUARDIAN) else it.policy,
                engine = if (newInterval != it.engine.restIntervalMin) it.engine.copy(restIntervalMin = newInterval, soonNotified = false, dueNotified = false) else it.engine,
            )
        }
        if (msgs.isNotEmpty()) notice(msgs.joinToString(" "))
        refreshRouteAndHazards()
    }

    private fun notice(text: String) {
        _live.update { it?.copy(notice = text) }
        speech.speak(text, SpeechPriority.INFO)
    }
    fun clearNotice() = _live.update { it?.copy(notice = null) }

    // ───────────────────────────── 도착 · 돌아오는 길 · 완료 ─────────────────────────────
    /** 도착(내비 도착 이벤트 · 데모 경로 끝 · '도착했어요' 버튼). 도착은 여행 종료가 아닙니다. */
    fun arrive() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val kind = cur.legKind ?: return@launch
        endLeg()
        val now = System.currentTimeMillis()
        if (kind == LegKind.RETURN) {
            _live.update { it?.copy(phase = TripPhase.RETURNING) }
            speech.speak("집에 도착했어요. ${cur.petCall}와 함께한 여행을 저장할까요?", SpeechPriority.INFO)
        } else {
            _live.update { it?.copy(phase = TripPhase.AT_DESTINATION) }
            db.tripDao().get(cur.tripId)?.let { db.tripDao().upsert(it.copy(phase = TripPhase.AT_DESTINATION, arrivedAt = it.arrivedAt ?: now, updatedAt = now)) }
            speech.speak("${cur.destination?.name ?: "여행지"}에 도착했어요. ${cur.petCall}와 즐거운 시간 보내세요.", SpeechPriority.INFO)
        }
        loadPlaces()
    }

    /** 구간 종료: 기록 저장, 차량 데이터 수집 중지(차량 상태 안내 중 '내리기 전 확인'은 계속) */
    private suspend fun endLeg() {
        val cur = _live.value ?: return
        val kind = cur.legKind ?: return
        val p = provider
        if (openRest != null) endRest().join()
        sampleJob?.cancel(); sampleJob = null
        flush()
        val e = _live.value!!.engine
        val end = cur.current
        val leg = DriveLegEntity(
            id = legId ?: UUID.randomUUID().toString(), tripId = cur.tripId, kind = kind, startTime = legStart, endTime = p?.now() ?: System.currentTimeMillis(),
            distanceKm = e.distanceKm, drivingDurationSeconds = e.drivingSec.toLong(), elapsedDurationSeconds = e.elapsedSec.toLong(),
            restCount = e.restCount, restDurationSeconds = e.restTotalSec.toLong(),
            startLat = legStartFix?.lat, startLng = legStartFix?.lng, startRegion = null, endLat = end?.lat, endLng = end?.lng, endRegion = null,
            source = cur.source, isDemo = cur.isDemo,
        )
        db.tripDao().upsertLeg(leg)
        provider = null
        _live.update {
            it?.copy(
                legKind = null, doneKm = it.doneKm + e.distanceKm, doneDrivingSec = it.doneDrivingSec + e.drivingSec, doneRests = it.doneRests + e.restCount,
                reminder = null, suggestedPlace = null,
                // 주행 중 안내(창문·더위·뒷문 휴식)는 도착하면 닫음. '내리기 전 확인'만 남김
                cabinPrompt = it.cabinPrompt?.takeIf { p -> p.kind == CabinPromptKind.LEAVE_CHECK },
            )
        }
    }

    /** 여행지에서 출발: 돌아오는 길(집 위치가 있으면 내비에 전달) */
    fun startReturn() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        if (cur.legKind != null) return@launch
        val home = homeRegion.value
        val now = System.currentTimeMillis()
        db.tripDao().get(cur.tripId)?.let { db.tripDao().upsert(it.copy(phase = TripPhase.RETURNING, returnStartedAt = now, updatedAt = now)) }
        if (!cur.isDemo && home != null) {
            val r = navigation?.guideTo("집(${home.name})", home.point, preferWaypoint = false)
            if (r is NavRequestResult.Failed) notice(r.reason)
        }
        startLeg(LegKind.RETURN)
        speech.speak("집으로 출발해요. 돌아오는 길에도 휴식을 알려 드릴게요.", SpeechPriority.INFO)
    }

    /** 여행 완료 · 기록 저장(도착 후, 또는 돌아오는 길 없이도 가능) */
    fun finishTrip(onSaved: (String) -> Unit) = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        if (cur.legKind != null) endLeg()
        val after = _live.value ?: return@launch
        val trip = db.tripDao().get(cur.tripId) ?: return@launch
        val legs = db.tripDao().legs(cur.tripId)
        val dest = trip.destinationName
        val who = Korean.petNames(cur.petNames)
        val withJ = "$who${Korean.josa(who, "과", "와")}"
        val now = System.currentTimeMillis()
        val first = legs.firstOrNull()
        val lastLeg = legs.lastOrNull { it.kind != LegKind.RETURN }
        db.tripDao().upsert(
            trip.copy(
                status = TripStatus.ENDED, phase = TripPhase.COMPLETED, endTime = now,
                title = if (trip.titleEdited) trip.title else if (dest != null) "$withJ $dest 여행" else "$withJ 달린 길",
                totalDistanceKm = after.doneKm, drivingDurationSeconds = after.doneDrivingSec.toLong(), elapsedDurationSeconds = if (trip.isDemo) legs.sumOf { it.elapsedDurationSeconds } else (now - trip.startTime) / 1000,
                startLat = first?.startLat, startLng = first?.startLng, endLat = lastLeg?.endLat, endLng = lastLeg?.endLng, endRegion = dest, updatedAt = now,
            ),
        )
        runCatching { navigation?.cancelRoute() }
        stopSession()
        speech.speak("여행을 저장했어요. ${cur.petCall}와 함께해서 즐거웠어요.", SpeechPriority.INFO)
        onSaved(cur.tripId)
    }

    /** 여행지에서 직접 장소 기록 */
    fun recordPlace(name: String) = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val pt = cur.current ?: cur.destination?.point ?: return@launch
        db.tripDao().upsertPlace(VisitedPlaceEntity(UUID.randomUUID().toString(), cur.tripId, name, PlaceCategory.PARK, pt.lat, pt.lng, System.currentTimeMillis(), cur.isDemo, origin = "USER"))
        notice("'$name'을(를) 여행 기록에 남겼어요.")
    }

    private fun stopSession() {
        sessionJobs.forEach { it.cancel() }; sessionJobs.clear()
        sampleJob?.cancel(); sampleJob = null
        cabinSource?.release(); cabinSource = null
        speech.setHold(false)
        _live.value = null
        provider = null
        navigation = null
        spokenHazards.clear()
    }

    private suspend fun flush() {
        if (pendingLocs.isEmpty()) return
        val batch = pendingLocs.toList(); pendingLocs.clear()
        runCatching { db.tripDao().insertLocations(batch) }.onFailure { pendingLocs.addAll(0, batch) }
    }

    fun setDemoSpeed(mult: Int) {
        (provider as? DemoVehicleDataProvider)?.speedMultiplier = mult
        _live.update { it?.copy(demoSpeed = mult) }
    }

    fun speak(text: String) = speech.speak(text, SpeechPriority.INFO)

    /** 음성 명령(STT 결과 문자열) — 키워드 기반 */
    fun handleVoice(text: String): String {
        val cur = _live.value
        val answer = when {
            cur == null -> "진행 중인 여행이 없어요."
            "휴식" in text && ("얼마" in text || "남" in text) -> "다음 휴식까지 ${(cur.secondsUntilRest / 60).toInt().coerceAtLeast(0)}분 남았어요."
            "휴식" in text && ("시작" in text || "쉬" in text) -> { beginRest(); "휴식을 시작할게요." }
            "휴게소" in text || "쉴 곳" in text || "쉴곳" in text -> { findRestPlaces(); "가까운 휴식 장소를 찾아볼게요." }
            "카페" in text -> { loadPlaces(); "반려견과 갈 수 있는 카페를 찾아볼게요. 동반 가능 여부는 방문 전 확인해 주세요." }
            "도착" in text && cur.legKind != null -> { arrive(); "도착으로 기록할게요." }
            "에어컨" in text -> { viewModelScope.launch { val ok = cabinSource?.setAc(true) == true; speech.speak(if (ok) "에어컨을 켰어요." else "에어컨은 직접 켜 주세요.") }; "에어컨을 켜 볼게요." }
            else -> "다시 말씀해 주세요. 예: 가까운 휴게소 찾아줘"
        }
        speech.speak(answer, SpeechPriority.INFO)
        return answer
    }

    override fun onCleared() {
        stopSession()
        speech.release()
        super.onCleared()
    }
}
