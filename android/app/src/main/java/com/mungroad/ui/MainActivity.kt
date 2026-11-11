package com.mungroad.ui

import android.Manifest
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SignalCellularAlt
import androidx.compose.material.icons.outlined.SignalCellularOff
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
import com.mungroad.domain.EngineStatus
import com.mungroad.trip.TripViewModel
import com.mungroad.ui.screens.CommunityScreen
import com.mungroad.ui.screens.DashboardScreen
import com.mungroad.ui.screens.RecordsScreen
import com.mungroad.ui.screens.SettingsScreen
import com.mungroad.ui.screens.TripStartScreen
import com.mungroad.ui.theme.Mung
import com.mungroad.ui.theme.MungRoadTheme
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class Tab(val label: String, val icon: ImageVector) {
    HOME("홈", Icons.Outlined.Home), MOVE("이동", Icons.Outlined.Navigation), RECORD("기록", Icons.Outlined.MenuBook),
    COMMUNITY("커뮤니티", Icons.Outlined.Groups), SETTINGS("설정", Icons.Outlined.Settings),
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
    LaunchedEffect(Unit) { permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }

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

    Column(Modifier.fillMaxSize().background(Mung.Background)) {
        StatusBar(live?.engine?.status)
        Row(Modifier.fillMaxSize()) {
            SideNav(tab) { tab = it }
            Box(Modifier.weight(1f).fillMaxHeight()) {
                when (tab) {
                    Tab.HOME, Tab.MOVE -> live?.let { DashboardScreen(it, vm, onEnded = { id -> savedTripId = id; tab = Tab.RECORD }, onVoice = onVoice, voiceAvailable = voiceAvailable) }
                        ?: TripStartScreen(vm)
                    Tab.RECORD -> RecordsScreen(vm, savedTripId)
                    Tab.COMMUNITY -> CommunityScreen()
                    Tab.SETTINGS -> SettingsScreen(vm)
                }
            }
        }
    }
    voiceAnswer?.let { AlertDialog(onDismissRequest = { voiceAnswer = null }, confirmButton = { TextButton(onClick = { voiceAnswer = null }) { Text("확인") } }, text = { Text(it) }) }
}

/** 상단 상태 바: 시각·주행 상태·로고·네트워크. 차량이 주지 않는 정보(외기온 등)는 표시하지 않습니다. */
@Composable
private fun StatusBar(status: EngineStatus?) {
    val context = LocalContext.current
    var now by remember { mutableStateOf(Date()) }
    var online by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        while (true) {
            now = Date()
            online = cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
            delay(15_000)
        }
    }
    Row(Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(SimpleDateFormat("a h:mm", Locale.KOREAN).format(now), fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(16.dp))
        status?.let {
            Text(
                when (it) { EngineStatus.DRIVING -> "주행"; EngineStatus.STOPPED -> "정차"; EngineStatus.RESTING -> "휴식"; EngineStatus.ENDED -> "" },
                fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Mung.Primary,
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Pets, null, tint = Mung.Primary)
            Spacer(Modifier.width(6.dp))
            Text("멍로드", fontSize = 21.sp, fontWeight = FontWeight.Bold)
        }
        Icon(if (online) Icons.Outlined.SignalCellularAlt else Icons.Outlined.SignalCellularOff, "네트워크", tint = if (online) Mung.Text else Mung.Danger)
    }
}

@Composable
private fun SideNav(selected: Tab, onSelect: (Tab) -> Unit) {
    Column(Modifier.width(96.dp).fillMaxHeight().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Tab.entries.forEach { t ->
            val on = t == selected
            Column(
                Modifier.size(76.dp).background(if (on) Mung.PrimaryLight else Color.Transparent, RoundedCornerShape(20.dp)).clickable { onSelect(t) },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Icon(t.icon, null, tint = if (on) Mung.Primary else Mung.TextSecondary, modifier = Modifier.size(28.dp))
                Text(t.label, fontSize = 13.sp, color = if (on) Mung.Primary else Mung.TextSecondary, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
            }
        }
    }
}
