package com.mungroad.sdk

import android.content.Context
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.NavRequestResult
import com.mungroad.providers.NavigationProvider
import com.mungroad.providers.Provenance
import com.mungroad.providers.RouteSnapshot

/**
 * Pleos NaviHelper 연동 (mungroad.usePleosSdk=true 일 때만 컴파일).
 *
 * 공식 문서에서 확인한 범위
 *  - NaviHelper 는 SDK 진입점: initialize() → addListener() → 경로 요청/정보 조회 → 콜백 → removeListener()/release()
 *  - 기능: 목적지 설정·확인·취소, 경로 옵션 변경·재탐색, 경유지 추가·조회·삭제, 경로/주행 상태 이벤트, 내비 정보 조회·내비 화면 요청
 *  - 데이터 클래스(ai.pleos.playground.navi.data): RouteInfo, DrivingInfo, DrivingState, TBTInfo,
 *    TrafficEventInfo, TrafficCongestionInfo, TrafficCongestionSummary, TrafficStatus, WaypointInfo 등
 *
 * 확인하지 못한 범위 → 아래 TODO(verify-sdk) 를 AAR 시그니처로 채웁니다.
 *   ./scripts/dump-pleos-api.sh 로 AAR 의 public API 를 출력한 뒤 메서드 이름·파라미터를 맞추세요.
 *   (임의 시그니처로 호출 코드를 작성하지 않았습니다. 그래서 지금은 null/Failed 를 돌려줍니다.)
 */
object PleosBindings {
    const val ENABLED = true
    fun navigationProvider(context: Context): NavigationProvider = PleosNavigationProvider(context)
    fun statusText(): String = "Pleos SDK 포함 빌드 · NaviHelper 시그니처 확인 필요"
}

private class PleosNavigationProvider(private val context: Context) : NavigationProvider {
    override val provenance = Provenance.REAL

    // TODO(verify-sdk): val navi = NaviHelper(...) ; navi.initialize(...) ; navi.addListener(listener)
    //   리스너에서 목적지(RouteInfo/목적지 정보), 남은 거리·시간(DrivingInfo), 교통 이벤트(TrafficEventInfo)를 받아
    //   아래 currentRoute() 와 TrafficInfoProvider 로 넘깁니다.

    override suspend fun currentRoute(current: GeoPoint?): RouteSnapshot? {
        // TODO(verify-sdk): NaviHelper 의 목적지/경로 정보 조회 결과를 RouteSnapshot 으로 변환
        //   remainingDistanceKm·etaEpochMillis 를 내비가 주면 isEstimated=false, provenance=REAL
        return null // null → 앱에서 목적지 직접 설정(대체 흐름)
    }

    override suspend fun guideTo(name: String, point: GeoPoint, preferWaypoint: Boolean): NavRequestResult {
        // TODO(verify-sdk): preferWaypoint 이면 경유지 추가 API, 실패 시 목적지 설정(경로 요청) API 호출
        return NavRequestResult.Failed("NaviHelper 호출부가 아직 연결되지 않았어요(시그니처 확인 필요).")
    }
}
