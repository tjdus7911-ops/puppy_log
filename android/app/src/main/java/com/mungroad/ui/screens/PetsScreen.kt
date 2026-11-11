package com.mungroad.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.domain.EngineStatus
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/** 내 반려견: 등록된 반려견 목록 · 추가(주행 중에는 편집 잠금) */
@Composable
fun PetsScreen(vm: TripViewModel, onStartTrip: () -> Unit) {
    val pets by vm.pets.collectAsState()
    val live by vm.live.collectAsState()
    val driving = live?.engine?.status == EngineStatus.DRIVING
    var newName by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("내 반려견", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        if (driving) Text("주행 중에는 프로필 편집이 잠겨요. 정차 후 이용해 주세요.", color = Mung.TextSecondary, fontSize = 15.sp)
        pets.forEach { p ->
            MCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PawAvatar(p.name, 64.dp)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(petLine(p), fontSize = 15.sp, color = Mung.TextSecondary)
                        Text("휴식 알림 ${p.restIntervalMinutes}분", fontSize = 14.sp, color = Mung.TextSecondary)
                    }
                }
            }
        }
        if (!driving) {
            MCard(Modifier.fillMaxWidth()) {
                Text("반려견 추가", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(newName, { newName = it }, label = { Text("이름 (예: 초코)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                BigButton("등록", Icons.Outlined.Add, enabled = newName.isNotBlank()) { vm.addPet(newName, 90); newName = "" }
            }
        }
        if (pets.isNotEmpty()) BigButton("이 반려견들과 새 여행 시작", onClick = onStartTrip)
    }
}
