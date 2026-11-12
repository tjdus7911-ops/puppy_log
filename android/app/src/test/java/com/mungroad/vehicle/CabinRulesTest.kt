package com.mungroad.vehicle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CabinRulesTest {
    private val caps = CabinCapabilities(window = true, door = true, hvac = true, hvacControl = true, outsideTemp = true, turnSignal = true, ignition = true)
    private fun ctx(moving: Boolean = true, parked: Boolean = false, arrived: Boolean = false) =
        CabinContext(moving, parked, resting = false, arrived = arrived, petCall = "사슴이", brachy = false, caps = caps, now = 0)

    @Test fun windowOnceUntilClosed() {
        val open = CabinState(rearWindowOpenPct = 80)
        val (p1, m1) = CabinRules.evaluate(open, CabinMemo(), ctx())
        assertEquals(CabinPromptKind.WINDOW, p1?.kind)
        assertNull(CabinRules.evaluate(open, m1, ctx()).first)
        val (_, m2) = CabinRules.evaluate(CabinState(rearWindowOpenPct = 10), m1, ctx())
        assertEquals(CabinPromptKind.WINDOW, CabinRules.evaluate(open, m2, ctx()).first?.kind)
    }
    @Test fun heatAsksWhenAcOff() {
        val p = CabinRules.evaluate(CabinState(outsideTempC = 30f, acOn = false), CabinMemo(), ctx()).first
        assertEquals(CabinPromptKind.HEAT, p?.kind)
        assertEquals("바깥이 30도예요. 사슴이를 위해 에어컨을 켤까요?", p?.text)
    }
    @Test fun doorOpenWhenParkedAsksRest() {
        val p = CabinRules.evaluate(CabinState(rearDoorOpen = true), CabinMemo(), ctx(moving = false, parked = true)).first
        assertEquals(CabinPromptKind.DOOR_REST, p?.kind)
    }
    @Test fun leaveCheckWhenIgnitionOffWithoutDoor() {
        val p = CabinRules.evaluate(CabinState(ignitionOn = false, rearDoorOpen = false), CabinMemo(), ctx(moving = false, parked = true, arrived = true)).first
        assertEquals(CabinPromptKind.LEAVE_CHECK, p?.kind)
    }
    @Test fun noLeaveCheckIfDoorOpenedThisStop() {
        val (_, m) = CabinRules.evaluate(CabinState(rearDoorOpen = true, ignitionOn = true), CabinMemo(), ctx(moving = false, parked = true, arrived = true))
        assertNull(CabinRules.evaluate(CabinState(rearDoorOpen = false, ignitionOn = false), m, ctx(moving = false, parked = true, arrived = true)).first)
    }
}
