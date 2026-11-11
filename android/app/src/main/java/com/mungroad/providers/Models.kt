package com.mungroad.providers

import com.mungroad.data.local.PlaceCategory

// 요청서(UI 개편) 13장의 Provider 들이 주고받는 모델. 웹 프로토타입과 같은 의미를 갖습니다.

data class GeoPoint(val lat: Double, val lng: Double)

/** 데이터 출처. UI 는 REAL 이 아니면 반드시 배지를 붙입니다. */
enum class Provenance { REAL, DEMO, SAMPLE, UNAVAILABLE }

// ── 내비게이션 ───────────────────────────────────────
data class Destination(val name: String, val point: GeoPoint?)

data class RouteSnapshot(
    val destination: Destination?,
    val path: List<GeoPoint>,
    val remainingDistanceKm: Double?,
    /** 내비가 준 값이면 REAL, 앱이 남은 거리/평균속도로 추정하면 isEstimated=true */
    val etaEpochMillis: Long?,
    val isEstimated: Boolean,
    val provenance: Provenance,
)

sealed interface NavRequestResult {
    data object RouteRequested : NavRequestResult
    data object WaypointAdded : NavRequestResult
    data class OpenedExternalApp(val appName: String) : NavRequestResult
    data class Failed(val reason: String) : NavRequestResult
}

// ── 도로 위험 정보 ──────────────────────────────────
enum class HazardType { ACCIDENT, CONSTRUCTION, DEBRIS, CONGESTION, WEATHER, OTHER }

data class Hazard(
    val id: String,
    val type: HazardType,
    val point: GeoPoint,
    val roadName: String?,
    val message: String?,
    val laneInfo: String?, // 차로 통제 정보(제공되는 경우만)
    val startedAt: Long?,
    val provenance: Provenance,
    val source: String, // 예: "ITS 국가교통정보센터", "데모"
)

// ── 반려견 동반 장소 ────────────────────────────────
/** true/false = 데이터로 확인, null = 확인 필요 */
data class PetPolicy(
    val petAllowed: Boolean?,
    val smallDog: Boolean?,
    val largeDog: Boolean?,
    val indoor: Boolean?,
    val parking: Boolean?,
) {
    companion object { val UNKNOWN = PetPolicy(null, null, null, null, null) }
}

data class PetPlace(
    val id: String,
    val name: String,
    val category: PlaceCategory,
    val address: String,
    val point: GeoPoint,
    val phone: String?,
    val policy: PetPolicy,
    val provenance: Provenance,
    val sourceLabel: String,
)

fun Boolean?.policyLabel(yes: String = "가능", no: String = "불가") = when (this) {
    true -> yes
    false -> no
    null -> "확인 필요"
}
