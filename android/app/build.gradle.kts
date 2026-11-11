import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// ── 키·플래그는 local.properties 에서 읽습니다(저장소에 커밋하지 않음). local.properties.example 참고 ──
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun prop(name: String, default: String = ""): String =
    (localProps.getProperty(name) ?: findProperty(name) as String? ?: default).trim()

/** Pleos Connect SDK(NaviHelper·Vehicle) 사용 여부. nexus-playground 접근과 에뮬레이터가 필요합니다. */
val usePleosSdk = prop("mungroad.usePleosSdk", "false").toBoolean()
/** 카카오맵 Android SDK v2 사용 여부. 네이티브 앱 키가 필요합니다(arm64-v8a/armeabi-v7a 만 지원). */
val useKakaoMap = prop("mungroad.useKakaoMap", "false").toBoolean()

android {
    namespace = "com.mungroad"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mungroad"
        minSdk = 28 // Pleos Connect SDK 요구사항: API 28 이상
        targetSdk = 34
        versionCode = 2
        versionName = "0.2.0"
        buildConfigField("boolean", "USE_PLEOS_SDK", usePleosSdk.toString())
        buildConfigField("boolean", "USE_KAKAO_MAP", useKakaoMap.toString())
        buildConfigField("String", "KAKAO_NATIVE_APP_KEY", "\"${prop("KAKAO_NATIVE_APP_KEY")}\"")
        // REST/ITS/AI 키는 앱에 넣지 않고 server/ 프록시 주소만 넣습니다.
        buildConfigField("String", "MUNGROAD_API_BASE_URL", "\"${prop("MUNGROAD_API_BASE_URL")}\"")
        if (useKakaoMap) {
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        }
    }

    // SDK 의존 코드는 플래그를 켤 때만 컴파일합니다. 끄면 같은 이름의 Stub 이 들어갑니다.
    sourceSets["main"].java.srcDir(if (usePleosSdk) "src/pleos/java" else "src/pleosStub/java")
    sourceSets["main"].java.srcDir(if (useKakaoMap) "src/kakaomap/java" else "src/kakaomapStub/java")

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // AAOS Car API(GEAR_SELECTION, PERF_VEHICLE_SPEED). 일반 휴대폰 에뮬레이터에서는 런타임에 없을 수 있어 required=false
    useLibrary("android.car")
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    val room = "2.6.1"
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.room:room-runtime:$room")
    implementation("androidx.room:room-ktx:$room")
    ksp("androidx.room:room-compiler:$room")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.ui:ui-tooling-preview")

    if (usePleosSdk) {
        // 버전은 Pleos 문서의 최신 값으로 맞추세요(문서 시점 예: Vehicle 2.3.x, NaviHelper 3.0.x).
        implementation("ai.pleos.playground:Vehicle:${prop("pleos.vehicleVersion", "2.3.2")}")
        implementation("ai.pleos.playground:NaviHelper:${prop("pleos.naviHelperVersion", "3.0.5")}")
    }
    if (useKakaoMap) {
        implementation("com.kakao.maps.open:android:${prop("kakao.mapVersion", "2.12.7")}")
    }

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
