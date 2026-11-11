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
import com.mungroad.trip.SourceChoice
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** SCREEN 03 — 여행 시작 */
@Composable
fun TripStartScreen(vm: TripViewModel) {
    val pets by vm.pets.collectAsState()
    val demo by vm.demoMode.collectAsState()
    var petIdx by remember { mutableIntStateOf(0) }
    var dest by remember { mutableStateOf(if (demo) "강릉" else "") }
    var interval by remember { mutableIntStateOf(90) }
    var newPet by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MCard(Modifier.fillMaxWidth(), color = Mung.PrimaryLight) {
            Text("여행 시작하기", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(6.dp))
            Text("${pets.getOrNull(petIdx)?.name ?: "우리 강아지"}와\n새로운 여행을 시작할까요?", fontSize = 18.sp, color = Mung.Text)
        }
        if (pets.isEmpty()) {
            MCard(Modifier.fillMaxWidth()) {
                Text("반려견을 먼저 등록해 주세요", fontWeight = FontWeight.Bold)
                OutlinedTextField(newPet, { newPet = it }, label = { Text("이름 (예: 사슴)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                BigButton("등록", enabled = newPet.isNotBlank()) { vm.addPet(newPet, interval); newPet = "" }
            }
        } else {
            MCard(Modifier.fillMaxWidth()) {
                SettingRow("반려견", pets[petIdx].name) { petIdx = (petIdx + 1) % pets.size }
                OutlinedTextField(dest, { dest = it }, label = { Text("목적지 (선택)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                SettingRow("휴식 알림 간격", "${interval}분") { interval = if (interval >= 120) 60 else interval + 15 }
                Text("휴식 간격은 의학적 기준이 아닌 보호자 설정값이에요.", fontSize = 13.sp, color = Mung.TextSecondary)
            }
            val choice = when {
                demo -> SourceChoice.DEMO
                PleosBindings.ENABLED -> SourceChoice.PLEOS_VEHICLE
                else -> SourceChoice.DEVICE_LOCATION
            }
            BigButton("여행 시작", Icons.Outlined.PlayArrow) {
                val d = dest.trim().takeIf { it.isNotEmpty() }?.let { Destination(it, if (demo) GeoPoint(37.7956, 128.9083) else null) }
                vm.startTrip(pets[petIdx], d, interval, choice)
            }
            Text(if (demo) "데모 모드 · 서울 → 강릉 가상 주행" else "기록 방식: ${choice.name}", fontSize = 13.sp, color = Mung.TextSecondary)
        }
    }
}

@Composable
private fun SettingRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), fontSize = 17.sp)
        Text("$value  ›", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Mung.Primary)
    }
}

/** SCREEN 02 — 정차 중 여행 기록 (목록 + 대표 기록) */
@Composable
fun RecordsScreen(vm: TripViewModel, highlightId: String?) {
    val trips by vm.trips.collectAsState()
    if (trips.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(24.dp)) { Text("아직 여행 기록이 없어요.", fontSize = 18.sp) }
        return
    }
    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
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
        Text(java.text.SimpleDateFormat("yyyy.MM.dd (E)", java.util.Locale.KOREAN).format(java.util.Date(t.startTime)), color = Mung.TextSecondary)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCell(Icons.Outlined.DirectionsCar, "이동 거리", "${t.totalDistanceKm.toInt()} km", Modifier.weight(1f))
            StatCell(Icons.Outlined.Schedule, "주행 시간", fmtDuration(t.drivingDurationSeconds.toDouble()), Modifier.weight(1f))
            StatCell(Icons.Outlined.Coffee, "여행 시간", fmtDuration(t.elapsedDurationSeconds.toDouble()), Modifier.weight(1f))
        }
        // TODO: 사진 추가·일기 편집·공유 — 웹 프로토타입(TripDetail)에 구현·검증됨, Compose 이식 예정
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

/** 설정: 데모 모드, SDK 연동 상태(구현 완료/데모/미지원 구분) */
@Composable
fun SettingsScreen(vm: TripViewModel) {
    val demo by vm.demoMode.collectAsState()
    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("설정", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        MCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("데모 모드", fontWeight = FontWeight.Bold)
                    Text("서울 → 강릉 가상 주행. 기록은 실제 통계에서 제외돼요.", color = Mung.TextSecondary)
                }
                Switch(demo, { vm.demoMode.value = it })
            }
        }
        MCard(Modifier.fillMaxWidth()) {
            Text("연동 상태", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            StatusLine("Pleos NaviHelper", if (PleosBindings.ENABLED) "SDK 포함 · 호출부 확인 필요" else "미포함(앱 목적지 대체 흐름)")
            StatusLine("차량 기어·차속(AAOS)", "구현 · 에뮬레이터 검증 필요")
            StatusLine("지도", if (MAP_SDK_ENABLED) "카카오맵 SDK 포함 · 실행 검증 필요" else "미연결(경로 개요만)")
            StatusLine("장소·교통·AI 서버", BuildConfig.MUNGROAD_API_BASE_URL.ifBlank { "미설정(샘플·데모 사용)" })
        }
    }
}

@Composable
private fun StatusLine(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(k, Modifier.weight(1f))
        Text(v, color = Mung.TextSecondary, fontSize = 14.sp, modifier = Modifier.background(Color.Transparent, RoundedCornerShape(8.dp)).width(260.dp))
    }
}
