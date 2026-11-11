package com.mungroad.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mungroad.providers.Provenance
import com.mungroad.ui.theme.Mung

@Composable
fun MCard(
    modifier: Modifier = Modifier,
    color: Color = Mung.Surface,
    radius: Dp = 22.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Column(
        modifier
            .shadow(6.dp, shape, ambientColor = Color(0x1A4D80E8), spotColor = Color(0x1A4D80E8))
            .background(color, shape)
            .border(1.dp, Mung.Border.copy(alpha = 0.6f), shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(18.dp),
        content = content,
    )
}

@Composable
fun Pill(text: String, bg: Color = Mung.PrimaryLight, fg: Color = Mung.Primary) {
    Text(
        text, color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.background(bg, RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 5.dp),
    )
}

/** REAL 이 아닌 데이터에는 항상 배지를 붙입니다. */
@Composable
fun ProvenanceBadge(p: Provenance) {
    when (p) {
        Provenance.DEMO -> Pill("데모", Color(0xFFFFF3DD), Color(0xFF9A6A12))
        Provenance.SAMPLE -> Pill("샘플 데이터", Color(0xFFFFF3DD), Color(0xFF9A6A12))
        Provenance.UNAVAILABLE -> Pill("미연동", Color(0xFFF0F2F6), Mung.TextSecondary)
        Provenance.REAL -> Unit
    }
}

@Composable
fun StatCell(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier.background(Mung.Background, RoundedCornerShape(16.dp)).padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = Mung.Primary, modifier = Modifier.size(24.dp))
        Spacer(Modifier.size(6.dp))
        Text(label, fontSize = 13.sp, color = Mung.TextSecondary)
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Mung.Text)
    }
}

@Composable
fun BigButton(text: String, icon: ImageVector? = null, color: Color = Mung.Primary, modifier: Modifier = Modifier.fillMaxWidth(), enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        modifier
            .background(if (enabled) color else color.copy(alpha = 0.4f), RoundedCornerShape(50))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 18.dp, horizontal = 22.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { Icon(icon, null, tint = Color.White); Spacer(Modifier.width(8.dp)) }
        Text(text, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun PawAvatar(name: String, size: Dp = 72.dp) {
    Box(
        Modifier.size(size).background(Mung.PrimaryLight, CircleShape).border(3.dp, Color.White, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text(name.take(1), fontSize = (size.value / 2.6).sp, fontWeight = FontWeight.Bold, color = Mung.Primary) }
}
