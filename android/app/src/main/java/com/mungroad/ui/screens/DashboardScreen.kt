package com.mungroad.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Coffee
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.LocalCafe
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Traffic
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.domain.EngineStatus
import com.mungroad.domain.TripEngine
import com.mungroad.providers.HazardType
import com.mungroad.providers.NavRequestResult
import com.mungroad.providers.PetPlace
import com.mungroad.providers.Provenance
import com.mungroad.providers.policyLabel
import com.mungroad.sdk.RouteMap
import com.mungroad.trip.LiveUi
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

fun fmtDuration(sec: Double): String {
    val m = (sec / 60).toInt().coerceAtLeast(0)
    return if (m >= 60) "${m / 60}시간 ${m % 60}분" else "${m}분"
}

/** SCREEN 01 — 주행 중 메인 대시보드 (가로형: 좌 카드 | 중앙 지도 | 우 추천) */
@Composable
fun DashboardScreen(live: LiveUi, vm: TripViewModel, onEnded: (String) -> Unit, onVoice: () -> Unit, voiceAvailable: Boolean) {
    val e = live.engine
    val driving = e.status == EngineStatus.DRIVING
    var confirmEnd by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }

    Row(Modifier.fillMaxSize().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── 좌측: 반려견 여행 카드 + 휴식 안내 ──
        Column(Modifier.weight(0.28f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            MCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PawAvatar(live.petNames.first(), 76.dp)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text("${live.petNames.joinToString(", ")}와 여행 중", style = androidx.compose.material3.MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Pill(when (e.status) { EngineStatus.DRIVING -> "주행 중"; EngineStatus.STOPPED -> "일시 정차"; EngineStatus.RESTING -> "휴식 중"; EngineStatus.ENDED -> "종료" }, Mung.Primary, Color.White)
                            if (live.source == com.mungroad.data.local.DataSource.DEMO) ProvenanceBadge(Provenance.DEMO)
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCell(Icons.Outlined.DirectionsCar, "주행 시간", fmtDuration(e.drivingSec), Modifier.weight(1f))
                    StatCell(Icons.Outlined.Place, "이동 거리", "${e.distanceKm.toInt()} km", Modifier.weight(1f))
                    StatCell(Icons.Outlined.Coffee, "휴식까지", if (e.status == EngineStatus.RESTING) "휴식 중" else fmtDuration(live.secondsUntilRest), Modifier.weight(1f))
                }
            }
            MCard(Modifier.fillMaxWidth(), color = Mung.Mint, onClick = { vm.loadPlaces() }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.LocalCafe, null, tint = Mung.MintText, modifier = Modifier.size(36.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(if (live.secondsUntilRest <= 600) "곧 쉬어갈 시간이에요!" else "다음 휴식까지 ${fmtDuration(live.secondsUntilRest)}", fontWeight = FontWeight.Bold, fontSize = 19.sp, color = Mung.Text)
                        Text("${live.petNames.first()}와 가까운 휴식 장소를 추천해 드릴게요.", fontSize = 14.sp, color = Mung.MintText)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (e.status == EngineStatus.RESTING) BigButton("휴식 종료", Icons.Outlined.Timer, Mung.Warning, Modifier.weight(1f)) { vm.endRest() }
                else BigButton("휴식 시작", Icons.Outlined.Coffee, Mung.Warning, Modifier.weight(1f), enabled = !driving || live.source == com.mungroad.data.local.DataSource.DEMO) { vm.beginRest() }
                BigButton("여행 종료", Icons.Outlined.Stop, Mung.Danger, Modifier.weight(1f)) { confirmEnd = true }
            }
            if (driving) Text("주행 중에는 상세 탐색·편집이 잠겨요.", fontSize = 13.sp, color = Mung.TextSecondary)
        }

        // ── 중앙: 지도 + 목적지 배너 + 위험 정보 칩 ──
        Box(Modifier.weight(0.44f).fillMaxHeight()) {
            RouteMap(live.mapState(), Modifier.fillMaxSize())
            live.route?.let { r ->
                MCard(Modifier.align(Alignment.TopStart).padding(12.dp), radius = 18.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Navigation, null, tint = Mung.Primary)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("${r.destination?.name ?: "목적지 없음"}까지", fontWeight = FontWeight.Bold)
                            val eta = r.etaEpochMillis?.let { ((it - System.currentTimeMillis()) / 1000.0) }
                            Text(listOfNotNull(eta?.let { "약 ${fmtDuration(it)}" + if (r.isEstimated) "(추정)" else "" }, r.remainingDistanceKm?.let { "${it.toInt()} km" }).joinToString(" · "), fontSize = 14.sp, color = Mung.TextSecondary)
                        }
                    }
                }
            }
            HazardBar(live, Modifier.align(Alignment.BottomCenter).padding(12.dp))
        }

        // ── 우측: 근처 휴식 장소 추천 + 음성 명령 ──
        Column(Modifier.weight(0.28f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            MCard(Modifier.fillMaxWidth().weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("근처 휴식 장소 추천", style = androidx.compose.material3.MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    ProvenanceBadge(live.placeProvenance)
                }
                Spacer(Modifier.height(8.dp))
                if (live.places.isEmpty()) Text("위치를 확인하면 가까운 장소를 찾아드려요.", fontSize = 14.sp, color = Mung.TextSecondary)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // 주행 중에는 간단한 정보만(상위 3곳), 정차 중에는 더 보기
                    items(if (driving) live.places.take(3) else live.places) { p ->
                        PlaceRow(p, live) { vm.guideTo(p) { r -> toast = r.message() } }
                    }
                }
            }
            MCard(Modifier.fillMaxWidth(), onClick = onVoice) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Mic, null, tint = Mung.Primary, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("\"가까운 휴게소 찾아줘\"", fontWeight = FontWeight.SemiBold)
                        Text(if (voiceAvailable) "눌러서 말하기" else "음성 인식 미지원 · 데모 명령 실행", fontSize = 13.sp, color = Mung.TextSecondary)
                    }
                }
            }
        }
    }

    live.reminder?.let { r ->
        AlertDialog(
            onDismissRequest = { vm.dismissReminder() },
            title = { Text(if (r.due) "${live.petNames.first()}와 ${r.drivenMinutes}분 동안 이동했어요. 잠깐 쉬어갈까요?" else "${live.petNames.first()}와 곧 쉬어갈 시간이에요.") },
            text = { Text("휴식 알림은 보호자가 정한 간격에 따른 안내이며, 반려견의 피로도를 측정하지 않아요.") },
            confirmButton = { TextButton(onClick = { vm.beginRest() }) { Text("휴식 시작") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { vm.dismissReminder(); vm.loadPlaces() }) { Text("주변 휴식 장소 보기") }
                    TextButton(onClick = { vm.snooze() }) { Text("나중에 알림") }
                }
            },
        )
    }
    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text("여행을 마칠까요?") },
            text = { Text("${e.distanceKm.toInt()}km · 주행 ${fmtDuration(e.drivingSec)} 기록이 저장돼요.") },
            confirmButton = { TextButton(onClick = { confirmEnd = false; vm.endTrip(onEnded) }) { Text("여행 종료") } },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text("계속 기록") } },
        )
    }
    toast?.let { AlertDialog(onDismissRequest = { toast = null }, confirmButton = { TextButton(onClick = { toast = null }) { Text("확인") } }, text = { Text(it) }) }
}

private fun NavRequestResult.message() = when (this) {
    NavRequestResult.RouteRequested -> "내비게이션에 목적지를 전달했어요."
    NavRequestResult.WaypointAdded -> "경유지로 추가했어요."
    is NavRequestResult.OpenedExternalApp -> "$appName 으로 길 안내를 열었어요."
    is NavRequestResult.Failed -> reason
}

@Composable
private fun PlaceRow(p: PetPlace, live: LiveUi, onGuide: () -> Unit) {
    val d = live.current?.let { TripEngine.haversineKm(it.lat, it.lng, p.point.lat, p.point.lng) }
    Row(
        Modifier.fillMaxWidth().background(Mung.Background, RoundedCornerShape(16.dp)).clickable(onClick = onGuide).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(p.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            // 동반 가능 여부는 데이터로 확인된 경우에만 '가능'. 없으면 '확인 필요'
            Text("반려견 동반 ${p.policy.petAllowed.policyLabel()}", fontSize = 13.sp, color = if (p.policy.petAllowed == true) Mung.MintText else Mung.TextSecondary)
        }
        Text(d?.let { "%.1f km".format(it) } ?: "", fontSize = 14.sp, color = Mung.TextSecondary)
    }
}

@Composable
private fun HazardBar(live: LiveUi, modifier: Modifier) {
    val types = listOf(
        Triple(HazardType.ACCIDENT, "전방 사고", Icons.Outlined.Report to Mung.Danger),
        Triple(HazardType.CONSTRUCTION, "공사중", Icons.Outlined.Construction to Mung.Warning),
        Triple(HazardType.DEBRIS, "낙하물", Icons.Outlined.Warning to Mung.Debris),
        Triple(HazardType.CONGESTION, "정체", Icons.Outlined.Traffic to Mung.Congestion),
    )
    Row(
        modifier.background(Color.White, RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        if (live.hazardProvenance == Provenance.UNAVAILABLE) {
            Text("교통 위험 정보 미연동", fontSize = 14.sp, color = Mung.TextSecondary)
        } else {
            types.forEach { (t, label, ic) ->
                val n = live.hazards.count { it.type == t }
                HazardChip(ic.first, ic.second, if (n > 0) "$label $n" else label, n > 0)
            }
            ProvenanceBadge(live.hazardProvenance)
        }
    }
}

@Composable
private fun HazardChip(icon: ImageVector, color: Color, text: String, active: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (active) color else Mung.Border, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(4.dp))
        Text(text, fontSize = 14.sp, color = if (active) Mung.Text else Mung.TextSecondary)
    }
}
