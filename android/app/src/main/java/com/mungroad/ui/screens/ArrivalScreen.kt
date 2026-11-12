package com.mungroad.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Coffee
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.data.local.TripPhase
import com.mungroad.providers.Provenance
import com.mungroad.providers.policyLabel
import com.mungroad.trip.LiveUi
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** 도착 화면(여행지 / 집). 도착은 종료가 아니며, 여행 완료는 보호자가 직접 누릅니다. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ArrivalScreen(live: LiveUi, vm: TripViewModel, onSaved: (String) -> Unit) {
    val home by vm.homeRegion.collectAsState()
    val atHome = live.phase == TripPhase.RETURNING
    var record by remember { mutableStateOf("") }
    var confirmFinish by remember { mutableStateOf(false) }
    val sky = if (atHome) listOf(Color(0xFFFFC9A8), Color(0xFFF7FAFF)) else listOf(Color(0xFFBFE3FF), Color(0xFFF7FAFF))

    Row(Modifier.fillMaxSize().background(Brush.verticalGradient(sky)).padding(24.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        Column(Modifier.weight(0.55f).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (atHome) "집에 도착했어요" else "${live.destination?.name ?: "여행지"}에 도착했어요", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            Text(if (atHome) "${live.petCall}와 함께한 오늘의 여행을 저장할까요?" else "${live.petCall}와 즐거운 시간 보내세요. 돌아올 때 이어서 기록할게요.", fontSize = 18.sp, color = Mung.Text)
            if (live.isDemo) ProvenanceBadge(Provenance.DEMO)
            MCard(Modifier.fillMaxWidth()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCell(Icons.Outlined.Place, "이동 거리", "${live.totalKm.toInt()} km", Modifier.weight(1f))
                    StatCell(Icons.Outlined.DirectionsCar, "주행 시간", fmtDuration(live.totalDrivingSec), Modifier.weight(1f))
                    StatCell(Icons.Outlined.Coffee, "휴식", "${live.totalRests}번", Modifier.weight(1f))
                }
            }
            live.cabinPrompt?.let { CabinPromptCard(it, live, vm) }
            if (live.isDemo) DemoCabinPanel(vm)
            if (!atHome) {
                MCard(Modifier.fillMaxWidth()) {
                    Text("여행지 기록", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("정차 중에만 입력할 수 있어요. 사진·일기는 휴대폰 앱에서 이어서 남겨요.", fontSize = 14.sp, color = Mung.TextSecondary)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("해변 산책", "반려견 카페", "공원", "맛집").forEach { q ->
                            Text(q, fontSize = 15.sp, modifier = Modifier.background(Mung.PrimaryLight, RoundedCornerShape(50)).clickable { vm.recordPlace(q) }.padding(horizontal = 14.dp, vertical = 8.dp))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(record, { record = it }, label = { Text("직접 입력") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    BigButton("기록 남기기", enabled = record.isNotBlank()) { vm.recordPlace(record.trim()); record = "" }
                }
            }
        }
        Column(Modifier.weight(0.45f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (!atHome) {
                MCard(Modifier.fillMaxWidth().weight(1f)) {
                    Text("근처 반려견 동반 장소", fontWeight = FontWeight.Bold)
                    ProvenanceBadge(live.placeProvenance)
                    Spacer(Modifier.height(6.dp))
                    if (live.places.isEmpty()) Text("주변 장소를 찾는 중이거나 결과가 없어요.", fontSize = 14.sp, color = Mung.TextSecondary)
                    live.places.take(5).forEach { p ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold)
                            Text("반려견 동반 ${p.policy.petAllowed.policyLabel()}", fontSize = 13.sp, color = Mung.TextSecondary)
                        }
                    }
                }
                BigButton("집으로 출발" + (home?.let { " (${it.name})" } ?: ""), Icons.Outlined.Home) { vm.startReturn() }
            } else Spacer(Modifier.weight(1f))
            BigButton("여행 완료 · 기록 저장", Icons.Outlined.Save, Mung.MintText) { confirmFinish = true }
            Text("경로 안내 종료 · 기록은 휴대폰 앱에서도 볼 수 있어요", fontSize = 13.sp, color = Mung.TextSecondary)
        }
    }
    if (live.showPetMode) PetModeDialog(live.cabinCaps.petMode) { vm.closePetMode() }
    if (confirmFinish) {
        AlertDialog(
            onDismissRequest = { confirmFinish = false },
            title = { Text("여행을 완료할까요?") },
            text = { Text("${live.totalKm.toInt()}km · 주행 ${fmtDuration(live.totalDrivingSec)} · 휴식 ${live.totalRests}번 기록이 저장돼요." + if (!atHome) " 돌아오는 길은 기록하지 않아요." else "") },
            confirmButton = { TextButton(onClick = { confirmFinish = false; vm.finishTrip(onSaved) }) { Text("여행 완료") } },
            dismissButton = { TextButton(onClick = { confirmFinish = false }) { Text("취소") } },
        )
    }
    live.notice?.let { n -> AlertDialog(onDismissRequest = { vm.clearNotice() }, confirmButton = { TextButton(onClick = { vm.clearNotice() }) { Text("확인") } }, text = { Text(n) }) }
}
