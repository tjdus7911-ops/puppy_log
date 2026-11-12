package com.mungroad.ui

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
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
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.screens.CarHomeScreen
import com.mungroad.ui.screens.PetsScreen
import com.mungroad.ui.screens.DashboardScreen
import com.mungroad.ui.screens.RecordsScreen
import com.mungroad.ui.screens.SettingsScreen
import com.mungroad.ui.screens.TripSetupScreen
import com.mungroad.ui.screens.ArrivalScreen
import com.mungroad.ui.theme.Mung
import com.mungroad.ui.theme.MungRoadTheme

/** 차량 왼쪽 메뉴(시안): 홈 · 여행/경로 · 내 반려견 · 여행 기록 · 설정. 커뮤니티는 모바일 앱 전용 */
enum class Tab(val label: String, val icon: ImageVector) {
    HOME("홈", Icons.Outlined.Home), MOVE("여행", Icons.Outlined.Navigation), PETS("내 반려견", Icons.Outlined.Pets),
    RECORD("여행 기록", Icons.Outlined.MenuBook), SETTINGS("설정", Icons.Outlined.Settings),
}

class MainActivity : ComponentActivity() {
    private val vm: TripViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MungRoadTheme { App(vm) } }
    }
}

@Composable
private fun App(vm: TripViewModel) {
    val live by vm.live.collectAsState()
    var tab by remember { mutableStateOf(Tab.HOME) }
    var savedTripId by remember { mutableStateOf<String?>(null) }
    var voiceAnswer by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val voiceAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    // 위치 + 차량 속성(외기 온도·시동·기어·차속). Pleos 권한은 설치 시 부여되는 차량 권한이라 여기서 함께 요청합니다.
    LaunchedEffect(Unit) {
        permission.launch(arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION,
            "android.car.permission.CAR_SPEED", "android.car.permission.CAR_POWERTRAIN", "android.car.permission.CAR_EXTERIOR_ENVIRONMENT",
        ))
    }

    val speech = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val text = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (text != null) voiceAnswer = "\"$text\"\n→ ${vm.handleVoice(text)}"
    }
    val onVoice: () -> Unit = {
        if (voiceAvailable) {
            speech.launch(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR"),
            )
        } else voiceAnswer = "[데모 · 음성 인식 미지원]\n${vm.handleVoice("가까운 휴게소 찾아줘")}"
    }

    // 차량 OS 가 상태바(시각·통신)를 제공하므로 앱에서는 그리지 않습니다.
    Column(Modifier.fillMaxSize().background(Mung.Background)) {
        Row(Modifier.fillMaxSize()) {
            SideNav(tab) { tab = it }
            Box(Modifier.weight(1f).fillMaxHeight()) {
                when (tab) {
                    Tab.HOME -> CarHomeScreen(
                        vm,
                        onStartTrip = { tab = Tab.MOVE },
                        onOpenLive = { tab = Tab.MOVE },
                        onPets = { tab = Tab.PETS },
                        onRecords = { tab = Tab.RECORD },
                        onPlaces = { tab = Tab.MOVE },
                    )
                    Tab.MOVE -> {
                        val l = live
                        when {
                            l == null -> TripSetupScreen(vm, onAddPet = { tab = Tab.PETS })
                            l.legKind != null -> DashboardScreen(l, vm, onVoice = onVoice, voiceAvailable = voiceAvailable)
                            else -> ArrivalScreen(l, vm, onSaved = { id -> savedTripId = id; tab = Tab.RECORD })
                        }
                    }
                    Tab.PETS -> PetsScreen(vm, onStartTrip = { tab = Tab.MOVE })
                    Tab.RECORD -> RecordsScreen(vm, savedTripId)
                    Tab.SETTINGS -> SettingsScreen(vm)
                }
            }
        }
    }
    voiceAnswer?.let { AlertDialog(onDismissRequest = { voiceAnswer = null }, confirmButton = { TextButton(onClick = { voiceAnswer = null }) { Text("확인") } }, text = { Text(it) }) }
}

@Composable
private fun SideNav(selected: Tab, onSelect: (Tab) -> Unit) {
    Column(Modifier.width(96.dp).fillMaxHeight().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Tab.entries.forEach { t ->
            val on = t == selected
            Column(
                Modifier.size(76.dp).background(if (on) Mung.Primary else Color.Transparent, RoundedCornerShape(20.dp)).clickable { onSelect(t) },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Icon(t.icon, null, tint = if (on) Color.White else Mung.TextSecondary, modifier = Modifier.size(28.dp))
                Text(t.label, fontSize = 12.sp, color = if (on) Color.White else Mung.TextSecondary, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
            }
        }
    }
}
