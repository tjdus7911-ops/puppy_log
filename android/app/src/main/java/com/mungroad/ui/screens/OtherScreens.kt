package com.mungroad.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Coffee
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.BuildConfig
import com.mungroad.data.local.TripEntity
import com.mungroad.providers.Destination
import com.mungroad.providers.GeoPoint
import com.mungroad.sdk.MAP_SDK_ENABLED
import com.mungroad.sdk.PleosBindings
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** SCREEN 02 — 정차 중 여행 기록 (목록 + 대표 기록) */
@Composable
fun RecordsScreen(vm: TripViewModel, highlightId: String?) {
    val trips by vm.trips.collectAsState()
    if (trips.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("여행 기록", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            Text("아직 여행 기록이 없어요. 여행을 완료하면 여기에 쌓여요.", fontSize = 18.sp)
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Text("여행 기록", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium) }
        items(trips) { t -> TripRecordCard(t, highlight = t.id == highlightId) }
    }
}

@Composable
private fun TripRecordCard(t: TripEntity, highlight: Boolean) {
    MCard(Modifier.fillMaxWidth(), color = if (highlight) Mung.PrimaryLight else Mung.Surface) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.title.ifBlank { "제목 없는 여행" }, style = androidx.compose.material3.MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            if (t.isDemo) ProvenanceBadge(com.mungroad.providers.Provenance.DEMO)
        }
        Text(java.text.SimpleDateFormat("yyyy.MM.dd (E)", java.util.Locale.KOREAN).format(java.util.Date(t.startTime)) + " · 휴식 ${t.restIntervalMinutes}분마다" + (t.restBasis?.let { b -> runCatching { " (" + com.mungroad.domain.RestBasis.valueOf(b).label + ")" }.getOrDefault("") } ?: ""), color = Mung.TextSecondary)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCell(Icons.Outlined.DirectionsCar, "이동 거리", "${t.totalDistanceKm.toInt()} km", Modifier.weight(1f))
            StatCell(Icons.Outlined.Schedule, "주행 시간", fmtDuration(t.drivingDurationSeconds.toDouble()), Modifier.weight(1f))
            StatCell(Icons.Outlined.Coffee, "여행 시간", fmtDuration(t.elapsedDurationSeconds.toDouble()), Modifier.weight(1f))
        }
        Text("사진·일기·공유는 휴대폰 앱에서 이어서 남길 수 있어요.", fontSize = 13.sp, color = Mung.TextSecondary)
    }
}

/** SCREEN 07 — 커뮤니티(향후 확장). 실제 운영 기능 없음. */
@Composable
fun CommunityScreen() {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("멍친구 커뮤니티", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Pill("준비 중 · 향후 확장")
        MCard(Modifier.fillMaxWidth()) {
            Text("여행 피드 · 멍친구 찾기 · 지역별 모임 · 동반 장소 후기", fontWeight = FontWeight.Bold)
            Text("정확한 실시간 위치와 이동 경로는 다른 사용자에게 기본 공개하지 않아요. 신고·차단·참여 승인 기능과 함께 단계적으로 열 예정이에요.", color = Mung.TextSecondary)
        }
    }
}

/** 설정: 데모 모드 · 집 위치 · 음성 · 차량 연동 상태(구현/데모/미지원 구분) */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(vm: TripViewModel) {
    val demo by vm.demoMode.collectAsState()
    val home by vm.homeRegion.collectAsState()
    val hazard by vm.hazardVoice.collectAsState()
    val live by vm.live.collectAsState()
    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("설정", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        MCard(Modifier.fillMaxWidth()) {
            ToggleRow("데모 모드", "서울 → 강릉 가상 주행과 차량 상태 시뮬레이션. 기록은 실제 통계에서 제외돼요.", demo) { if (live == null) vm.setDemo(it) }
            if (live != null) Text("여행 중에는 바꿀 수 없어요.", fontSize = 13.sp, color = Mung.TextSecondary)
            ToggleRow("반려견 맞춤 도로 안내 음성", "공사·사고·낙하물·정체를 반려견 기준 문구로 안내", hazard) { vm.setHazardVoice(it) }
        }
        MCard(Modifier.fillMaxWidth()) {
            Text("집 위치 (돌아오는 길 안내)", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                com.mungroad.domain.Regions.ALL.forEach { r ->
                    val on = home?.id == r.id
                    Text(r.name, color = if (on) Color.White else Mung.Text, modifier = Modifier.background(if (on) Mung.Primary else Mung.Background, RoundedCornerShape(50)).clickable { vm.setHome(r) }.padding(horizontal = 14.dp, vertical = 8.dp))
                }
            }
            Text("시·군 대표 좌표예요. 실제 집 주소는 차량 내비의 '집'으로 안내받는 걸 권해요.", fontSize = 13.sp, color = Mung.TextSecondary)
        }
        MCard(Modifier.fillMaxWidth()) {
            Text("연동 상태", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            StatusLine("빌드", PleosBindings.statusText())
            StatusLine("Pleos NaviHelper", if (PleosBindings.ENABLED) "목적지·경유지·편한 길·도착 이벤트 연동" else "미포함(앱 목적지 · 외부 지도 앱)")
            StatusLine("Pleos Vehicle", if (PleosBindings.ENABLED) "창문·문·에어컨·방향지시등 (차종별 지원 확인)" else "미포함")
            StatusLine("음성 안내", if (vm.usingPleosTts) "Pleos TextToSpeech" else "Android TextToSpeech")
            StatusLine("AAOS 속성", "기어·차속·외기 온도·시동")
            live?.cabinCaps?.let { c ->
                StatusLine("이번 여행 지원", listOfNotNull("창문".takeIf { c.window }, "문".takeIf { c.door }, "에어컨".takeIf { c.hvac }, "외기온도".takeIf { c.outsideTemp }, "방향지시등".takeIf { c.turnSignal }, "시동".takeIf { c.ignition }).joinToString(" · ").ifBlank { "확인된 항목 없음" })
            }
            StatusLine("지도", if (MAP_SDK_ENABLED) "카카오맵 SDK 포함" else "미연결(경로 개요만)")
            StatusLine("장소·교통 서버", BuildConfig.MUNGROAD_API_BASE_URL.ifBlank { "미설정(샘플·데모 사용)" })
        }
    }
}

@Composable
private fun StatusLine(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(k, Modifier.weight(1f))
        Text(v, color = Mung.TextSecondary, fontSize = 14.sp, modifier = Modifier.width(360.dp))
    }
}
