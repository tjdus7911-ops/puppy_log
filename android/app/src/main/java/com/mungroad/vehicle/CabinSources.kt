package com.mungroad.vehicle

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import java.util.Locale

// ---------------------------------------------------------------------------
// AAOS 표준 속성: 외기 온도(ENV_OUTSIDE_TEMPERATURE) · 시동(IGNITION_STATE) · 주차 브레이크(PARKING_BRAKE_ON)
// Pleos API 정책(AAOS Alignment)에 따라 표준 속성이 있는 값은 CarPropertyManager 로 읽습니다.
// ---------------------------------------------------------------------------
class AaosCabinSource(context: Context) : CabinSource {
    private val car: Car? = if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) runCatching { Car.createCar(context) }.getOrNull() else null
    private val pm: CarPropertyManager? = car?.let { runCatching { it.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager }.getOrNull() }

    private fun supported(id: Int) = pm?.let { runCatching { it.getCarPropertyConfig(id) != null }.getOrDefault(false) } ?: false

    override val capabilities = CabinCapabilities(
        outsideTemp = supported(VehiclePropertyIds.ENV_OUTSIDE_TEMPERATURE),
        ignition = supported(VehiclePropertyIds.IGNITION_STATE),
    )
    private val brake = supported(VehiclePropertyIds.PARKING_BRAKE_ON)

    override fun states(): Flow<CabinState> {
        val m = pm ?: return flowOf(CabinState())
        return callbackFlow {
            var s = CabinState()
            val cb = object : CarPropertyManager.CarPropertyEventCallback {
                override fun onChangeEvent(v: CarPropertyValue<*>) {
                    if (v.status != CarPropertyValue.STATUS_AVAILABLE) return
                    s = when (v.propertyId) {
                        VehiclePropertyIds.ENV_OUTSIDE_TEMPERATURE -> s.copy(outsideTempC = (v.value as? Float))
                        // VehicleIgnitionState: 0 UNDEFINED, 1 LOCK, 2 OFF, 3 ACC, 4 ON, 5 START
                        VehiclePropertyIds.IGNITION_STATE -> s.copy(ignitionOn = (v.value as? Int)?.let { it >= 4 })
                        VehiclePropertyIds.PARKING_BRAKE_ON -> s.copy(parkingBrake = v.value as? Boolean)
                        else -> s
                    }
                    trySend(s)
                }
                override fun onErrorEvent(propId: Int, zone: Int) {}
            }
            runCatching {
                if (capabilities.outsideTemp) m.registerCallback(cb, VehiclePropertyIds.ENV_OUTSIDE_TEMPERATURE, CarPropertyManager.SENSOR_RATE_ONCHANGE)
                if (capabilities.ignition) m.registerCallback(cb, VehiclePropertyIds.IGNITION_STATE, CarPropertyManager.SENSOR_RATE_ONCHANGE)
                if (brake) m.registerCallback(cb, VehiclePropertyIds.PARKING_BRAKE_ON, CarPropertyManager.SENSOR_RATE_ONCHANGE)
            }.onFailure { Log.w("MungRoad", "AAOS 속성 구독 실패(권한·미지원)", it) }
            awaitClose { runCatching { m.unregisterCallback(cb) } }
        }
    }

    override suspend fun setAc(on: Boolean) = false
    override fun release() { runCatching { car?.disconnect() } }
}

/** 여러 공급원(Pleos Vehicle SDK + AAOS 속성)을 하나로 합침. 값이 있는 쪽을 씀 */
class CombinedCabinSource(private val sources: List<CabinSource>) : CabinSource {
    override val capabilities: CabinCapabilities
        get() = sources.map { it.capabilities }.fold(CabinCapabilities()) { a, b ->
            CabinCapabilities(a.window || b.window, a.door || b.door, a.hvac || b.hvac, a.hvacControl || b.hvacControl, a.outsideTemp || b.outsideTemp, a.turnSignal || b.turnSignal, a.ignition || b.ignition, a.petMode || b.petMode)
        }

    override fun states(): Flow<CabinState> = combine(sources.map { it.states() }) { arr ->
        arr.fold(CabinState()) { a, b ->
            CabinState(
                b.rearWindowOpenPct ?: a.rearWindowOpenPct, b.rearDoorOpen ?: a.rearDoorOpen, b.acOn ?: a.acOn, b.outsideTempC ?: a.outsideTempC,
                b.turnSignal ?: a.turnSignal, b.vehicleWarning ?: a.vehicleWarning, b.ignitionOn ?: a.ignitionOn, b.parkingBrake ?: a.parkingBrake,
            )
        }
    }

    override suspend fun setAc(on: Boolean): Boolean = sources.firstOrNull { it.capabilities.hvacControl }?.setAc(on) ?: false
    override fun release() = sources.forEach { it.release() }
}

/** 데모: 화면의 '차량 상태 시뮬레이션' 버튼으로 상태를 바꿈(모든 도메인 지원으로 가정, 화면에 데모 표시) */
class DemoCabinSource : CabinSource {
    override val capabilities = CabinCapabilities(window = true, door = true, hvac = true, hvacControl = true, outsideTemp = true, turnSignal = true, ignition = true, petMode = true)
    val state = MutableStateFlow(CabinState(rearWindowOpenPct = 0, rearDoorOpen = false, acOn = false, outsideTempC = 22f, turnSignal = false, vehicleWarning = false, ignitionOn = true, parkingBrake = false))
    override fun states(): Flow<CabinState> = state
    override suspend fun setAc(on: Boolean): Boolean { state.update { it.copy(acOn = on) }; return true }
    override fun release() {}
    fun set(f: (CabinState) -> CabinState) = state.update(f)
}

/** Pleos TTS 가 없을 때의 대체: Android TextToSpeech */
class AndroidSpeaker(context: Context) : Speaker {
    @Volatile private var ok = false
    override val ready: Boolean get() = ok
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { st -> ok = st == TextToSpeech.SUCCESS }.also { t ->
        runCatching { t.language = Locale.KOREAN }
    }
    override fun speak(text: String, interrupt: Boolean) {
        runCatching { tts.language = Locale.KOREAN; tts.speak(text, if (interrupt) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "mungroad-${text.hashCode()}") }
    }
    override fun stop() { runCatching { tts.stop() } }
    override fun release() { runCatching { tts.shutdown() } }
}

/**
 * 주행 중 음성 우선순위(기획서 3장): 안전 → 반려견 휴식 → 동반 장소 → 정보. 한 번에 하나.
 * 방향지시등·차량 경고 중에는 새 안내를 미뤘다가(최대 30초) 끝나면 이어서 말합니다.
 */
enum class SpeechPriority { SAFETY, REST, PLACE, INFO }

class SpeechCenter(private val speaker: Speaker) {
    private data class Pending(val text: String, val p: SpeechPriority, val at: Long)
    private val queue = mutableListOf<Pending>()
    private var playing: SpeechPriority? = null
    private var playingUntil = 0L
    var held = false
        private set
    var muted = false

    @Synchronized
    fun speak(text: String, p: SpeechPriority = SpeechPriority.INFO) {
        if (muted) return
        val now = System.currentTimeMillis()
        val busy = playing != null && now < playingUntil
        if (held || (busy && p.ordinal > playing!!.ordinal)) {
            queue.removeAll { it.text == text }
            queue += Pending(text, p, now)
            while (queue.size > 3) queue.removeAt(0)
            return
        }
        play(text, p, interrupt = busy)
    }

    private fun play(text: String, p: SpeechPriority, interrupt: Boolean) {
        playing = p
        playingUntil = System.currentTimeMillis() + 1500 + text.length * 110L // 재생 시간 추정
        speaker.speak(text, interrupt)
    }

    @Synchronized
    fun setHold(h: Boolean) {
        if (held == h) return
        held = h
        if (!h) flush()
    }

    @Synchronized
    fun flush() {
        if (held) return
        val now = System.currentTimeMillis()
        queue.removeAll { now - it.at > 30_000 }
        queue.sortBy { it.p.ordinal }
        queue.firstOrNull()?.let { queue.removeAt(0); play(it.text, it.p, interrupt = false) }
    }

    fun release() { queue.clear(); speaker.release() }
}
