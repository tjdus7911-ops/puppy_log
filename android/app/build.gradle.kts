plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val usePleosSdk = (findProperty("mungroad.usePleosSdk") as String?)?.toBoolean() == true

android {
    namespace = "com.mungroad"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.mungroad"
        minSdk = 28 // Pleos Connect SDK 요구사항: Android API 28 이상
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("boolean", "USE_PLEOS_SDK", usePleosSdk.toString())
        ksp { arg("room.schemaLocation", "$projectDir/schemas") }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // AAOS Car API (GEAR_SELECTION, PERF_VEHICLE_SPEED 등 표준 차량 속성)
    useLibrary("android.car")
}

dependencies {
    val room = "2.6.1"
    implementation("androidx.room:room-runtime:$room")
    implementation("androidx.room:room-ktx:$room")
    ksp("androidx.room:room-compiler:$room")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    if (usePleosSdk) {
        implementation("ai.pleos.playground:Vehicle:2.3.1")
    }
    testImplementation("junit:junit:4.13.2")
}
