package com.mungroad.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// Android UI 는 아직 골격 단계입니다. 화면 흐름·디자인은 web/ 프로토타입에서 검증했으며
// 같은 구조(Home / Explore / Album / MyPage + TripLive)로 Compose 화면을 옮길 예정입니다.
val MungColors = lightColorScheme(
    primary = Color(0xFF5B8C72),
    secondary = Color(0xFFF4E9D8),
    background = Color(0xFFFAF9F6),
    surface = Color(0xFFFFFFFF),
    onBackground = Color(0xFF252B28),
    tertiary = Color(0xFFF4B860),
    error = Color(0xFFE66A61),
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = MungColors) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("멍로드 MUNG ROAD", style = MaterialTheme.typography.headlineMedium)
                        Text("우리 강아지와 함께 달린 모든 길이 추억이 된다.")
                        Text("Android 앱 골격입니다. 기능 검증은 web/ 프로토타입을 참고하세요.", color = Color(0xFF778079))
                    }
                }
            }
        }
    }
}
