package com.mungroad.sdk

import android.content.Context
import com.mungroad.providers.NavigationProvider
import com.mungroad.vehicle.CabinSource
import com.mungroad.vehicle.Speaker

/** Pleos SDK 를 끈 빌드(mungroad.usePleosSdk=false): 차량 내비·차량 상태·Pleos 음성 없음 → 대체 흐름 */
object PleosBindings {
    const val ENABLED = false
    fun navigationProvider(context: Context): NavigationProvider? = null
    fun cabinSource(context: Context): CabinSource? = null
    fun speaker(context: Context): Speaker? = null
    fun statusText(): String = "Pleos SDK 미포함 빌드"
}
