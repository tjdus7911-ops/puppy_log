package com.mungroad.sdk

import android.content.Context
import com.mungroad.providers.NavigationProvider

/** Pleos SDK 를 끈 빌드(mungroad.usePleosSdk=false): 차량 내비 연동 없음 → 앱 목적지 설정 대체 흐름 사용 */
object PleosBindings {
    const val ENABLED = false
    fun navigationProvider(context: Context): NavigationProvider? = null
    fun statusText(): String = "Pleos SDK 미포함 빌드"
}
