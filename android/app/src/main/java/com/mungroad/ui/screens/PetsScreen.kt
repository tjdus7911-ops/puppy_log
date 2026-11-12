package com.mungroad.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import com.mungroad.domain.HealthCondition
import com.mungroad.domain.RestCare
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** 내 반려견: 목록 · 추가 · 여행 케어(휴식 간격 기준표). 주행 중(실차)에는 편집 잠금 */
@Composable
fun PetsScreen(vm: TripViewModel, onStartTrip: () -> Unit) {
    val pets by vm.pets.collectAsState()
    val live by vm.live.collectAsState()
    val locked = live?.editLocked == true
    var editing by remember { mutableStateOf<PetEntity?>(null) }
    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("내 반려견", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        if (locked) Text("주행 중에는 프로필 편집이 잠겨요. 정차 후 이용해 주세요.", color = Mung.TextSecondary, fontSize = 15.sp)
        pets.forEach { p ->
            val (min, basis) = RestCare.petInterval(p)
            MCard(Modifier.fillMaxWidth(), onClick = if (locked) null else ({ editing = p })) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PawAvatar(p.name, 64.dp)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(listOfNotNull(petLine(p), p.breed).joinToString(" · "), fontSize = 15.sp, color = Mung.TextSecondary)
                        Text("휴식 알림 ${min}분 · ${basis.label}", fontSize = 14.sp, color = Mung.Primary)
                    }
                    if (!locked) Text("수정 ›", color = Mung.Primary, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (!locked) BigButton("반려견 추가", Icons.Outlined.Add) { editing = vm.newPet("") }
        if (pets.isNotEmpty()) BigButton("이 반려견들과 새 여행 시작", color = Mung.MintText, onClick = onStartTrip)
    }
    editing?.let { p -> PetEditDialog(p, isNew = pets.none { it.id == p.id }, onClose = { editing = null }, onDelete = { vm.deletePet(p.id); editing = null }) { vm.savePet(it); editing = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PetEditDialog(p0: PetEntity, isNew: Boolean, onClose: () -> Unit, onDelete: () -> Unit, onSave: (PetEntity) -> Unit) {
    var p by remember { mutableStateOf(p0) }
    var age by remember { mutableStateOf(p0.ageYears?.toString() ?: "") }
    var vet by remember { mutableStateOf(p0.vetRestIntervalMinutes?.toString() ?: "") }
    var askDelete by remember { mutableStateOf(false) }
    val draft = p.copy(ageYears = age.toIntOrNull(), vetRestIntervalMinutes = vet.toIntOrNull())
    val (min, basis) = RestCare.petInterval(draft)
    val items = RestCare.guidelineItems(draft)

    @Composable
    fun Chip(label: String, on: Boolean, click: () -> Unit) =
        Text(label, color = if (on) Color.White else Mung.Text, fontSize = 15.sp, modifier = Modifier.background(if (on) Mung.Primary else Mung.Background, RoundedCornerShape(50)).clickable(onClick = click).padding(horizontal = 14.dp, vertical = 8.dp))

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (isNew) "반려견 등록" else "${p0.name} 정보") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(p.name, { p = p.copy(name = it) }, label = { Text("이름") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(age, { age = it.filter(Char::isDigit).take(2) }, label = { Text("나이(살)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                    OutlinedTextField(p.breed ?: "", { p = p.copy(breed = it.ifBlank { null }) }, label = { Text("견종(선택)") }, singleLine = true, modifier = Modifier.weight(2f))
                }
                Text("체급", fontWeight = FontWeight.Bold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(PetSize.SMALL to "소형", PetSize.MEDIUM to "중형", PetSize.LARGE to "대형").forEach { (s, l) -> Chip(l, p.size == s) { p = p.copy(size = s) } }
                }
                Text("여행 케어(선택)", fontWeight = FontWeight.Bold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("노령견", p.senior == true) { p = p.copy(senior = if (p.senior == true) null else true) }
                    Chip("단두종", p.brachycephalic == true) { p = p.copy(brachycephalic = if (p.brachycephalic == true) null else true) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HealthCondition.entries.forEach { c -> Chip(c.label, p.healthCondition == c.name) { p = p.copy(healthCondition = if (p.healthCondition == c.name) null else c.name) } }
                }
                OutlinedTextField(vet, { vet = it.filter(Char::isDigit).take(3) }, label = { Text("수의사가 정한 휴식 간격(분, 있으면 최우선)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("직접 정한 간격", Modifier.weight(1f))
                    TextButton(onClick = { p = p.copy(guardianInterval = true, restIntervalMinutes = (p.restIntervalMinutes - 15).coerceAtLeast(RestCare.MIN_INTERVAL)) }) { Text("−15") }
                    Text(if (p.guardianInterval) "${p.restIntervalMinutes}분" else "사용 안 함", fontWeight = FontWeight.Bold)
                    TextButton(onClick = { p = p.copy(guardianInterval = true, restIntervalMinutes = (p.restIntervalMinutes + 15).coerceAtMost(RestCare.MAX_INTERVAL)) }) { Text("+15") }
                    if (p.guardianInterval) TextButton(onClick = { p = p.copy(guardianInterval = false) }) { Text("기준표 사용") }
                }
                MCard(Modifier.fillMaxWidth(), color = Mung.PrimaryLight) {
                    Text("적용 간격: ${min}분 · ${basis.label}", fontWeight = FontWeight.Bold, color = Mung.Primary)
                    items.forEach { Text("· ${it.label} ${it.minutes}분 — ${it.tip}", fontSize = 13.sp) }
                    Spacer(Modifier.height(4.dp))
                    Text(RestCare.GUIDELINE_NOTE, fontSize = 12.sp, color = Mung.TextSecondary)
                    items.map { it.source }.distinct().forEach { Text("출처: $it", fontSize = 11.sp, color = Mung.TextSecondary) }
                }
                OutlinedTextField(p.notes, { p = p.copy(notes = it) }, label = { Text("건강 메모(이 기기에만 저장)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(enabled = p.name.isNotBlank(), onClick = { onSave(draft.copy(name = p.name.trim())) }) { Text("저장") } },
        dismissButton = {
            Row {
                if (!isNew) TextButton(onClick = { if (askDelete) onDelete() else askDelete = true }) { Text(if (askDelete) "정말 삭제(되돌릴 수 없음)" else "삭제", color = Mung.Danger) }
                TextButton(onClick = onClose) { Text("취소") }
            }
        },
    )
}
