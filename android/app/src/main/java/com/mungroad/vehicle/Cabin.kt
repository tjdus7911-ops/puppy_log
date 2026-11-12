package com.mungroad.vehicle

import kotlinx.coroutines.flow.Flow

/**
 * 반려견 탑승 안전 안내용 차량 상태(웹 domain/cabin.ts 와 같은 모델).
 *  - Vehicle SDK: Window(뒷창 위치) · Door(뒷문 위치) · HVAC(에어컨) · TurnSignal · Brake
 *  - AAOS 표준 속성: ENV_OUTSIDE_TEMPERATURE(외기 온도) · IGNITION_STATE(시동)
 * 지원하지 않는 값은 null 이고, 지원 여부(capabilities)가 false 인 안내는 끕니다.
 */
data class CabinState(
    val rearWindowOpenPct: Int? = null,
    val rearDoorOpen: Boolean? = null,
    val acOn: Boolean? = null,
    val outsideTempC: Float? = null,
    val turnSignal: Boolean? = null,
    val vehicleWarning: Boolean? = null,
    val ignitionOn: Boolean? = null,
    val parkingBrake: Boolean? = null,
)

data class CabinCapabilities(
    val window: Boolean = false,
    val door: Boolean = false,
    val hvac: Boolean = false,
    val hvacControl: Boolean = false,
    val outsideTemp: Boolean = false,
    val turnSignal: Boolean = false,
    val ignition: Boolean = false,
    /** 펫 모드 사양(앱이 실행하지 않고 안내만) — SDK에 조회 API가 없어 차량 설정에서 확인 */
    val petMode: Boolean = false,
)

/** 차량 탑승 공간 상태 공급원. Pleos 빌드에서는 PleosBindings 가, 그 외에는 null(미지원) */
interface CabinSource {
    val capabilities: CabinCapabilities
    fun states(): Flow<CabinState>
    /** 에어컨 켜기 — 보호자가 동의했을 때만 호출. 실패하면 false */
    suspend fun setAc(on: Boolean): Boolean
    fun release()
}

/** 음성 안내(Pleos TextToSpeech, 없으면 Android TextToSpeech) */
interface Speaker {
    fun speak(text: String, interrupt: Boolean = false)
    fun stop()
    fun release()
}
