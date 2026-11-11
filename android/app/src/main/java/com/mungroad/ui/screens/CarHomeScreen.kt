package com.mungroad.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.R
import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import com.mungroad.domain.EngineStatus
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.theme.Mung

/**
 * 차량 메인 홈 (시안 1 상단). 웹 web/src/screens/home/CarHome.tsx 와 같은 구성.
 * 중앙: 여행 히어로 + 나의 반려견 / 진행 중인 여행 · 오른쪽: 새 여행 시작 + 2×2 메뉴.
 * 차량 OS 상태바는 앱에서 다시 그리지 않습니다.
 */
@Composable
fun CarHomeScreen(
    vm: TripViewModel,
    onStartTrip: () -> Unit,
    onOpenLive: () -> Unit,
    onPets: () -> Unit,
    onRecords: () -> Unit,
    onPlaces: () -> Unit,
) {
    val pets by vm.pets.collectAsState()
    val live by vm.live.collectAsState()
    val trips by vm.trips.collectAsState()
    val pet = pets.firstOrNull()

    Row(Modifier.fillMaxSize().padding(start = 4.dp, end = 20.dp, top = 16.dp, bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── 중앙 히어로 ──
        Box(Modifier.weight(1f).fillMaxHeight().shadow(12.dp, RoundedCornerShape(28.dp)).clip(RoundedCornerShape(28.dp))) {
            Image(painterResource(R.drawable.bg_coast), contentDescription = "바닷가 해안도로 기본 배경", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0x8C14254A), Color(0x0014254A)))))
            Column(Modifier.padding(start = 40.dp, top = 36.dp)) {
                Text("반려견과 떠나는\n특별한 드라이브", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 42.sp)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("멍로드", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Outlined.Pets, null, tint = Color.White, modifier = Modifier.size(32.dp))
                }
            }
            Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                HeroCard("나의 반려견", Modifier.weight(1f), onClick = onPets) {
                    if (pet == null) {
                        Text("반려견 등록하기", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("함께 떠날 친구를 알려 주세요", fontSize = 14.sp, color = Mung.TextSecondary)
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            PawAvatar(pet.name, 56.dp)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if (pets.size > 1) "${pet.name} 외 ${pets.size - 1}마리" else pet.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(if (pets.size > 1) pets.joinToString(" · ") { it.name } else petLine(pet), fontSize = 14.sp, color = Mung.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                HeroCard("진행 중인 여행", Modifier.weight(1.25f), onClick = { if (live != null) onOpenLive() else onStartTrip() }) {
                    val l = live
                    if (l == null) {
                        Text("진행 중인 여행이 없어요", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(trips.firstOrNull()?.let { "최근: ${it.title}" } ?: "새 여행을 시작해 보세요", fontSize = 14.sp, color = Mung.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    } else {
                        val state = when (l.engine.status) { EngineStatus.RESTING -> "휴식 중"; EngineStatus.DRIVING -> "이동 중"; else -> "정차" }
                        val etaMin = l.route?.etaEpochMillis?.let { ((it - System.currentTimeMillis()) / 60_000).coerceAtLeast(0) }
                        val eta = etaMin?.let { " · 약 ${it / 60}시간 ${it % 60}분 남음" + if (l.route?.isEstimated == true) "(예상)" else "" } ?: ""
                        Text("${l.route?.destination?.name ?: "목적지 미정"} 여행", fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(state + eta, fontSize = 14.sp, color = Mung.TextSecondary, maxLines = 1)
                    }
                }
            }
        }
        // ── 오른쪽 기능 메뉴 ──
        Column(Modifier.width(360.dp).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(
                Modifier.fillMaxWidth().height(96.dp).shadow(10.dp, RoundedCornerShape(26.dp)).clip(RoundedCornerShape(26.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF6A9CF7), Mung.Primary, Color(0xFF3765CC))))
                    .clickable { if (live != null) onOpenLive() else onStartTrip() }
                    .padding(horizontal = 26.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.DirectionsCar, null, tint = Color.White, modifier = Modifier.size(30.dp))
                Spacer(Modifier.width(14.dp))
                Text(if (live != null) "주행 화면으로" else "새 여행 시작", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ChevronRight, null, tint = Color.White, modifier = Modifier.size(28.dp))
            }
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                MenuTile(Icons.Outlined.Place, "여행 계획", "(목적지 · 경로)", Modifier.weight(1f), onStartTrip)
                MenuTile(Icons.Outlined.Pets, "내 반려견", "(프로필 · 설정)", Modifier.weight(1f), onPets)
            }
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                MenuTile(Icons.Outlined.History, "여행 기록", "(이동 · 휴식 · 방문)", Modifier.weight(1f), onRecords)
                MenuTile(Icons.AutoMirrored.Outlined.MenuBook, "추천 장소", "(카페 · 공원 · 숙소)", Modifier.weight(1f), onPlaces)
            }
        }
    }
}

fun petLine(p: PetEntity): String {
    val size = when (p.size) { PetSize.SMALL -> "소형견"; PetSize.MEDIUM -> "중형견"; PetSize.LARGE -> "대형견" }
    return listOfNotNull(size, p.ageYears?.let { "${it}살" }).joinToString(" · ")
}

@Composable
private fun HeroCard(label: String, modifier: Modifier, onClick: () -> Unit, content: @Composable () -> Unit) {
    Column(
        modifier.shadow(8.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(Color(0xF2FFFFFF)).clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 14.dp),
    ) {
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Mung.TextSecondary)
        Spacer(Modifier.height(10.dp))
        content()
    }
}

@Composable
private fun MenuTile(icon: ImageVector, title: String, sub: String, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.fillMaxHeight().shadow(4.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(Mung.Surface).clickable(onClick = onClick).padding(22.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = Mung.Primary, modifier = Modifier.size(36.dp))
        Spacer(Modifier.height(10.dp))
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Text(sub, fontSize = 14.sp, color = Mung.TextSecondary)
    }
}
