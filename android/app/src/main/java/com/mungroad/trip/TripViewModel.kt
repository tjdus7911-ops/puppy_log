package com.mungroad.trip

import android.app.Application
import android.speech.tts.TextToSpeech
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mungroad.BuildConfig
import com.mungroad.MungRoadApp
import com.mungroad.data.local.DataSource
import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import com.mungroad.data.local.PlaceCategory
import com.mungroad.data.local.RestSessionEntity
import com.mungroad.data.local.TripEntity
import com.mungroad.data.local.TripLocationEntity
import com.mungroad.data.local.TripStatus
import com.mungroad.domain.EngineEvent
import com.mungroad.domain.EngineState
import com.mungroad.domain.EngineStatus
import com.mungroad.domain.TripEngine
import com.mungroad.providers.DemoNavigationProvider
import com.mungroad.providers.DemoTrafficInfoProvider
import com.mungroad.providers.Destination
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.Hazard
import com.mungroad.providers.KakaoProxyPetPlaceProvider
import com.mungroad.providers.ManualDestinationNavigationProvider
import com.mungroad.providers.MapState
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
import com.mungroad.vehicle.AndroidLocationDataProvider
import com.mungroad.vehicle.DemoVehicleDataProvider
import com.mungroad.vehicle.PleosVehicleDataProvider
import com.mungroad.vehicle.VehicleDataProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import java.util.UUID

enum class SourceChoice { DEMO, DEVICE_LOCATION, PLEOS_VEHICLE }

data class Reminder(val due: Boolean, val drivenMinutes: Int, val minutesLeft: Int)

data class LiveUi(
    val tripId: String,
    val petNames: List<String>,
    val source: DataSource,
    val engine: EngineState,
    val driven: List<GeoPoint>,
    val route: RouteSnapshot?,
    val hazards: List<Hazard>,
    val hazardProvenance: Provenance,
    val places: List<PetPlace>,
    val placeProvenance: Provenance,
    val reminder: Reminder?,
    val demoSpeed: Int,
    val error: String?,
) {
    val current: GeoPoint? get() = engine.lastFix?.let { GeoPoint(it.lat, it.lng) }
    val secondsUntilRest: Double get() = engine.snoozeUntilSec?.let { it - engine.drivingSinceRestSec } ?: (engine.restIntervalMin * 60 - engine.drivingSinceRestSec)
    fun mapState() = MapState(current, driven, route?.path.orEmpty(), route?.destination?.point, hazards, places)
}

/**
 * 여행 세션(요청서의 TripRepository + RestReminderManager 연결부).
 * ⚠ Android 코드는 아직 컴파일 검증 전입니다. 같은 규칙의 웹 구현(web/src/trip/TripController.ts)은 E2E 로 검증됨.
 */
class TripViewModel(app: Application) : AndroidViewModel(app) {
    private val db = (app as MungRoadApp).db
    private val apiBase = BuildConfig.MUNGROAD_API_BASE_URL.trimEnd('/')

    val pets: StateFlow<List<PetEntity>> = db.petDao().observeAll().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val trips: StateFlow<List<TripEntity>> = db.tripDao().observeEnded().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _live = MutableStateFlow<LiveUi?>(null)
    val live: StateFlow<LiveUi?> = _live.asStateFlow()

    var demoMode = MutableStateFlow(true)

    private var provider: VehicleDataProvider? = null
    private var navigation: NavigationProvider? = null
    private var traffic: TrafficInfoProvider? = null
    private var placesProvider: PetPlaceProvider? = null
    private var job: Job? = null
    private var openRest: RestSessionEntity? = null
    private val spokenHazards = mutableSetOf<String>()
    private val pendingLocs = mutableListOf<TripLocationEntity>()
    private var tts: TextToSpeech? = TextToSpeech(app) { status -> if (status == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN }

    fun addPet(name: String, interval: Int) = viewModelScope.launch {
        db.petDao().upsert(PetEntity(UUID.randomUUID().toString(), name.trim(), null, null, null, null, PetSize.SMALL, "", interval, System.currentTimeMillis()))
    }

    fun startTrip(pet: PetEntity, destination: Destination?, intervalMin: Int, choice: SourceChoice) {
        if (_live.value != null) return // 중복 여행 시작 방지(메모리)
        viewModelScope.launch {
            val ctx = getApplication<Application>()
            val now = System.currentTimeMillis()
            val p: VehicleDataProvider = when (choice) {
                SourceChoice.DEMO -> DemoVehicleDataProvider(now, 60)
                SourceChoice.DEVICE_LOCATION -> AndroidLocationDataProvider(ctx)
                SourceChoice.PLEOS_VEHICLE -> PleosVehicleDataProvider(ctx)
            }
            navigation = when {
                choice == SourceChoice.DEMO -> DemoNavigationProvider()
                PleosBindings.ENABLED -> PleosBindings.navigationProvider(ctx)
                else -> ManualDestinationNavigationProvider(ctx) { destination }
            }
            traffic = when {
                choice == SourceChoice.DEMO -> DemoTrafficInfoProvider()
                apiBase.isNotBlank() -> ProxyTrafficInfoProvider(apiBase)
                else -> null // 교통정보 미연동: 아무것도 표시하지 않음(임의 생성 금지)
            }
            placesProvider = if (apiBase.isNotBlank() && choice != SourceChoice.DEMO) KakaoProxyPetPlaceProvider(apiBase) else SamplePetPlaceProvider()

            val trip = TripEntity(
                id = UUID.randomUUID().toString(), title = "", titleEdited = false, startTime = now, endTime = null,
                startLat = null, startLng = null, startRegion = null, endLat = null, endLng = null, endRegion = null,
                destinationName = destination?.name, totalDistanceKm = 0.0, drivingDurationSeconds = 0, elapsedDurationSeconds = 0,
                restIntervalMinutes = intervalMin, status = TripStatus.STOPPED, diaryText = "", memo = "", coverPhotoUri = null,
                source = p.source, isDemo = p.isSimulated,
            )
            if (!db.tripDao().createIfNoActive(trip, listOf(pet.id))) {
                _live.update { it?.copy(error = "이미 진행 중인 여행이 있어요.") }
                return@launch
            }
            provider = p
            _live.value = LiveUi(
                trip.id, listOf(pet.name), p.source, EngineState(startTime = now, restIntervalMin = intervalMin), emptyList(), null,
                emptyList(), traffic?.provenance ?: Provenance.UNAVAILABLE, emptyList(), placesProvider!!.provenance, null, 60, null,
            )
            speak("${pet.name}와 여행 기록을 시작할게요.")
            job = launch {
                p.samples()
                    .catch { e -> _live.update { it?.copy(error = e.message) } }
                    .collect { sample -> onSample(sample) }
            }
            launch { refreshRouteAndHazards() }
        }
    }

    private suspend fun onSample(sample: com.mungroad.domain.VehicleSample) {
        val cur = _live.value ?: return
        val (next, events) = TripEngine.step(cur.engine, sample)
        var driven = cur.driven
        var reminder = cur.reminder
        events.forEach { ev ->
            when (ev) {
                is EngineEvent.Point -> {
                    driven = driven + GeoPoint(ev.fix.lat, ev.fix.lng)
                    pendingLocs += TripLocationEntity(UUID.randomUUID().toString(), cur.tripId, ev.fix.lat, ev.fix.lng, ev.fix.t, ev.fix.acc)
                }
                is EngineEvent.RestSoon -> { reminder = Reminder(false, (next.drivingSinceRestSec / 60).toInt(), ev.minutesLeft); speak("${cur.petNames.first()}와 곧 쉬어갈 시간이에요."); loadPlaces() }
                is EngineEvent.RestDue -> { reminder = Reminder(true, ev.drivenMinutes, 0); speak("${cur.petNames.first()}와 ${ev.drivenMinutes}분 동안 이동했어요. 잠깐 쉬어갈까요?") }
                is EngineEvent.StatusChanged -> Unit
            }
        }
        _live.value = cur.copy(engine = next, driven = driven, reminder = reminder)
        announceHazardsAhead()
        if (pendingLocs.size >= 20) flush()
    }

    private suspend fun refreshRouteAndHazards() {
        val cur = _live.value ?: return
        val route = navigation?.currentRoute(cur.current)
        val hz = traffic?.hazardsNear(route?.path.orEmpty(), cur.current)
        _live.update {
            it?.copy(
                route = route,
                hazards = hz?.getOrNull() ?: it.hazards,
                error = hz?.exceptionOrNull()?.let { e -> "교통정보를 불러오지 못했어요: ${e.message}" } ?: it.error,
            )
        }
        loadPlaces()
    }

    fun loadPlaces() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val center = cur.current ?: return@launch
        val res = placesProvider?.search(null, center, 10.0) ?: return@launch
        _live.update { it?.copy(places = res.getOrDefault(emptyList()).sortedBy { p -> TripEngine.haversineKm(center.lat, center.lng, p.point.lat, p.point.lng) }.take(6)) }
    }

    /** 운전 중 과도한 팝업 없이: 진행 방향 3km 이내 위험 정보만 1회 음성 안내 */
    private fun announceHazardsAhead() {
        val cur = _live.value ?: return
        val pos = cur.current ?: return
        cur.hazards.filter { it.id !in spokenHazards && TripEngine.haversineKm(pos.lat, pos.lng, it.point.lat, it.point.lng) < 3.0 }.forEach { h ->
            spokenHazards += h.id
            val prefix = if (h.provenance == Provenance.DEMO) "데모 정보입니다. " else ""
            speak(prefix + when (h.type) {
                com.mungroad.providers.HazardType.CONSTRUCTION -> "전방에 공사 구간이 있습니다."
                com.mungroad.providers.HazardType.ACCIDENT -> "전방에 사고 신고가 접수되었습니다."
                com.mungroad.providers.HazardType.DEBRIS -> "전방에 낙하물 신고가 있습니다."
                com.mungroad.providers.HazardType.CONGESTION -> "전방이 정체 중입니다."
                else -> "전방 돌발 상황을 확인해 주세요."
            })
        }
    }

    fun snooze() = _live.update { it?.copy(engine = TripEngine.snooze(it.engine), reminder = null) }
    fun dismissReminder() = _live.update { it?.copy(reminder = null) }

    fun beginRest() = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val p = provider ?: return@launch
        val started = TripEngine.startRest(cur.engine, p.now()) ?: return@launch // 중복 방지
        val rest = RestSessionEntity(UUID.randomUUID().toString(), cur.tripId, p.now(), null, cur.engine.lastFix?.lat, cur.engine.lastFix?.lng)
        openRest = rest
        _live.update { it?.copy(engine = started, reminder = null) } // 상태 먼저 반영 후 저장
        p.onRestChanged(true)
        db.tripDao().upsertRest(rest)
    }

    fun endRest() = viewModelScope.launch {
        val p = provider ?: return@launch
        val rest = openRest ?: return@launch
        val at = p.now()
        openRest = null
        _live.update { it?.copy(engine = TripEngine.endRest(it.engine, at)) }
        p.onRestChanged(false)
        db.tripDao().upsertRest(rest.copy(endTime = at))
    }

    fun guideTo(place: PetPlace, onResult: (NavRequestResult) -> Unit) = viewModelScope.launch {
        if (place.provenance == Provenance.SAMPLE) { onResult(NavRequestResult.Failed("샘플 장소라 길 안내를 할 수 없어요.")); return@launch }
        onResult(navigation?.guideTo(place.name, place.point, preferWaypoint = true) ?: NavRequestResult.Failed("내비게이션 연결 없음"))
    }

    fun endTrip(onSaved: (String) -> Unit) = viewModelScope.launch {
        val cur = _live.value ?: return@launch
        val p = provider ?: return@launch
        if (openRest != null) endRest().join()
        job?.cancel()
        flush()
        val e = _live.value!!.engine
        val trip = db.tripDao().get(cur.tripId) ?: return@launch
        val last = cur.driven.lastOrNull()
        val first = cur.driven.firstOrNull()
        val pet = cur.petNames.first()
        val dest = trip.destinationName
        db.tripDao().upsert(
            trip.copy(
                status = TripStatus.ENDED, endTime = p.now(), title = if (dest != null) "${pet}와 $dest 여행" else "${pet}와 달린 길",
                totalDistanceKm = e.distanceKm, drivingDurationSeconds = e.drivingSec.toLong(), elapsedDurationSeconds = e.elapsedSec.toLong(),
                startLat = first?.lat, startLng = first?.lng, endLat = last?.lat, endLng = last?.lng,
            ),
        )
        _live.value = null
        provider = null
        spokenHazards.clear()
        onSaved(cur.tripId)
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

    fun speak(text: String) { tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mungroad") }

    /** 음성 명령 해석(STT 결과 문자열) — 키워드 기반 */
    fun handleVoice(text: String): String {
        val cur = _live.value
        val answer = when {
            "휴식" in text && ("얼마" in text || "남" in text) -> cur?.let { "다음 휴식까지 ${(it.secondsUntilRest / 60).toInt().coerceAtLeast(0)}분 남았어요." } ?: "진행 중인 여행이 없어요."
            "휴게소" in text -> { loadPlaces(); "가까운 휴게소를 찾아볼게요." }
            "카페" in text -> { loadPlaces(); "반려견과 갈 수 있는 카페를 찾아볼게요. 동반 가능 여부는 방문 전 확인해 주세요." }
            else -> "다시 말씀해 주세요. 예: 가까운 휴게소 찾아줘"
        }
        speak(answer)
        return answer
    }

    override fun onCleared() {
        tts?.shutdown(); tts = null
        super.onCleared()
    }

    companion object {
        val CATEGORIES = listOf(PlaceCategory.REST_AREA, PlaceCategory.CAFE, PlaceCategory.RESTAURANT, PlaceCategory.PARK)
    }
}
