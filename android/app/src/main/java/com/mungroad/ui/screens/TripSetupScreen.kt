package com.mungroad.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.domain.Korean
import com.mungroad.domain.Region
import com.mungroad.domain.Regions
import com.mungroad.domain.RestCare
import com.mungroad.domain.TripEngine
import com.mungroad.providers.Destination
import com.mungroad.providers.Provenance
import com.mungroad.sdk.PleosBindings
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** 여행 시작 3단계: ① 함께 갈 반려견 → ② 목적지 → ③ 확인(예상 휴식 · 편한 길 · 휴식 경유지) */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TripSetupScreen(vm: TripViewModel, onAddPet: () -> Unit) {
    val pets by vm.pets.collectAsState()
    val demo by vm.demoMode.collectAsState()
    val home by vm.homeRegion.collectAsState()
    var step by remember { mutableIntStateOf(0) }
    val chosen = remember { mutableStateListOf<String>() }
    if (chosen.isEmpty() && pets.isNotEmpty() && step == 0) chosen += pets.first().id
    var region by remember { mutableStateOf<Region?>(if (demo) Regions.byId("gangneung") else null) }
    var custom by remember { mutableStateOf("") }
    var comfortable by remember { mutableStateOf(true) }
    var restWaypoint by remember { mutableStateOf(true) }
    var speed by remember { mutableIntStateOf(60) }

    val selPets = pets.filter { it.id in chosen }
    val policy = RestCare.resolve(selPets)

    Row(Modifier.fillMaxSize().padding(24.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        // 왼쪽: 단계 표시
        Column(Modifier.width(260.dp).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("여행 시작하기", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            listOf("함께 갈 반려견", "목적지", "확인하고 출발").forEachIndexed { i, t ->
                val on = i == step
                Row(
                    Modifier.fillMaxWidth().background(if (on) Mung.PrimaryLight else Color.Transparent, RoundedCornerShape(16.dp))
                        .clickable(enabled = i < step) { step = i }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${i + 1}", fontWeight = FontWeight.Bold, color = if (i <= step) Mung.Primary else Mung.TextSecondary, fontSize = 20.sp)
                    Spacer(Modifier.width(12.dp))
                    Text(t, fontSize = 18.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal, color = if (i <= step) Mung.Text else Mung.TextSecondary)
                }
            }
            Spacer(Modifier.weight(1f))
            if (demo) Pill("데모 모드 · 서울 → 강릉 가상 주행", Color(0xFFFFF3DD), Color(0xFF9A6A12))
        }

        // 오른쪽: 단계 내용
        Column(Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when (step) {
                0 -> {
                    Text("누구와 함께 가나요?", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    if (pets.isEmpty()) {
                        MCard(Modifier.fillMaxWidth()) {
                            Text("먼저 반려견을 등록해 주세요.", fontSize = 18.sp)
                            Spacer(Modifier.height(10.dp))
                            BigButton("반려견 등록하기", onClick = onAddPet)
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        pets.forEach { p ->
                            val on = p.id in chosen
                            val (min, basis) = RestCare.petInterval(p)
                            Row(
                                Modifier.width(300.dp).background(if (on) Mung.PrimaryLight else Mung.Surface, RoundedCornerShape(20.dp))
                                    .border(2.dp, if (on) Mung.Primary else Mung.Border, RoundedCornerShape(20.dp))
                                    .clickable { if (on) chosen.remove(p.id) else chosen.add(p.id) }.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PawAvatar(p.name, 56.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(p.name, fontWeight = FontWeight.Bold, fontSize = 19.sp)
                                    Text("휴식 ${min}분 · ${basis.label}", fontSize = 14.sp, color = Mung.TextSecondary)
                                }
                                Text(if (on) "✓" else "", fontSize = 22.sp, color = Mung.Primary, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    BigButton("다음", Icons.Outlined.ArrowForward, enabled = chosen.isNotEmpty()) { step = 1 }
                }
                1 -> {
                    Text("어디로 갈까요?", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Regions.DESTINATIONS.forEach { r ->
                            val on = region?.id == r.id && custom.isBlank()
                            Text(
                                r.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = if (on) Color.White else Mung.Text,
                                modifier = Modifier.background(if (on) Mung.Primary else Mung.Surface, RoundedCornerShape(50))
                                    .border(1.dp, if (on) Mung.Primary else Mung.Border, RoundedCornerShape(50))
                                    .clickable { region = r; custom = "" }.padding(horizontal = 20.dp, vertical = 12.dp),
                            )
                        }
                    }
                    OutlinedTextField(custom, { custom = it }, label = { Text("직접 입력 (예: 경포해변) · 안내 지점은 차량 내비에서 정해요") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Text(if (PleosBindings.ENABLED) "선택한 목적지는 차량 내비게이션에 편한 길로 전달돼요." else "이 빌드는 차량 내비 연동이 없어 목적지는 기록용으로만 써요.", fontSize = 14.sp, color = Mung.TextSecondary)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BigButton("이전", Icons.Outlined.ArrowBack, Mung.Secondary, Modifier.weight(1f)) { step = 0 }
                        BigButton("다음", Icons.Outlined.ArrowForward, modifier = Modifier.weight(1f), enabled = region != null || custom.isNotBlank()) { step = 2 }
                    }
                }
                else -> {
                    val destName = custom.trim().ifBlank { region?.name ?: "" }
                    val destPoint = if (custom.isBlank()) region?.point else null
                    val estKm = destPoint?.let { d -> home?.point?.let { h -> TripEngine.haversineKm(h.lat, h.lng, d.lat, d.lng) * 1.3 } }
                    val estMin = estKm?.let { it / 80.0 * 60 }
                    val rests = estMin?.let { (it / policy.intervalMinutes).toInt() }
                    Text("${Korean.petNames(selPets.map { it.name })}${Korean.josa(Korean.petNames(selPets.map { it.name }), "과", "와")} $destName", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    MCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("휴식 알림", Modifier.weight(1f), fontSize = 18.sp)
                            Text("${policy.intervalMinutes}분마다", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Mung.Primary)
                        }
                        Text(policy.basis.label + " · " + policy.reasons.joinToString(" · "), fontSize = 14.sp, color = Mung.TextSecondary)
                        if (policy.basis == com.mungroad.domain.RestBasis.GUIDELINE) Text(RestCare.GUIDELINE_NOTE, fontSize = 13.sp, color = Mung.TextSecondary)
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("예상 휴식", Modifier.weight(1f), fontSize = 18.sp)
                            Text(if (rests != null) "약 ${rests}번 (예상 ${estMin?.let { fmtDuration(it * 60) } ?: ""}, 직선거리 기반 추정)" else "내비 경로가 정해지면 계산돼요", fontSize = 16.sp, color = Mung.Text)
                        }
                        policy.prompts.take(3).forEach { Text("· $it", fontSize = 14.sp, color = Mung.MintText) }
                    }
                    MCard(Modifier.fillMaxWidth()) {
                        ToggleRow("편한 길로 안내", "급커브·급정거가 적은 경로(내비 '편한 길' 옵션)", comfortable) { comfortable = it }
                        ToggleRow("휴식 장소 경유지 추천", "휴식 10분 전에 경로 근처 휴식 장소를 찾아 경유지로 제안해요", restWaypoint) { restWaypoint = it }
                        if (demo) {
                            Spacer(Modifier.height(6.dp))
                            Text("데모 속도", fontSize = 16.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                listOf(60, 180, 300).forEach { m ->
                                    Text("${m}배", fontSize = 16.sp, color = if (speed == m) Color.White else Mung.Text,
                                        modifier = Modifier.background(if (speed == m) Mung.Primary else Mung.Background, RoundedCornerShape(50)).clickable { speed = m }.padding(horizontal = 16.dp, vertical = 8.dp))
                                }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BigButton("이전", Icons.Outlined.ArrowBack, Mung.Secondary, Modifier.weight(1f)) { step = 1 }
                        BigButton("출발", Icons.Outlined.PlayArrow, modifier = Modifier.weight(2f), enabled = selPets.isNotEmpty() && destName.isNotBlank()) {
                            vm.startTrip(selPets, Destination(destName, destPoint), comfortable, restWaypoint, speed)
                            step = 0
                        }
                    }
                    if (demo) ProvenanceBadge(Provenance.DEMO)
                }
            }
        }
    }
}

@Composable
fun ToggleRow(title: String, sub: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(sub, fontSize = 14.sp, color = Mung.TextSecondary)
        }
        Switch(value, onChange)
    }
}
