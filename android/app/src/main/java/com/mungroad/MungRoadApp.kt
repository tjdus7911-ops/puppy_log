package com.mungroad

import android.app.Application
import com.mungroad.data.local.MungRoadDatabase
import com.mungroad.sdk.initMapSdk

class MungRoadApp : Application() {
    val db by lazy { MungRoadDatabase.get(this) }

    override fun onCreate() {
        super.onCreate()
        initMapSdk(this) // 카카오맵 SDK 를 켠 빌드에서만 실제 초기화(키는 local.properties → BuildConfig)
    }
}
