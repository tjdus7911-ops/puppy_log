package com.mungroad.domain

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

// 웹 프로토타입 web/src/domain/tripEngine.ts 와 같은 규칙의 순수 Kotlin 포팅입니다.
// (웹 쪽은 단위 테스트 17개로 검증됨. 이 Kotlin 포팅은 아직 컴파일 검증 전)

enum class Motion { MOVING, STOPPED, PARKED, UNKNOWN }
enum class EngineStatus { DRIVING, STOPPED, RESTING, ENDED }

data class VehicleSample(
    val timestamp: Long,
    val latitude: Double?,
    val longitude: Double?,
    val accuracyM: Float?,
    val speedKmh: Float?,
    val motion: Motion,
)

data class Fix(val lat: Double, val lng: Double, val t: Long, val acc: Float?)

sealed interface EngineEvent {
    data class Point(val fix: Fix) : EngineEvent
    data class RestSoon(val minutesLeft: Int) : EngineEvent
    data class RestDue(val drivenMinutes: Int) : EngineEvent
    data class StatusChanged(val from: EngineStatus, val to: EngineStatus) : EngineEvent
}

data class EngineState(
    val status: EngineStatus = EngineStatus.STOPPED,
    val startTime: Long,
    val lastTick: Long = startTime,
    val elapsedSec: Double = 0.0,
    val drivingSec: Double = 0.0,
    val drivingSinceRestSec: Double = 0.0,
    val distanceKm: Double = 0.0,
    val lastFix: Fix? = null,
    val rejectedFixes: Int = 0,
    val restIntervalMin: Int,
    val restStartedAt: Long? = null,
    val restCount: Int = 0,
    val restTotalSec: Double = 0.0,
    val soonNotified: Boolean = false,
    val dueNotified: Boolean = false,
    val snoozeUntilSec: Double? = null,
)

object TripEngine {
    const val MOVING_SPEED_KMH = 5f
    const val SOON_BEFORE_MIN = 10
    const val SNOOZE_MIN = 15
    const val MAX_DRIVING_GAP_SEC = 30.0
    const val MAX_ACCURACY_M = 80f
    const val MAX_SPEED_KMH = 220.0
    const val MIN_MOVE_KM = 0.01

    fun haversineKm(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
        val r = 6371.0088
        val dLat = Math.toRadians(bLat - aLat)
        val dLng = Math.toRadians(bLng - aLng)
        val h = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(aLat)) * cos(Math.toRadians(bLat)) * sin(dLng / 2).let { it * it }
        return 2 * r * asin(min(1.0, sqrt(h)))
    }

    fun isValid(lat: Double, lng: Double) =
        lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0 &&
            !(kotlin.math.abs(lat) < 1e-6 && kotlin.math.abs(lng) < 1e-6)

    /** null = 버림, 값 = 더할 거리(km) */
    fun evaluateFix(prev: Fix?, next: Fix): Double? {
        if (!isValid(next.lat, next.lng)) return null
        if (next.acc != null && next.acc > MAX_ACCURACY_M) return null
        if (prev == null) return 0.0
        val dt = (next.t - prev.t) / 1000.0
        if (dt <= 0) return null
        val km = haversineKm(prev.lat, prev.lng, next.lat, next.lng)
        if (km < MIN_MOVE_KM) return null
        if (km / (dt / 3600) > MAX_SPEED_KMH) return null
        return km
    }

    private fun isMoving(s: VehicleSample) = when (s.motion) {
        Motion.MOVING -> true
        Motion.STOPPED, Motion.PARKED -> false
        Motion.UNKNOWN -> (s.speedKmh ?: 0f) >= MOVING_SPEED_KMH
    }

    fun step(prev: EngineState, sample: VehicleSample): Pair<EngineState, List<EngineEvent>> {
        if (prev.status == EngineStatus.ENDED) return prev to emptyList()
        val events = mutableListOf<EngineEvent>()
        var s = prev
        val dt = ((sample.timestamp - prev.lastTick) / 1000.0).coerceAtLeast(0.0)
        val lastTick = maxOf(prev.lastTick, sample.timestamp)
        s = s.copy(lastTick = lastTick, elapsedSec = (lastTick - s.startTime) / 1000.0)

        // 정차는 '일시 정차'일 뿐 자동으로 휴식이 되지 않습니다.
        if (s.status != EngineStatus.RESTING) {
            val next = if (isMoving(sample)) EngineStatus.DRIVING else EngineStatus.STOPPED
            if (next != s.status) {
                events += EngineEvent.StatusChanged(s.status, next)
                s = s.copy(status = next)
            }
        }
        if (s.status == EngineStatus.DRIVING && prev.status == EngineStatus.DRIVING) {
            val add = min(dt, MAX_DRIVING_GAP_SEC)
            s = s.copy(drivingSec = s.drivingSec + add, drivingSinceRestSec = s.drivingSinceRestSec + add)
        }
        if (sample.latitude != null && sample.longitude != null) {
            val fix = Fix(sample.latitude, sample.longitude, sample.timestamp, sample.accuracyM)
            val add = evaluateFix(s.lastFix, fix)
            s = if (add != null) {
                events += EngineEvent.Point(fix)
                s.copy(distanceKm = s.distanceKm + add, lastFix = fix)
            } else s.copy(rejectedFixes = s.rejectedFixes + 1)
        }
        val (withReminder, rem) = checkReminder(s)
        return withReminder to (events + rem)
    }

    private fun checkReminder(s: EngineState): Pair<EngineState, List<EngineEvent>> {
        if (s.status == EngineStatus.RESTING || s.restIntervalMin <= 0) return s to emptyList()
        val interval = s.restIntervalMin * 60.0
        val driven = s.drivingSinceRestSec
        s.snoozeUntilSec?.let { until ->
            return if (driven >= until) s.copy(snoozeUntilSec = null) to listOf(EngineEvent.RestDue((driven / 60).toInt()))
            else s to emptyList()
        }
        val out = mutableListOf<EngineEvent>()
        var st = s
        val soonAt = interval - SOON_BEFORE_MIN * 60
        if (!st.soonNotified && soonAt > 0 && driven >= soonAt && driven < interval) {
            st = st.copy(soonNotified = true)
            out += EngineEvent.RestSoon(kotlin.math.ceil((interval - driven) / 60).toInt())
        }
        if (!st.dueNotified && driven >= interval) {
            st = st.copy(dueNotified = true, soonNotified = true)
            out += EngineEvent.RestDue((driven / 60).toInt())
        }
        return st to out
    }

    fun snooze(s: EngineState, minutes: Int = SNOOZE_MIN) =
        s.copy(dueNotified = true, soonNotified = true, snoozeUntilSec = s.drivingSinceRestSec + minutes * 60)

    /** 사용자가 명시적으로 시작할 때만. 이미 휴식 중이면 null(중복 방지) */
    fun startRest(s: EngineState, at: Long): EngineState? =
        if (s.status == EngineStatus.RESTING || s.status == EngineStatus.ENDED) null
        else s.copy(status = EngineStatus.RESTING, restStartedAt = at)

    fun endRest(s: EngineState, at: Long): EngineState {
        val started = s.restStartedAt ?: return s
        if (s.status != EngineStatus.RESTING) return s
        val dur = ((at - started) / 1000.0).coerceAtLeast(0.0)
        return s.copy(
            status = EngineStatus.STOPPED, restStartedAt = null, restCount = s.restCount + 1,
            restTotalSec = s.restTotalSec + dur, drivingSinceRestSec = 0.0,
            soonNotified = false, dueNotified = false, snoozeUntilSec = null,
        )
    }
}
