package com.mungroad.sdk

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.providers.GeoPoint
import com.mungroad.providers.MapState

const val MAP_SDK_ENABLED = false

/**
 * 지도 SDK 를 끈 빌드용 자리표시자. 실제 지도처럼 보이지 않도록 '경로 개요'와 안내 문구를 표시합니다.
 * local.properties 에 mungroad.useKakaoMap=true + KAKAO_NATIVE_APP_KEY 를 넣으면 카카오맵으로 바뀝니다.
 */
@Composable
fun RouteMap(state: MapState, modifier: Modifier = Modifier) {
    Box(modifier.background(Color(0xFFEFF4FC), RoundedCornerShape(22.dp))) {
        val all = state.planned + state.driven + listOfNotNull(state.current)
        Canvas(Modifier.fillMaxSize().padding(28.dp)) {
            if (all.size < 2) return@Canvas
            val minLat = all.minOf { it.lat }; val maxLat = all.maxOf { it.lat }
            val minLng = all.minOf { it.lng }; val maxLng = all.maxOf { it.lng }
            fun p(g: GeoPoint) = Offset(
                ((g.lng - minLng) / (maxLng - minLng).coerceAtLeast(1e-6) * size.width).toFloat(),
                ((1 - (g.lat - minLat) / (maxLat - minLat).coerceAtLeast(1e-6)) * size.height).toFloat(),
            )
            fun line(pts: List<GeoPoint>, color: Color, w: Float) {
                if (pts.size < 2) return
                val path = Path().apply { moveTo(p(pts[0]).x, p(pts[0]).y); pts.drop(1).forEach { lineTo(p(it).x, p(it).y) } }
                drawPath(path, color, style = Stroke(width = w))
            }
            line(state.planned, Color(0x554D80E8), 10f)
            line(state.driven, Color(0xFF4D80E8), 12f)
            state.current?.let { drawCircle(Color(0xFF4D80E8), 16f, p(it)); drawCircle(Color.White, 7f, p(it)) }
        }
        Text(
            "지도 SDK 미연결 · 경로 개요만 표시",
            modifier = Modifier.align(Alignment.TopCenter).padding(10.dp)
                .background(Color.White, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 4.dp),
            fontSize = 12.sp, color = Color(0xFF74849A),
        )
    }
}

fun initMapSdk(@Suppress("UNUSED_PARAMETER") context: android.content.Context) = Unit
