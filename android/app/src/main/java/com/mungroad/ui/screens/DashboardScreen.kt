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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Flag
import com.mungroad.domain.Region
import com.mungroad.domain.Regions
import com.mungroad.domain.RestCare
import com.mungroad.providers.Destination
import com.mungroad.trip.DemoCabinEvent
import com.mungroad.trip.PetStay
import com.mungroad.vehicle.CabinPrompt
import com.mungroad.vehicle.CabinPromptKind
import com.mungroad.vehicle.CabinRules

fun fmtDuration(sec: Double): String {
    val m = (sec / 60).toInt().coerceAtLeast(0)
    return if (m >= 60) "${m / 60}시간 ${m % 60}분" else "${m}분"
}

/** SCREEN 01 — 주행 중 대시보드 (가로형: 좌 반려견·휴식 | 중앙 지도·안전 안내 | 우 휴식 장소·음성·정보 수정) */
@Composable
fun DashboardScreen(live: LiveUi, vm: TripViewModel, onVoice: () -> Unit, voiceAvailable: Boolean) {
    val e = live.engine
    val driving = live.driving
    var confirmArrive by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }
    val resting = e.status == EngineStatus.RESTING

    Row(Modifier.fillMaxSize().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── 좌측: 반려견 여행 카드 + 휴식 ──
        Column(Modifier.weight(0.28f).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PawAvatar(live.petNames.first(), 68.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("${live.petCall}와 ${if (live.legKind == com.mungroad.data.local.LegKind.RETURN) "돌아가는 길" else "여행 중"}", style = androidx.compose.material3.MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Pill(when (e.status) { EngineStatus.DRIVING -> "주행 중"; EngineStatus.STOPPED -> "일시 정차"; EngineStatus.RESTING -> "휴식 중"; EngineStatus.ENDED -> "종료" }, Mung.Primary, Color.White)
                            if (live.isDemo) ProvenanceBadge(Provenance.DEMO)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCell(Icons.Outlined.DirectionsCar, "주행 시간", fmtDuration(live.totalDrivingSec), Modifier.weight(1f))
                    StatCell(Icons.Outlined.Place, "이동 거리", "${live.totalKm.toInt()} km", Modifier.weight(1f))
                    StatCell(Icons.Outlined.Coffee, "휴식까지", if (resting) "휴식 중" else fmtDuration(live.secondsUntilRest), Modifier.weight(1f))
                }
                Spacer(Modifier.height(6.dp))
                Text("휴식 ${live.policy.intervalMinutes}분마다 · ${live.policy.basis.label}", fontSize = 13.sp, color = Mung.TextSecondary)
            }
            MCard(Modifier.fillMaxWidth(), color = Mung.Mint, onClick = { vm.findRestPlaces() }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.LocalCafe, null, tint = Mung.MintText, modifier = Modifier.size(34.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(if (live.reminder != null || live.secondsUntilRest <= 600) "곧 쉬어갈 시간이에요!" else "다음 휴식까지 ${fmtDuration(live.secondsUntilRest)}", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Mung.Text)
                        Text("눌러서 가까운 휴식 장소 찾기", fontSize = 14.sp, color = Mung.MintText)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (resting) BigButton("휴식 끝", Icons.Outlined.Timer, Mung.Warning, Modifier.weight(1f)) { vm.endRest() }
                else BigButton("휴식 시작", Icons.Outlined.Coffee, Mung.Warning, Modifier.weight(1f), enabled = !driving || live.isDemo) { vm.beginRest() }
                BigButton("도착했어요", Icons.Outlined.Flag, Mung.Primary, Modifier.weight(1f)) { confirmArrive = true }
            }
            if (driving && !live.isDemo) Text("주행 중에는 상세 탐색·편집이 잠겨요.", fontSize = 13.sp, color = Mung.TextSecondary)
            if (live.isDemo) DemoCabinPanel(vm)
        }

        // ── 중앙: 지도 + 목적지 배너 + 탑승 안전 안내 + 위험 정보 ──
        Box(Modifier.weight(0.44f).fillMaxHeight()) {
            RouteMap(live.mapState(), Modifier.fillMaxSize())
            Column(Modifier.align(Alignment.TopStart).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MCard(radius = 18.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Navigation, null, tint = Mung.Primary)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            val r = live.route
                            Text("${r?.destination?.name ?: live.destination?.name ?: "목적지 미정"}까지", fontWeight = FontWeight.Bold)
                            val eta = r?.etaEpochMillis?.let { ((it - System.currentTimeMillis()) / 1000.0) }
                            val line = listOfNotNull(eta?.let { "약 ${fmtDuration(it)}" + if (r?.isEstimated == true) "(추정)" else "" }, r?.remainingDistanceKm?.let { "${it.toInt()} km" }, if (live.routeComfortable) "편한 길" else "추천 경로").joinToString(" · ")
                            Text(line, fontSize = 14.sp, color = Mung.TextSecondary)
                            live.waypointName?.let { Text("경유: $it", fontSize = 13.sp, color = Mung.MintText) }
                        }
                    }
                }
                live.cabinPrompt?.let { p -> CabinPromptCard(p, live, vm) }
            }
            HazardBar(live, Modifier.align(Alignment.BottomCenter).padding(12.dp))
        }

        // ── 우측: 휴식 장소 + 음성 명령 + 여행 정보 수정 ──
        Column(Modifier.weight(0.28f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            live.suggestedPlace?.let { sp ->
                MCard(Modifier.fillMaxWidth(), color = Mung.PrimaryLight) {
                    Text("휴식 경유지 추천", fontWeight = FontWeight.Bold)
                    Text(sp.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    Text("반려견 동반 ${sp.policy.petAllowed.policyLabel()}", fontSize = 13.sp, color = if (sp.policy.petAllowed == true) Mung.MintText else Mung.TextSecondary)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BigButton("경유지 추가", modifier = Modifier.weight(1f)) { vm.guideTo(sp) { r -> toast = r.message() } }
                        BigButton("괜찮아요", color = Mung.Secondary, modifier = Modifier.weight(1f)) { vm.dismissSuggestion() }
                    }
                }
            }
            MCard(Modifier.fillMaxWidth().weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("근처 휴식 장소", style = androidx.compose.material3.MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    ProvenanceBadge(live.placeProvenance)
                }
                Spacer(Modifier.height(8.dp))
                if (live.places.isEmpty()) Text("휴식 알림 때나 위 카드를 누르면 찾아드려요.", fontSize = 14.sp, color = Mung.TextSecondary)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        Text("음성 명령", fontWeight = FontWeight.SemiBold)
                        Text(if (voiceAvailable) "\"가까운 휴게소 찾아줘\"" else "음성 인식 미지원 · 데모 명령 실행", fontSize = 13.sp, color = Mung.TextSecondary)
                    }
                }
            }
            MCard(Modifier.fillMaxWidth(), onClick = { if (!live.editLocked) editing = true else toast = "주행 중에는 정보를 고칠 수 없어요. 정차 후 이용해 주세요." }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Edit, null, tint = if (live.editLocked) Mung.Border else Mung.Primary, modifier = Modifier.size(28.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("여행 정보 수정", fontWeight = FontWeight.SemiBold, color = if (live.editLocked) Mung.TextSecondary else Mung.Text)
                    if (live.editLocked) { Spacer(Modifier.width(8.dp)); Pill("주행 중 잠금", Color(0xFFF0F2F6), Mung.TextSecondary) }
                }
            }
        }
    }

    // '곧 쉬어갈 시간'은 왼쪽 카드로만 알리고, 휴식 시간이 되면 창으로 묻습니다(주행 중 팝업 최소화)
    live.reminder?.takeIf { it.due }?.let { r ->
        val pet = live.petNames.first()
        AlertDialog(
            onDismissRequest = { vm.dismissReminder() },
            title = { Text(RestCare.dueTitle(pet) + " (${r.drivenMinutes}분 주행)") },
            text = { Text("${live.policy.basis.label} ${live.policy.intervalMinutes}분 간격 안내예요. 반려견의 피로도를 측정하지 않아요.") },
            confirmButton = { TextButton(onClick = { vm.findRestPlaces() }) { Text("가까운 휴식 장소 찾기") } },
            dismissButton = {
                Row {
                    if (!driving || live.isDemo) TextButton(onClick = { vm.beginRest() }) { Text("휴식 시작") }
                    TextButton(onClick = { vm.snooze() }) { Text("나중에 알림") }
                }
            },
        )
    }
    if (live.petStay == PetStay.ASK) {
        AlertDialog(
            onDismissRequest = { vm.setPetStay(PetStay.WITH_ME) },
            title = { Text("${live.petCall}도 함께 내리나요?") },
            text = { Text(if (CabinRules.isHot(live.cabin, live.pets.any { RestCare.isBrachy(it) })) CabinRules.restHeatCare(live.petCall) else "잠깐이라도 차에 두고 내리면 펫 모드 켜는 방법을 알려 드릴게요.") },
            confirmButton = { TextButton(onClick = { vm.setPetStay(PetStay.WITH_ME) }) { Text("함께 내려요") } },
            dismissButton = { TextButton(onClick = { vm.setPetStay(PetStay.IN_CAR) }) { Text("차에 잠깐 둬요") } },
        )
    }
    if (live.showPetMode) PetModeDialog(live.cabinCaps.petMode) { vm.closePetMode() }
    if (editing) TripEditDialog(live, onClose = { editing = false }) { d, c, i, rm -> vm.updateTripInfo(d, c, i, rm); editing = false }
    if (confirmArrive) {
        AlertDialog(
            onDismissRequest = { confirmArrive = false },
            title = { Text(if (live.legKind == com.mungroad.data.local.LegKind.RETURN) "집에 도착했나요?" else "${live.destination?.name ?: "여행지"}에 도착했나요?") },
            text = { Text("도착해도 여행은 끝나지 않아요. 여행지 기록과 돌아오는 길을 이어서 할 수 있어요.") },
            confirmButton = { TextButton(onClick = { confirmArrive = false; vm.arrive() }) { Text("도착") } },
            dismissButton = { TextButton(onClick = { confirmArrive = false }) { Text("계속 주행") } },
        )
    }
    live.notice?.let { n -> AlertDialog(onDismissRequest = { vm.clearNotice() }, confirmButton = { TextButton(onClick = { vm.clearNotice() }) { Text("확인") } }, text = { Text(n) }) }
    toast?.let { AlertDialog(onDismissRequest = { toast = null }, confirmButton = { TextButton(onClick = { toast = null }) { Text("확인") } }, text = { Text(it) }) }
}

@Composable
fun CabinPromptCard(p: CabinPrompt, live: LiveUi, vm: TripViewModel) {
    MCard(Modifier.width(420.dp), color = if (p.safety) Color(0xFFFFF1E6) else Mung.Mint, radius = 18.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(if (p.safety) Icons.Outlined.Warning else Icons.Outlined.Coffee, null, tint = if (p.safety) Mung.Warning else Mung.MintText, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(10.dp))
            Text(p.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        }
        if (p.ask) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val yes = when (p.kind) { CabinPromptKind.HEAT -> "에어컨 켜기"; CabinPromptKind.DOOR_REST -> "휴식 시작"; CabinPromptKind.LEAVE_CHECK -> "잠깐 두고 내려요"; else -> "네" }
                val no = when (p.kind) { CabinPromptKind.LEAVE_CHECK -> "내렸어요"; else -> "괜찮아요" }
                BigButton(yes, modifier = Modifier.weight(1f)) { vm.answerCabin(true) }
                BigButton(no, color = Mung.Secondary, modifier = Modifier.weight(1f)) { vm.answerCabin(false) }
            }
        }
        Text(if (live.isDemo) "데모 차량 상태" else "차량 상태 기반 보조 안내 · 차량 기본 안전 기능을 대신하지 않아요", fontSize = 12.sp, color = Mung.TextSecondary)
    }
}

/** 펫 모드: 멍로드는 켜는 방법만 안내하고 직접 실행하지 않습니다. */
@Composable
fun PetModeDialog(supported: Boolean, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("펫 모드 켜는 방법") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CabinRules.PET_MODE_STEPS.forEachIndexed { i, s -> Text("${i + 1}. $s", fontSize = 16.sp) }
                Spacer(Modifier.height(6.dp))
                CabinRules.PET_MODE_NOTES.forEach { Text("· $it", fontSize = 13.sp, color = Mung.TextSecondary) }
                if (!supported) Text("이 차량의 펫 모드 사양은 차량 설정에서 확인해 주세요.", fontSize = 13.sp, color = Mung.TextSecondary)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("확인") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DemoCabinPanel(vm: TripViewModel) {
    MCard(Modifier.fillMaxWidth(), color = Color(0xFFFFF8EC)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("차량 상태 시뮬레이션", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ProvenanceBadge(Provenance.DEMO)
        }
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            DemoCabinEvent.entries.forEach { ev ->
                Text(ev.label, fontSize = 14.sp, modifier = Modifier.background(Color.White, RoundedCornerShape(50)).clickable { vm.simulateCabin(ev) }.padding(horizontal = 12.dp, vertical = 8.dp))
            }
            Text("다시 출발", fontSize = 14.sp, modifier = Modifier.background(Color.White, RoundedCornerShape(50)).clickable { vm.resumeDemo() }.padding(horizontal = 12.dp, vertical = 8.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TripEditDialog(live: LiveUi, onClose: () -> Unit, onSave: (Destination?, Boolean, Int, Boolean) -> Unit) {
    var region by remember { mutableStateOf<Region?>(null) }
    var comfortable by remember { mutableStateOf(live.routeComfortable) }
    var interval by remember { mutableStateOf(live.policy.intervalMinutes) }
    var removeWp by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("여행 정보 수정") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("목적지 (지금: ${live.destination?.name ?: "미정"})", fontWeight = FontWeight.Bold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Regions.DESTINATIONS.forEach { r ->
                        val on = region?.id == r.id
                        Text(r.name, color = if (on) Color.White else Mung.Text, modifier = Modifier.background(if (on) Mung.Primary else Mung.Background, RoundedCornerShape(50)).clickable { region = if (on) null else r }.padding(horizontal = 14.dp, vertical = 8.dp))
                    }
                }
                ToggleRow("편한 길로 안내", "끄면 추천 경로", comfortable) { comfortable = it }
                if (live.waypointName != null) ToggleRow("경유지 지우기", live.waypointName ?: "", removeWp) { removeWp = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("휴식 간격", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                    TextButton(onClick = { interval = (interval - 15).coerceAtLeast(RestCare.MIN_INTERVAL) }) { Text("−15") }
                    Text("${interval}분", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    TextButton(onClick = { interval = (interval + 15).coerceAtMost(RestCare.MAX_INTERVAL) }) { Text("+15") }
                }
                Text("휴식 간격을 바꾸면 이번 여행은 보호자 설정으로 적용돼요. 실제 주행 중에는 잠겨요.", fontSize = 13.sp, color = Mung.TextSecondary)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(region?.let { Destination(it.name, it.point) }, comfortable, interval, removeWp) }) { Text("저장") } },
        dismissButton = { TextButton(onClick = onClose) { Text("취소") } },
    )
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
