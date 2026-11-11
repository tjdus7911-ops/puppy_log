package com.mungroad.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TripEngineTest {
    private val t0 = 1_700_000_000_000L
    private fun s(sec: Int, m: Motion) = VehicleSample(t0 + sec * 1000L, null, null, null, if (m == Motion.MOVING) 90f else 0f, m)

    private fun drive(start: EngineState, from: Int, to: Int, m: Motion = Motion.MOVING): Pair<EngineState, List<EngineEvent>> {
        var st = start
        val ev = mutableListOf<EngineEvent>()
        for (t in from..to step 5) { val (n, e) = TripEngine.step(st, s(t, m)); st = n; ev += e }
        return st to ev
    }

    @Test fun drivingAndElapsedAreSeparate() {
        var st = drive(EngineState(startTime = t0, restIntervalMin = 90), 0, 600).first
        st = drive(st, 605, 1200, Motion.STOPPED).first
        assertEquals(600.0, st.drivingSec, 0.1)
        assertEquals(1200.0, st.elapsedSec, 0.1)
        assertEquals(0, st.restCount) // 정차는 휴식이 아님
    }

    @Test fun remindersFireOnce() {
        val (_, ev) = drive(EngineState(startTime = t0, restIntervalMin = 90), 0, 100 * 60)
        assertEquals(1, ev.count { it is EngineEvent.RestSoon })
        assertEquals(1, ev.count { it is EngineEvent.RestDue })
    }

    @Test fun restCannotStartTwice() {
        val st = drive(EngineState(startTime = t0, restIntervalMin = 90), 0, 60).first
        val r = TripEngine.startRest(st, t0 + 70_000)!!
        assertNull(TripEngine.startRest(r, t0 + 71_000))
    }
}
