package com.mungroad.providers

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.mungroad.data.local.PlaceCategory
import com.mungroad.domain.TripEngine
import com.mungroad.vehicle.DemoRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.math.cos
import kotlin.math.sin

// ═════════════════════════════════════════════════════
// NavigationProvider — 목적지·경로·내비 연결
// ═════════════════════════════════════════════════════
interface NavigationProvider {
    val provenance: Provenance
    /** 차량 내비에 설정된 목적지/경로. 읽을 수 없으면 null → 앱에서 목적지 직접 설정(대체 흐름) */
    suspend fun currentRoute(current: GeoPoint?): RouteSnapshot?
    /** 휴식 장소로 안내: 경유지 추가 → 실패 시 목적지 전달 → 실패 시 외부 지도 앱 */
    suspend fun guideTo(name: String, point: GeoPoint, preferWaypoint: Boolean): NavRequestResult
}

/** 데모: 서울→강릉 고정 경로, ETA 는 남은 거리/평균속도로 추정 */
class DemoNavigationProvider : NavigationProvider {
    override val provenance = Provenance.DEMO
    private val dest = Destination("강릉 경포해변", DemoRoute.pointAt(DemoRoute.totalKm).let { GeoPoint(it.first, it.second) })

    override suspend fun currentRoute(current: GeoPoint?): RouteSnapshot {
        val remaining = current?.let { estimateRemainingKm(it) }
        return RouteSnapshot(
            destination = dest,
            path = DemoRoute.points.map { GeoPoint(it.first, it.second) },
            remainingDistanceKm = remaining,
            etaEpochMillis = remaining?.let { System.currentTimeMillis() + (it / 80.0 * 3_600_000).toLong() },
            isEstimated = true,
            provenance = Provenance.DEMO,
        )
    }

    private fun estimateRemainingKm(p: GeoPoint): Double {
        // 경로 위 가장 가까운 점부터 끝까지의 거리
        val pts = DemoRoute.points
        var bestIdx = 0
        var best = Double.MAX_VALUE
        pts.forEachIndexed { i, q ->
            val d = TripEngine.haversineKm(p.lat, p.lng, q.first, q.second)
            if (d < best) { best = d; bestIdx = i }
        }
        var sum = 0.0
        for (i in bestIdx until pts.size - 1) sum += TripEngine.haversineKm(pts[i].first, pts[i].second, pts[i + 1].first, pts[i + 1].second)
        return sum
    }

    override suspend fun guideTo(name: String, point: GeoPoint, preferWaypoint: Boolean) =
        NavRequestResult.Failed("데모 모드에서는 실제 길 안내를 요청하지 않아요.")
}

/**
 * 차량 내비 경로를 읽을 수 없을 때의 대체 흐름.
 * 사용자가 멍로드에서 정한 목적지만 알고, 길 안내는 외부 지도 앱(카카오맵 URL 스킴)으로 넘깁니다.
 */
class ManualDestinationNavigationProvider(
    private val context: Context,
    private val destinationProvider: () -> Destination?,
) : NavigationProvider {
    override val provenance = Provenance.REAL

    override suspend fun currentRoute(current: GeoPoint?): RouteSnapshot? {
        val d = destinationProvider() ?: return null
        val remaining = if (current != null && d.point != null) TripEngine.haversineKm(current.lat, current.lng, d.point.lat, d.point.lng) else null
        return RouteSnapshot(d, emptyList(), remaining, null, isEstimated = true, provenance = Provenance.REAL)
    }

    override suspend fun guideTo(name: String, point: GeoPoint, preferWaypoint: Boolean): NavRequestResult {
        // 카카오맵 앱 URL 스킴: kakaomap://route?ep=위도,경도&by=CAR
        val uri = Uri.parse("kakaomap://route?ep=${point.lat},${point.lng}&by=CAR")
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
            NavRequestResult.OpenedExternalApp("카카오맵")
        } else NavRequestResult.Failed("길 안내를 열 수 있는 지도 앱이 없어요.")
    }
}

// ═════════════════════════════════════════════════════
// TrafficInfoProvider — 사고·공사·낙하물·정체
// ═════════════════════════════════════════════════════
interface TrafficInfoProvider {
    val provenance: Provenance
    suspend fun hazardsNear(route: List<GeoPoint>, current: GeoPoint?): Result<List<Hazard>>
}

/** 데모 전용 위험 정보. UI 는 '데모' 배지를 반드시 표시합니다. 실제 정보처럼 보이지 않게 메시지에도 명시합니다. */
class DemoTrafficInfoProvider : TrafficInfoProvider {
    override val provenance = Provenance.DEMO
    private val items = listOf(
        Triple(HazardType.CONSTRUCTION, 58.0, "[데모] 2차로 공사"),
        Triple(HazardType.ACCIDENT, 104.0, "[데모] 갓길 사고 처리 중"),
        Triple(HazardType.DEBRIS, 141.0, "[데모] 낙하물 신고"),
        Triple(HazardType.CONGESTION, 190.0, "[데모] 서행 구간"),
    )

    override suspend fun hazardsNear(route: List<GeoPoint>, current: GeoPoint?) = Result.success(
        items.mapIndexed { i, (t, km, msg) ->
            val (lat, lng) = DemoRoute.pointAt(km)
            Hazard("demo-$i", t, GeoPoint(lat, lng), "영동고속도로(데모)", msg, null, null, Provenance.DEMO, "데모")
        },
    )
}

/** 서버 프록시(/api/traffic → ITS 국가교통정보센터 돌발상황정보). 키는 서버에만 있습니다. */
class ProxyTrafficInfoProvider(private val baseUrl: String) : TrafficInfoProvider {
    override val provenance = Provenance.REAL

    override suspend fun hazardsNear(route: List<GeoPoint>, current: GeoPoint?): Result<List<Hazard>> = runCatching {
        val pts = route.ifEmpty { listOfNotNull(current) }
        require(pts.isNotEmpty()) { "위치 정보가 없어요." }
        val minX = pts.minOf { it.lng } - 0.05; val maxX = pts.maxOf { it.lng } + 0.05
        val minY = pts.minOf { it.lat } - 0.05; val maxY = pts.maxOf { it.lat } + 0.05
        val body = httpGet("$baseUrl/api/traffic?minX=$minX&maxX=$maxX&minY=$minY&maxY=$maxY")
        val arr = JSONObject(body).getJSONArray("hazards")
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Hazard(
                id = o.getString("id"),
                type = runCatching { HazardType.valueOf(o.getString("type")) }.getOrDefault(HazardType.OTHER),
                point = GeoPoint(o.getDouble("lat"), o.getDouble("lng")),
                roadName = o.optString("roadName").ifBlank { null },
                message = o.optString("message").ifBlank { null },
                laneInfo = o.optString("lanes").ifBlank { null },
                startedAt = null,
                provenance = Provenance.REAL,
                source = "ITS 국가교통정보센터",
            )
        }
    }
}

// ═════════════════════════════════════════════════════
// PetPlaceProvider — 반려견 동반 장소
// ═════════════════════════════════════════════════════
interface PetPlaceProvider {
    val provenance: Provenance
    /** 이 데이터가 반려동물 동반 조건 필드를 제공하는지(아니면 필터 비활성 + '확인 필요') */
    val providesPetPolicy: Boolean
    suspend fun search(category: PlaceCategory?, center: GeoPoint, radiusKm: Double, keyword: String? = null): Result<List<PetPlace>>
}

/** 가상 샘플. 이름에 '샘플'을 붙여 실제 장소로 오인되지 않게 합니다. */
class SamplePetPlaceProvider : PetPlaceProvider {
    override val provenance = Provenance.SAMPLE
    override val providesPetPolicy = true
    private val names = mapOf(
        PlaceCategory.REST_AREA to "샘플 반려 쉼터", PlaceCategory.CAFE to "샘플 멍멍 카페", PlaceCategory.RESTAURANT to "샘플 들꽃 식당",
        PlaceCategory.PARK to "샘플 솔숲 산책로", PlaceCategory.LODGING to "샘플 펫스테이", PlaceCategory.VET to "샘플 튼튼 동물병원",
    )

    override suspend fun search(category: PlaceCategory?, center: GeoPoint, radiusKm: Double, keyword: String?) = Result.success(
        (category?.let { listOf(it) } ?: PlaceCategory.entries).flatMapIndexed { ci, c ->
            (0 until 2).map { i ->
                val ang = (ci * 2 + i) * 1.1
                val d = 1.0 + i * 2.0
                PetPlace(
                    id = "sample-$c-$i", name = "${names[c]} ${i + 1}", category = c, address = "샘플 주소",
                    point = GeoPoint(center.lat + d / 111 * cos(ang), center.lng + d / 88 * sin(ang)), phone = null,
                    policy = PetPolicy(petAllowed = i == 0, smallDog = true, largeDog = if (i == 0) true else null, indoor = null, parking = true),
                    provenance = Provenance.SAMPLE, sourceLabel = "샘플 데이터",
                )
            }
        },
    )
}

/**
 * 카카오 로컬 키워드 검색(서버 프록시 경유). 카카오 응답에는 반려동물 동반 필드가 없으므로
 * 모든 동반 조건을 null('확인 필요')로 둡니다. 키워드에 '애견동반'이 있어도 동반 가능으로 표시하지 않습니다.
 */
class KakaoProxyPetPlaceProvider(private val baseUrl: String) : PetPlaceProvider {
    override val provenance = Provenance.REAL
    override val providesPetPolicy = false
    private val keyword = mapOf(
        PlaceCategory.RESTAURANT to "애견동반 식당", PlaceCategory.CAFE to "애견동반 카페", PlaceCategory.PARK to "반려견 산책",
        PlaceCategory.REST_AREA to "휴게소", PlaceCategory.LODGING to "애견동반 숙소", PlaceCategory.VET to "동물병원",
    )

    override suspend fun search(category: PlaceCategory?, center: GeoPoint, radiusKm: Double, keyword: String?): Result<List<PetPlace>> = runCatching {
        val cats = category?.let { listOf(it) } ?: listOf(PlaceCategory.REST_AREA, PlaceCategory.CAFE, PlaceCategory.RESTAURANT, PlaceCategory.PARK)
        cats.flatMap { c ->
            val q = URLEncoder.encode(keyword ?: this.keyword.getValue(c), "UTF-8")
            val body = httpGet("$baseUrl/api/places?query=$q&lat=${center.lat}&lng=${center.lng}&radius=${(radiusKm * 1000).toInt().coerceAtMost(20000)}")
            val arr = JSONObject(body).getJSONArray("places")
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                PetPlace(
                    id = "kakao-${o.getString("id")}", name = o.getString("name"), category = c, address = o.optString("address"),
                    point = GeoPoint(o.getDouble("latitude"), o.getDouble("longitude")), phone = o.optString("phone").ifBlank { null },
                    policy = PetPolicy.UNKNOWN, provenance = Provenance.REAL, sourceLabel = "카카오 로컬",
                )
            }
        }.distinctBy { it.id }
    }
}

// ═════════════════════════════════════════════════════
// TravelDiaryService — AI 일기(서버) + 템플릿 대체
// ═════════════════════════════════════════════════════
data class DiaryInput(
    val petNames: List<String>, val dateText: String, val startRegion: String?, val endRegion: String?,
    val distanceKm: Double, val drivingMinutes: Int, val restCount: Int, val places: List<String>, val memo: String,
)

class TravelDiaryService(private val baseUrl: String) {
    data class Diary(val text: String, val isAi: Boolean, val fallbackReason: String?)

    suspend fun generate(input: DiaryInput): Diary {
        if (baseUrl.isBlank()) return Diary(template(input), false, null)
        return runCatching {
            val payload = JSONObject()
                .put("petNames", org.json.JSONArray(input.petNames)).put("date", input.dateText)
                .put("startRegion", input.startRegion).put("endRegion", input.endRegion)
                .put("distanceKm", input.distanceKm.toInt()).put("drivingMinutes", input.drivingMinutes)
                .put("restCount", input.restCount).put("places", org.json.JSONArray(input.places)).put("memo", input.memo)
            val text = JSONObject(httpPost("$baseUrl/api/diary", payload.toString())).optString("text").trim()
            if (text.isBlank()) Diary(template(input), false, "AI 응답이 비어 있어요") else Diary(text, true, null)
        }.getOrElse { Diary(template(input), false, "AI 서버에 연결할 수 없어요") }
    }

    /** 실제 기록만 사용. 감정·건강 단정 없음. */
    fun template(d: DiaryInput): String = buildString {
        val who = d.petNames.joinToString(", ").ifBlank { "우리 강아지" }
        if (d.endRegion != null && d.startRegion != null && d.endRegion != d.startRegion) append("${d.dateText}, ${who}와 함께 ${d.startRegion}에서 ${d.endRegion}까지 달렸다.")
        else append("${d.dateText}, ${who}와 함께 길을 나섰다.")
        append("\n\n${d.distanceKm.toInt()}km를 이동하며 실제로 달린 시간은 ${d.drivingMinutes / 60}시간 ${d.drivingMinutes % 60}분이었고, ")
        append(if (d.restCount == 0) "따로 쉬어가지는 않았다." else "중간에 ${d.restCount}번 쉬어갔다.")
        if (d.places.isNotEmpty()) append("\n\n가는 길에 ${d.places.take(3).joinToString(", ")}에 들렀다.")
        if (d.memo.isNotBlank()) append("\n\n메모: ${d.memo.trim()}")
        append("\n\n${who}와 함께한 오늘의 길도 오래 기억하고 싶은 하루로 남겨 둔다.")
    }
}

// ── 공통 HTTP (Android 기본 HttpURLConnection, 추가 의존성 없음) ──
internal suspend fun httpGet(url: String): String = withContext(Dispatchers.IO) {
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 8000; c.readTimeout = 10000
    try {
        if (c.responseCode !in 200..299) error("서버 오류 (${c.responseCode})")
        c.inputStream.bufferedReader().use { it.readText() }
    } finally { c.disconnect() }
}

internal suspend fun httpPost(url: String, json: String): String = withContext(Dispatchers.IO) {
    val c = URL(url).openConnection() as HttpURLConnection
    c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 30000
    c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    try {
        c.outputStream.use { it.write(json.toByteArray()) }
        if (c.responseCode !in 200..299) error("서버 오류 (${c.responseCode})")
        c.inputStream.bufferedReader().use { it.readText() }
    } finally { c.disconnect() }
}
