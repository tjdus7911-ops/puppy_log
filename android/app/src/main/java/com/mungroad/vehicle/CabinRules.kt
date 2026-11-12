package com.mungroad.vehicle

import kotlin.math.roundToInt

// 반려견 탑승 안전 안내 규칙 — 웹 web/src/domain/cabin.ts 와 같은 규칙.
//  - 창문·문은 상태만 읽고 움직이지 않습니다. 차량 제어는 '에어컨 켜기' 하나뿐이며 보호자가 동의할 때만 실행합니다.
//  - 보조 안내일 뿐 차량의 기본 안전 기능을 대신하지 않습니다. 기준 온도는 출시 전 수의사 자문으로 확정(초안).

enum class CabinPromptKind { WINDOW, HEAT, DOOR_REST, LEAVE_CHECK }

data class CabinPrompt(val kind: CabinPromptKind, val text: String, val ask: Boolean, val safety: Boolean, val at: Long)

data class CabinMemo(
    val windowNotified: Boolean = false,
    val heatAsked: Boolean = false,
    val doorAskedThisStop: Boolean = false,
    val lastDoorOpen: Boolean = false,
    val doorOpenedThisStop: Boolean = false,
    val lastIgnitionOn: Boolean = true,
)

data class CabinContext(
    val moving: Boolean,
    val parked: Boolean,
    val resting: Boolean,
    val arrived: Boolean,
    val petCall: String,
    val brachy: Boolean,
    val caps: CabinCapabilities,
    val now: Long,
)

object CabinRules {
    const val WINDOW_OPEN_PCT = 50
    const val WINDOW_CLOSED_PCT = 20
    const val HEAT_TEMP_C = 28f
    const val HEAT_TEMP_C_BRACHY = 25f

    val PET_MODE_STEPS = listOf(
        "기어를 'P'(주차)로 두세요. 주행 중에는 펫 모드가 실행되지 않아요.",
        "차량 홈 화면에서 펫 모드를 누르고 작동 온도를 정하세요.",
        "대기 화면에서 설정 온도를 확인한 뒤 내리세요.",
    )
    val PET_MODE_NOTES = listOf(
        "사양 적용 차량에서만 쓸 수 있고, 마이현대(블루링크) 가입과 통합계정 연동이 필요해요.",
        "배터리를 쓰는 기능이라 잔량이 낮으면 꺼질 수 있어요. 짧은 시간만 사용하세요.",
        "더운 날 장시간 두고 내리지 마세요.",
    )

    fun heatThreshold(brachy: Boolean) = if (brachy) HEAT_TEMP_C_BRACHY else HEAT_TEMP_C
    fun isHot(c: CabinState, brachy: Boolean) = c.outsideTempC?.let { it >= heatThreshold(brachy) } == true
    fun shouldHold(c: CabinState, caps: CabinCapabilities) = (caps.turnSignal && c.turnSignal == true) || c.vehicleWarning == true

    fun windowText(petCall: String) = "뒷좌석 창문이 많이 열려 있어요. ${petCall}가 머리를 내밀 수 있으니 조금 닫아 주세요."
    fun heatText(t: Float, petCall: String, canControl: Boolean) =
        if (canControl) "바깥이 ${t.roundToInt()}도예요. ${petCall}를 위해 에어컨을 켤까요?" else "바깥이 ${t.roundToInt()}도예요. ${petCall}를 위해 에어컨을 켜 주세요."
    const val DOOR_REST_TEXT = "휴식 시작할까요?"
    fun leaveCheckText(petCall: String, petMode: Boolean) =
        if (petMode) "${petCall}를 내리셨나요? 잠깐 차에 두고 내리면 펫 모드를 켜 주세요." else "${petCall}를 내리셨나요? 차 안에 혼자 두지 마세요."
    fun restHeatCare(petCall: String) = "더운 날이에요. ${petCall}에게 물을 주고 그늘에서 쉬어 가세요."

    /** 상태가 바뀔 때마다 호출. 새 안내(최대 하나)와 갱신된 기억. 우선순위: 내리기 전 확인 → 창문 → 더위 → 뒷문 휴식 확인 */
    fun evaluate(c: CabinState, memo: CabinMemo, ctx: CabinContext): Pair<CabinPrompt?, CabinMemo> {
        var m = memo
        if (ctx.moving) m = m.copy(doorAskedThisStop = false, doorOpenedThisStop = false)
        if (c.rearDoorOpen == true) m = m.copy(doorOpenedThisStop = true)
        val ignitionOff = c.ignitionOn == false && memo.lastIgnitionOn
        c.ignitionOn?.let { m = m.copy(lastIgnitionOn = it) }
        if (c.rearWindowOpenPct != null && c.rearWindowOpenPct <= WINDOW_CLOSED_PCT) m = m.copy(windowNotified = false)
        val doorOpened = c.rearDoorOpen == true && !memo.lastDoorOpen
        m = m.copy(lastDoorOpen = c.rearDoorOpen == true)

        if (ctx.caps.ignition && ctx.caps.door && ignitionOff && !m.doorOpenedThisStop && (ctx.parked || ctx.arrived)) {
            return CabinPrompt(CabinPromptKind.LEAVE_CHECK, leaveCheckText(ctx.petCall, ctx.caps.petMode), ask = true, safety = true, at = ctx.now) to m
        }
        if (ctx.arrived) return null to m
        if (ctx.caps.window && ctx.moving && !m.windowNotified && (c.rearWindowOpenPct ?: 0) > WINDOW_OPEN_PCT) {
            return CabinPrompt(CabinPromptKind.WINDOW, windowText(ctx.petCall), ask = false, safety = true, at = ctx.now) to m.copy(windowNotified = true)
        }
        if (ctx.caps.outsideTemp && ctx.caps.hvac && ctx.moving && !m.heatAsked && isHot(c, ctx.brachy) && c.acOn == false) {
            return CabinPrompt(CabinPromptKind.HEAT, heatText(c.outsideTempC!!, ctx.petCall, ctx.caps.hvacControl), ask = ctx.caps.hvacControl, safety = true, at = ctx.now) to m.copy(heatAsked = true)
        }
        if (ctx.caps.door && ctx.parked && !ctx.resting && doorOpened && !m.doorAskedThisStop) {
            return CabinPrompt(CabinPromptKind.DOOR_REST, DOOR_REST_TEXT, ask = true, safety = false, at = ctx.now) to m.copy(doorAskedThisStop = true)
        }
        return null to m
    }
}
