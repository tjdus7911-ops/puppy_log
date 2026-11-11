package com.mungroad.vehicle

import com.mungroad.data.local.DataSource
import com.mungroad.domain.VehicleSample
import kotlinx.coroutines.flow.Flow

/**
 * 차량 데이터 접근 계층(요청서 15장).
 * 한 여행 세션에는 Provider 하나만 연결해 실제 데이터와 시뮬레이션이 섞이지 않게 합니다.
 *
 * 구현체
 *  - DemoVehicleDataProvider     : 서울→강릉 가상 주행 (isSimulated = true, 기록은 isDemo = true)
 *  - AndroidLocationDataProvider : 플랫폼 LocationManager (기기 GPS)
 *  - PleosVehicleDataProvider    : Pleos Connect 차량 — AAOS 표준 속성(기어·차속) + 위치
 */
interface VehicleDataProvider {
    val source: DataSource
    val isSimulated: Boolean
    val capabilities: Capabilities

    /** 데모는 시뮬레이션 시각, 나머지는 System.currentTimeMillis() */
    fun now(): Long

    /** 샘플 스트림. 수집을 취소하면 내부 리스너도 해제되어야 합니다. */
    fun samples(): Flow<VehicleSample>

    /** 사용자가 휴식을 시작/종료했음을 알림(데모는 이때 차를 세움) */
    fun onRestChanged(resting: Boolean) {}

    data class Capabilities(
        val location: Boolean,
        val speed: Boolean,
        val motionState: Boolean,
        val parkingState: Boolean,
    )
}

sealed class ProviderUnavailable(message: String) : Exception(message) {
    class PermissionDenied : ProviderUnavailable("위치 권한이 허용되지 않았어요.")
    class NotSupported(why: String) : ProviderUnavailable(why)
}
