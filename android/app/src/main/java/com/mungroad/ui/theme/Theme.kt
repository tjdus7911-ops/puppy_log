package com.mungroad.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// UI 시안 컬러 시스템 (화이트 · 파스텔 블루)
object Mung {
    val Background = Color(0xFFF7FAFF)
    val Surface = Color(0xFFFFFFFF)
    val Primary = Color(0xFF4D80E8)
    val PrimaryLight = Color(0xFFE8F1FF)
    val Secondary = Color(0xFF8DAEF5)
    val Mint = Color(0xFFDDF6ED)
    val MintText = Color(0xFF1F7A5A)
    val Text = Color(0xFF202D42)
    val TextSecondary = Color(0xFF74849A)
    val Border = Color(0xFFE3EAF4)
    val Warning = Color(0xFFF5A623)
    val Danger = Color(0xFFEF5350)
    val Debris = Color(0xFFF7C948)
    val Congestion = Color(0xFF8E6BD6)
}

private val Scheme = lightColorScheme(
    primary = Mung.Primary, onPrimary = Color.White, primaryContainer = Mung.PrimaryLight,
    secondary = Mung.Secondary, background = Mung.Background, surface = Mung.Surface,
    onBackground = Mung.Text, onSurface = Mung.Text, onSurfaceVariant = Mung.TextSecondary,
    outline = Mung.Border, error = Mung.Danger, tertiaryContainer = Mung.Mint,
)

// 차량 화면 가독성: 본문 16sp 이상, 핵심 수치 크게
private val Type = Typography(
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Mung.Text),
    titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.Bold, color = Mung.Text),
    titleMedium = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Mung.Text),
    bodyLarge = TextStyle(fontSize = 17.sp, color = Mung.Text),
    bodyMedium = TextStyle(fontSize = 15.sp, color = Mung.TextSecondary),
    labelLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
)

@Composable
fun MungRoadTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = Scheme, typography = Type, content = content)
