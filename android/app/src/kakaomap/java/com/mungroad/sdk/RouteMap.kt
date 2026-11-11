package com.mungroad.sdk

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.KakaoMapSdk
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
import com.kakao.vectormap.route.RouteLineOptions
import com.kakao.vectormap.route.RouteLineSegment
import com.kakao.vectormap.route.RouteLineStyle
import com.kakao.vectormap.route.RouteLineStyles
import com.mungroad.BuildConfig
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.HazardType
import com.mungroad.providers.MapState

// 카카오맵 Android SDK v2 (mungroad.useKakaoMap=true 일 때만 컴파일)
// ⚠ 이 개발 환경에서는 SDK 를 내려받을 수 없어 컴파일·실행을 확인하지 못했습니다.
//   API 이름은 카카오맵 Android v2 레퍼런스(KakaoMapSdk.init, MapView.start, LabelManager, RouteLineManager)를 따랐습니다.
//   v2 SDK 는 arm64-v8a / armeabi-v7a 만 지원 → x86_64 에뮬레이터에서는 동작하지 않습니다.

const val MAP_SDK_ENABLED = true

fun initMapSdk(context: Context) {
    if (BuildConfig.KAKAO_NATIVE_APP_KEY.isNotBlank()) KakaoMapSdk.init(context, BuildConfig.KAKAO_NATIVE_APP_KEY)
}

private fun dot(color: Int, sizePx: Int = 36): Bitmap {
    val b = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val c = Canvas(b)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = 0xFFFFFFFF.toInt(); c.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, p)
    p.color = color; c.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 5, p)
    return b
}

private fun GeoPoint.ll(): LatLng = LatLng.from(lat, lng)

@Composable
fun RouteMap(state: MapState, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val holder = remember { arrayOfNulls<KakaoMap>(1) }
    val mapView = remember {
        MapView(context).also { mv ->
            mv.start(
                object : MapLifeCycleCallback() {
                    override fun onMapDestroy() {}
                    override fun onMapError(error: Exception) { /* 키 오류·네트워크 오류: 화면 상단 배지로 안내(TODO) */ }
                },
                object : KakaoMapReadyCallback() {
                    override fun onMapReady(map: KakaoMap) { holder[0] = map }
                },
            )
        }
    }
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> mapView.resume()
                Lifecycle.Event.ON_PAUSE -> mapView.pause()
                else -> Unit
            }
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }
    AndroidView(factory = { mapView }, modifier = modifier, update = { render(holder[0], state) })
}

private fun render(map: KakaoMap?, s: MapState) {
    map ?: return
    val routeLayer = map.routeLineManager?.layer ?: return
    val labelLayer = map.labelManager?.layer ?: return
    routeLayer.removeAll()
    labelLayer.removeAll()

    fun line(points: List<GeoPoint>, color: Int, width: Float) {
        if (points.size < 2) return
        val style = RouteLineStyles.from(RouteLineStyle.from(width, color))
        routeLayer.addRouteLine(RouteLineOptions.from(RouteLineSegment.from(points.map { it.ll() }, style)))
    }
    line(s.planned, 0x664D80E8, 10f)
    line(s.driven, 0xFF4D80E8.toInt(), 14f)

    fun label(p: GeoPoint, color: Int) = labelLayer.addLabel(LabelOptions.from(p.ll()).setStyles(LabelStyles.from(LabelStyle.from(dot(color)))))
    s.hazards.forEach {
        label(it.point, when (it.type) {
            HazardType.ACCIDENT -> 0xFFEF5350.toInt()
            HazardType.CONSTRUCTION -> 0xFFF5A623.toInt()
            HazardType.DEBRIS -> 0xFFF7C948.toInt()
            HazardType.CONGESTION -> 0xFF8E6BD6.toInt()
            else -> 0xFF74849A.toInt()
        })
    }
    s.places.forEach { label(it.point, 0xFF2BB673.toInt()) }
    s.destination?.let { label(it, 0xFF202D42.toInt()) }
    s.current?.let {
        label(it, 0xFF4D80E8.toInt())
        map.moveCamera(CameraUpdateFactory.newCenterPosition(it.ll(), 11))
    }
}
