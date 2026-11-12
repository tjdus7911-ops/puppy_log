package com.mungroad.sdk

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.RouteOption
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DrivingInfo
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.OnInitializeListener
import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.api.model.area.SeatArea
import ai.pleos.playground.vehicle.api.model.area.WindowArea
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.constant.area.SeatValue
import ai.pleos.playground.vehicle.constant.area.TurnSignalValue
import ai.pleos.playground.vehicle.constant.area.WindowValue
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import ai.pleos.playground.vehicle.listener.HvacAcStateListener
import ai.pleos.playground.vehicle.listener.TurnSignalStateListener
import android.content.Context
import android.util.Log
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.NavRequestResult
import com.mungroad.providers.NavigationProvider
import com.mungroad.providers.Provenance
import com.mungroad.providers.RouteSnapshot
import com.mungroad.vehicle.CabinCapabilities
import com.mungroad.vehicle.CabinSource
import com.mungroad.vehicle.CabinState
import com.mungroad.vehicle.Speaker
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Pleos Connect SDK 연동 (mungroad.usePleosSdk=true 일 때만 컴파일).
 * 시그니처는 공개 Maven 저장소의 AAR(Vehicle 2.3.2 · NaviHelper 3.0.5 · navi-data 3.0.4 · TextToSpeech 3.3.1)
 * public API 로 확인했습니다(docs/PLEOS_SDK_API.md). 실제 동작은 Pleos Connect Emulator·차량에서 확인이 필요합니다.
 */
object PleosBindings {
    const val ENABLED = true
    private const val TAG = "MungRoadPleos"

    fun navigationProvider(context: Context): NavigationProvider = PleosNavigationProvider(context.applicationContext)
    fun cabinSource(context: Context): CabinSource? = runCatching { PleosCabinSource(context.applicationContext) }.onFailure { Log.w(TAG, "Vehicle SDK 초기화 실패", it) }.getOrNull()
    fun speaker(context: Context): Speaker? = runCatching { PleosSpeaker(context.applicationContext) }.onFailure { Log.w(TAG, "TTS 초기화 실패", it) }.getOrNull()
    fun statusText(): String = "Pleos SDK 포함 빌드 · NaviHelper·Vehicle·TextToSpeech 연동"
}

// ─────────────────────────── NaviHelper: 목적지·경유지·편한 길·도착 ───────────────────────────
private class PleosNavigationProvider(context: Context) : NavigationProvider {
    override val provenance = Provenance.REAL
    private val navi = NaviHelper(context)
    @Volatile private var lastDriving: DrivingInfo? = null
    @Volatile private var lastDestinationName: String? = null
    @Volatile var arrived: DestinationArrivedInfo? = null
        private set

    private val listener = object : NaviHelperEventListener {
        override fun onDrivingInfo(drivingInfo: DrivingInfo) { lastDriving = drivingInfo }
        override fun onDestinationArrived(destinationArrivedInfo: DestinationArrivedInfo) { arrived = destinationArrivedInfo }
        override fun onRouteCancelled() { lastDriving = null }
        override fun onError(errorCode: NaviErrorCode) { Log.w("MungRoadPleos", "NaviHelper 오류: $errorCode") }
    }

    init {
        navi.initialize({ navi.addListener(listener) }, { e -> Log.w("MungRoadPleos", "NaviHelper 초기화 실패", e) })
    }

    override suspend fun currentRoute(current: GeoPoint?): RouteSnapshot? {
        val d = lastDriving?.destination ?: return null
        // DrivingState.distance(m)·duration(초) — 단위는 에뮬레이터에서 확인 필요
        return RouteSnapshot(
            destination = com.mungroad.providers.Destination(d.name.ifBlank { lastDestinationName ?: "목적지" }, null),
            path = emptyList(),
            remainingDistanceKm = d.distance / 1000.0,
            etaEpochMillis = System.currentTimeMillis() + d.duration * 1000L,
            isEstimated = false,
            provenance = Provenance.REAL,
        )
    }

    override suspend fun guideTo(name: String, point: GeoPoint, preferWaypoint: Boolean): NavRequestResult = runCatching {
        val poiId = "mungroad-${(name + point.latitude + point.longitude).hashCode()}"
        if (preferWaypoint) {
            navi.addWaypoint(RequestWaypointInfo(
                latitude = point.latitude, longitude = point.longitude, poiName = name,
                waypointIndex = WaypointIndex.FIRST, poiId = poiId, address = name, poiSubId = "0",
            ))
        } else {
            lastDestinationName = name
            // 반려견이 탄 날 기본 경로 옵션: 편한 길(RouteOption.COMFORTABLE)
            navi.requestRoute(RouteInfo(
                latitude = point.latitude, longitude = point.longitude, poiName = name, poiId = poiId,
                poiSubId = "0", address = name, routeOption = RouteOption.COMFORTABLE,
            ))
        }
        // 성공 여부는 리스너 콜백으로 확정(요청 성공 ≠ 경로 탐색 완료)
        if (preferWaypoint) NavRequestResult.WaypointAdded else NavRequestResult.RouteRequested
    }.getOrElse { NavRequestResult.Failed("내비 요청 실패: ${it.message}") }

    fun changeToComfortable() = runCatching { navi.changeRouteOption(RouteOption.COMFORTABLE) }
}

// ─────────────────────────── Vehicle SDK: 창문·문·에어컨·방향지시등 ───────────────────────────
private class PleosCabinSource(context: Context) : CabinSource {
    private val vehicle = Vehicle(context).also { it.initialize() }
    private val rearWindows = listOf(WindowValue.ROW_2_LEFT, WindowValue.ROW_2_RIGHT)
    private val rearDoors = listOf(DoorValue.ROW_2_LEFT, DoorValue.ROW_2_RIGHT)
    private val driverSeat = SeatArea(SeatValue.ROW_1_LEFT)

    @Volatile override var capabilities = CabinCapabilities()
        private set

    init {
        // 도메인별 지원 여부를 한 번 확인(차종별로 다름). 실패하면 해당 안내만 끔
        vehicle.getWindow().checkWindowPositionCapabilities({ m -> capabilities = capabilities.copy(window = rearWindows.any { v -> m.keys.any { it.values.contains(v) } }) }, { capabilities = capabilities.copy(window = false) })
        vehicle.getDoor().checkDoorPositionCapabilities({ m -> capabilities = capabilities.copy(door = rearDoors.any { v -> m.keys.any { it.values.contains(v) } }) }, { capabilities = capabilities.copy(door = false) })
        vehicle.getHVAC().checkHvacAcCapabilities({ l -> capabilities = capabilities.copy(hvac = l.isNotEmpty(), hvacControl = l.isNotEmpty()) }, { capabilities = capabilities.copy(hvac = false, hvacControl = false) })
        vehicle.getTurnSignal().checkTurnSignalStateCapabilities({ _ -> capabilities = capabilities.copy(turnSignal = true) }, { capabilities = capabilities.copy(turnSignal = false) })
    }

    override fun states(): Flow<CabinState> = callbackFlow {
        var s = CabinState()
        fun emit(n: CabinState) { s = n; trySend(n) }
        val doorPos = mutableMapOf<DoorValue, Int>()
        val doorListeners = rearDoors.map { v ->
            v to object : DoorPositionListener {
                override fun onPositionUpdated(p: Int?) { doorPos[v] = p ?: 0; emit(s.copy(rearDoorOpen = doorPos.values.any { it > 0 })) }
                override fun onFailed(e: Exception) {}
            }
        }
        doorListeners.forEach { (v, l) -> runCatching { vehicle.getDoor().registerDoorPosition(DoorArea(v), l) } }
        val acListener = object : HvacAcStateListener {
            override fun onHvacAcStateUpdated(on: Boolean?) { emit(s.copy(acOn = on)) }
            override fun onFailed(e: Exception) {}
        }
        runCatching { vehicle.getHVAC().registerHvacAcState(driverSeat, acListener) }
        val turnListener = object : TurnSignalStateListener {
            override fun onTurnSignalStateUpdated(v: TurnSignalValue) { emit(s.copy(turnSignal = v != TurnSignalValue.OFF && v != TurnSignalValue.UNKNOWN)) }
            override fun onFailed(e: Exception) {}
        }
        runCatching { vehicle.getTurnSignal().registerTurnSignalState(turnListener) }
        // 창문 위치는 변경 리스너가 없어 주기적으로 조회(5초)
        val poll = launch {
            while (true) {
                if (capabilities.window) {
                    val pos = rearWindows.map { v -> suspendCancellableCoroutine<Int?> { c -> vehicle.getWindow().getCurrentWindowPosition(WindowArea(v), { p -> if (c.isActive) c.resume(p) }, { if (c.isActive) c.resume(null) }) } }
                    emit(s.copy(rearWindowOpenPct = pos.filterNotNull().maxOrNull()))
                }
                delay(5_000)
            }
        }
        awaitClose {
            poll.cancel()
            doorListeners.forEach { (v, l) -> runCatching { vehicle.getDoor().unregisterDoorPosition(DoorArea(v), l) } }
            runCatching { vehicle.getHVAC().unregisterHvacAcState(driverSeat, acListener) }
            runCatching { vehicle.getTurnSignal().unregisterTurnSignalState(turnListener) }
        }
    }

    override suspend fun setAc(on: Boolean): Boolean = suspendCancellableCoroutine { c ->
        runCatching {
            vehicle.getHVAC().setHvacAc(driverSeat, on, { _, v -> if (c.isActive) c.resume(v == on) }, { if (c.isActive) c.resume(false) })
        }.onFailure { if (c.isActive) c.resume(false) }
    }

    override fun release() { runCatching { vehicle.release() } }
}

// ─────────────────────────── TextToSpeech(HYBRID: 네트워크가 불안정해도 온디바이스) ───────────────────────────
private class PleosSpeaker(context: Context) : Speaker {
    private val tts = TextToSpeech(context, Mode.HYBRID)
    @Volatile private var ready = false
    init {
        tts.initialize(object : OnInitializeListener {
            override fun onSuccess() { ready = true }
            override fun onFailure(errorType: ErrorType) { Log.w("MungRoadPleos", "TTS 초기화 실패: $errorType") }
        })
    }
    override fun speak(text: String, interrupt: Boolean) { if (ready) runCatching { tts.speak(text, interrupt) } }
    override fun stop() { runCatching { tts.stop() } }
    override fun release() { runCatching { tts.release() } }
}
