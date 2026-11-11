package com.mungroad

import android.app.Application
import com.mungroad.data.local.MungRoadDatabase

class MungRoadApp : Application() {
    val db by lazy { MungRoadDatabase.get(this) }
}
