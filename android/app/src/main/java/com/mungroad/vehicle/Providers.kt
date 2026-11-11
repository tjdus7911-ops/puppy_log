package com.mungroad.vehicle

import android.Manifest
import android.annotation.SuppressLint
import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import com.mungroad.data.local.DataSource
import com.mungroad.domain.Motion
import com.mungroad.domain.VehicleSample
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.currentCoroutineContext

// ---------------------------------------------------------------------------
// 1) 기기 위치 (Android 표준 LocationManager — Google Play 서비스 의존 없음)
// ---------------------------------------------------------------------------
class AndroidLocationDataProvider(private val context: Context) : VehicleDataProvider {
    override val source = DataSource.DEVICE_LOCATION
    override val isSimulated = false
    override val capabilities = VehicleDataProvider.Capabilities(location = true, speed = true, motionState = false, parkingState = false)
    override fun now() = System.currentTimeMillis()

    @SuppressLint("MissingPermission")
    override fun samples(): Flow<VehicleSample> = callbackFlow {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            close(ProviderUnavailable.PermissionDenied()); return@callbackFlow
        }
        val lm = context.getSystemService(LocationManager::class.java)
        val listener = LocationListener { loc: Location ->
            trySend(
                VehicleSample(
                    timestamp = loc.time, latitude = loc.latitude, longitude = loc.longitude,
                    accuracyM = if (loc.hasAccuracy()) loc.accuracy else null,
                    speedKmh = if (loc.hasSpeed()) loc.speed * 3.6f else null,
                    motion = Motion.UNKNOWN,
                ),
            )
        }
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, listener, Looper.getMainLooper())
        awaitClose { lm.removeUpdates(listener) }
    }
}

// ---------------------------------------------------------------------------
// 2) Pleos Connect 차량
//    Pleos 공식 문서의 API 정책(AAOS Alignment): 표준 AAOS API가 있으면 그것을 우선 사용.
//    → 기어(GEAR_SELECTION)·차속(PERF_VEHICLE_SPEED, m/s)은 AAOS CarPropertyManager 로 읽습니다.
//    → 위치는 공식 문서상 FusedLocation SDK 지원 여부가 차종마다 달라(isSupported 로 확인)
//      현재는 플랫폼 위치를 사용하고, FusedLocation SDK 연동은 TODO(verify-sdk) 로 남깁니다.
//    ⚠ 실제 Pleos Connect Emulator 에서 검증하지 못했습니다.
// ---------------------------------------------------------------------------
class PleosVehicleDataProvider(private val context: Context) : VehicleDataProvider {
    override val source = DataSource.PLEOS_VEHICLE
    override val isSimulated = false
    override val capabilities = VehicleDataProvider.Capabilities(location = true, speed = true, motionState = true, parkingState = true)
    override fun now() = System.currentTimeMillis()

    @Volatile private var gear: Int? = null
    @Volatile private var speedKmh: Float? = null

    @SuppressLint("MissingPermission")
    override fun samples(): Flow<VehicleSample> = callbackFlow {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
            close(ProviderUnavailable.NotSupported("차량(Android Automotive) 환경이 아니에요.")); return@callbackFlow
        }
        val car = Car.createCar(context)
        val pm = car.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager
        var last: Location? = null

        fun motion(): Motion = when (gear) {
            VehicleGear.GEAR_PARK -> Motion.PARKED
            null -> Motion.UNKNOWN
            else -> if ((speedKmh ?: 0f) >= 5f) Motion.MOVING else Motion.STOPPED
        }
        fun emit() {
            val l = last
            trySend(VehicleSample(System.currentTimeMillis(), l?.latitude, l?.longitude, l?.accuracy, speedKmh, motion()))
        }

        val cb = object : CarPropertyManager.CarPropertyEventCallback {
            override fun onChangeEvent(value: CarPropertyValue<*>) {
                if (value.status != CarPropertyValue.STATUS_AVAILABLE) return
                when (value.propertyId) {
                    VehiclePropertyIds.GEAR_SELECTION -> gear = value.value as Int
                    VehiclePropertyIds.PERF_VEHICLE_SPEED -> speedKmh = (value.value as Float) * 3.6f
                }
                emit()
            }
            override fun onErrorEvent(propId: Int, zone: Int) { /* 해당 속성 미지원 → UNKNOWN 으로 동작 */ }
        }
        pm.registerCallback(cb, VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE)
        pm.registerCallback(cb, VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_NORMAL)

        // TODO(verify-sdk): Pleos FusedLocation SDK — 공식 문서에 initialize()/release(),
        //  registerFusedLocationCallback()/unregisterFusedLocationCallback(), isSupported() 가 명시되어 있으나
        //  정확한 패키지·시그니처는 에뮬레이터 연결 후 확인하여 교체합니다. 지금은 플랫폼 위치를 사용합니다.
        val lm = context.getSystemService(LocationManager::class.java)
        val ll = LocationListener { loc -> last = loc; emit() }
        val hasLoc = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasLoc) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, ll, Looper.getMainLooper())

        awaitClose {
            pm.unregisterCallback(cb)
            if (hasLoc) lm.removeUpdates(ll)
            car.disconnect()
        }
    }
}

// ---------------------------------------------------------------------------
// 3) 데모 시뮬레이터 (웹 DemoVehicleDataProvider 와 같은 시나리오)
// ---------------------------------------------------------------------------
class DemoVehicleDataProvider(startTime: Long, @Volatile var speedMultiplier: Int = 60) : VehicleDataProvider {
    override val source = DataSource.DEMO
    override val isSimulated = true
    override val capabilities = VehicleDataProvider.Capabilities(location = true, speed = true, motionState = true, parkingState = true)

    private var simTime = startTime
    private var km = 0.0
    private var speed = 0.0
    @Volatile private var resting = false
    override fun now() = simTime
    override fun onRestChanged(resting: Boolean) { this.resting = resting }

    override fun samples(): Flow<VehicleSample> = flow {
        var sinceSample = 0.0
        while (currentCoroutineContext().isActive && km < DemoRoute.totalKm) {
            delay(250)
            repeat(maxOf(1, speedMultiplier / 4)) {
                simTime += 1000
                val target = if (resting) 0.0 else DemoRoute.targetSpeed(km)
                speed += (target - speed).coerceIn(-6.0, 6.0)
                km = minOf(DemoRoute.totalKm, km + speed / 3600)
                sinceSample += 1
                if (sinceSample >= 5) {
                    sinceSample = 0.0
                    val (lat, lng) = DemoRoute.pointAt(km)
                    emit(VehicleSample(simTime, lat, lng, 8f, speed.toFloat(), if (resting) Motion.PARKED else if (speed >= 1) Motion.MOVING else Motion.STOPPED))
                }
            }
        }
        val (lat, lng) = DemoRoute.pointAt(km)
        emit(VehicleSample(simTime, lat, lng, 8f, 0f, Motion.PARKED))
    }
}

/** 웹 web/src/vehicle/demoRoute.ts 와 같은 근사 경로(데모 전용) */
object DemoRoute {
    private val pts = listOf(
        37.5665 to 126.978, 37.5172 to 127.0473, 37.4685 to 127.039, 37.4 to 127.1, 37.285 to 127.106,
        37.24 to 127.2, 37.23 to 127.28, 37.25 to 127.46, 37.28 to 127.63, 37.31 to 127.82, 37.38 to 127.92,
        37.46 to 128.12, 37.54 to 128.33, 37.63 to 128.56, 37.68 to 128.72, 37.71 to 128.8, 37.7519 to 128.8761,
        37.7956 to 128.9083,
    )
    private val cum = pts.runningFoldIndexed(0.0) { i, acc, p ->
        if (i == 0) 0.0 else acc + com.mungroad.domain.TripEngine.haversineKm(pts[i - 1].first, pts[i - 1].second, p.first, p.second)
    }.drop(1)
    val totalKm = cum.last()

    fun targetSpeed(km: Double) = when {
        km < 18 -> 38.0
        km < totalKm - 32 -> 96.0
        km < totalKm - 12 -> 72.0
        else -> 36.0
    }

    fun pointAt(km: Double): Pair<Double, Double> {
        val d = km.coerceIn(0.0, totalKm)
        var i = 1
        while (i < cum.size - 1 && cum[i] < d) i++
        val t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]).coerceAtLeast(1e-9)
        val a = pts[i - 1]; val b = pts[i]
        return (a.first + (b.first - a.first) * t) to (a.second + (b.second - a.second) * t)
    }
}
