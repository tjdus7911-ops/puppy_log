package com.mungroad.domain

import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import java.util.Calendar

// 반려견 맞춤 휴식 추천 — 웹 web/src/domain/restCare.ts 와 같은 규칙(기획서 3장 '휴식 간격 기준표', 초안).
// 적용 순서: 수의사 안내 간격 → 보호자가 직접 정한 간격 → 기준표 추천(초안) → 앱 기본값 90분.
// 여러 마리면 가장 짧은 간격. 피로도·건강을 측정한 것처럼 말하지 않습니다.

object Korean {
    /** 받침이 있으면 a, 없으면 b */
    fun josa(word: String, a: String, b: String): String {
        val c = word.trim().lastOrNull() ?: return b
        if (c < '가' || c > '힣') return b
        return if ((c - '가') % 28 != 0) a else b
    }
    /** "사슴" → "사슴이", "코코" → "코코" */
    fun callName(name: String) = josa(name, "${name}이", name)
    fun petNames(names: List<String>): String {
        val c = names.map(::callName)
        return when (c.size) {
            0 -> "우리 강아지"
            1 -> c[0]
            2 -> "${c[0]}${josa(c[0], "과", "와")} ${c[1]}"
            else -> c.dropLast(1).joinToString(", ") + ", " + c.last()
        }
    }
}

enum class HealthCondition(val label: String) { NONE("질환 없음"), JOINT_HEART_RESP("관절·심장·호흡기"), KIDNEY_DIABETES("신장 질환·당뇨") }

enum class RestBasis(val label: String) { VET("수의사 안내"), GUARDIAN("보호자 설정"), GUIDELINE("기준표 추천(초안)"), APP_DEFAULT("앱 기본값") }

data class GuidelineItem(val id: String, val label: String, val minutes: Int, val tip: String, val source: String)

data class RestPolicy(
    val intervalMinutes: Int,
    val basis: RestBasis,
    val petId: String?,
    val reasons: List<String>,
    /** 출발 전 확인 안내(간격을 바꾸지 않음) */
    val prompts: List<String>,
)

object RestCare {
    const val APP_DEFAULT_INTERVAL = 90
    const val MIN_INTERVAL = 30
    const val MAX_INTERVAL = 240
    const val GUIDELINE_NOTE = "기준표는 공개 자료를 바탕으로 한 초안이며 출시 전 수의사 자문으로 확정해요. 진단이 아니며 언제든 고칠 수 있어요."

    private const val SRC_MAFRA = "농림축산식품부 반려동물 동반 차량 이동 권고 — 장거리 이동 시 최소 2시간마다 휴식"
    private const val SRC_AKC_PUPPY = "AKC — 월령 1개월당 약 1시간 배변을 참는다는 경험칙(여유 있게 적용)"
    private const val SRC_AKC_SENIOR = "AKC·PetMD — 노령견은 배변 기회를 늘리는 것이 도움, 노령 시작 나이는 체급별로 다름"
    private const val SRC_RVC = "RVC VetCompass(2020) — 얼굴이 납작한 견종은 열사병 위험이 약 2배"
    private const val SRC_AAHA_DM = "AAHA·PetPlace — 당뇨·신장 질환은 배뇨가 늘어 배변 기회가 더 자주 필요"

    private val BRACHY = Regex("퍼그|불독|불도그|프렌치|시추|시츄|페키니즈|보스턴\\s*테리어|복서|브뤼셀|그리폰|라사|카발리에|pug|bulldog|shih|pekingese|boston|boxer", RegexOption.IGNORE_CASE)

    fun breedLooksBrachy(breed: String?) = !breed.isNullOrBlank() && BRACHY.containsMatchIn(breed)
    fun isBrachy(p: PetEntity) = p.brachycephalic ?: breedLooksBrachy(p.breed)

    fun ageMonths(p: PetEntity, now: Long = System.currentTimeMillis()): Int? {
        p.birthDate?.let { s ->
            val parts = s.split("-").mapNotNull { it.toIntOrNull() }
            if (parts.size == 3) {
                val c = Calendar.getInstance().apply { timeInMillis = now }
                val m = (c.get(Calendar.YEAR) - parts[0]) * 12 + (c.get(Calendar.MONTH) + 1 - parts[1]) - if (c.get(Calendar.DAY_OF_MONTH) < parts[2]) 1 else 0
                return m.coerceAtLeast(0)
            }
        }
        return p.ageYears?.let { it * 12 }
    }

    private fun seniorFrom(size: PetSize) = when (size) { PetSize.SMALL -> 10; PetSize.MEDIUM -> 8; PetSize.LARGE -> 7 }
    fun suggestSenior(p: PetEntity, now: Long = System.currentTimeMillis()): Boolean? = ageMonths(p, now)?.let { it >= seniorFrom(p.size) * 12 }

    enum class Stage { PUPPY, ADULT, SENIOR }

    fun stage(p: PetEntity, now: Long = System.currentTimeMillis()): Stage? {
        val m = ageMonths(p, now)
        if (p.senior == true) return Stage.SENIOR
        if (m != null && m < 12) return Stage.PUPPY
        if (p.senior == null && suggestSenior(p, now) == true) return Stage.SENIOR
        return if (m != null || p.senior == false) Stage.ADULT else null
    }

    fun condition(p: PetEntity): HealthCondition? = p.healthCondition?.let { runCatching { HealthCondition.valueOf(it) }.getOrNull() }

    fun guidelineItems(p: PetEntity, now: Long = System.currentTimeMillis()): List<GuidelineItem> {
        val items = mutableListOf<GuidelineItem>()
        val st = stage(p, now)
        val m = ageMonths(p, now)
        when (st) {
            Stage.PUPPY -> items += GuidelineItem("puppy", "어린 강아지(1살 미만)", if (m != null && m < 4) 60 else if (m != null && m < 8) 75 else 90, "배변을 참을 수 있는 시간이 짧아요", SRC_AKC_PUPPY)
            Stage.SENIOR -> items += GuidelineItem("senior", "노령견", 90, "짧은 산책으로 관절이 굳지 않게", SRC_AKC_SENIOR)
            else -> Unit
        }
        if (isBrachy(p)) items += GuidelineItem("brachy", "단두종", 90, "더운 날 차 안 온도 확인 · 그늘에서 휴식", SRC_RVC)
        when (condition(p)) {
            HealthCondition.JOINT_HEART_RESP -> items += GuidelineItem("cond-jhr", "질환 있음(관절·심장·호흡기)", 90, "수의사가 정한 간격이 있으면 직접 입력해 최우선 적용", SRC_AAHA_DM)
            HealthCondition.KIDNEY_DIABETES -> items += GuidelineItem("cond-kd", "질환 있음(신장 질환·당뇨)", 60, "수의사가 정한 간격이 있으면 직접 입력해 최우선 적용", SRC_AAHA_DM)
            else -> Unit
        }
        val c = condition(p)
        if (items.isEmpty() && st == Stage.ADULT && (c == null || c == HealthCondition.NONE)) {
            items += GuidelineItem("adult", "성견 · 특이사항 없음", 120, "배변 · 물 · 짧은 산책", SRC_MAFRA)
        }
        return items
    }

    private fun clamp(m: Int) = m.coerceIn(MIN_INTERVAL, MAX_INTERVAL)

    fun petInterval(p: PetEntity, now: Long = System.currentTimeMillis()): Pair<Int, RestBasis> {
        p.vetRestIntervalMinutes?.takeIf { it > 0 }?.let { return clamp(it) to RestBasis.VET }
        if (p.guardianInterval) return clamp(p.restIntervalMinutes) to RestBasis.GUARDIAN
        val g = guidelineItems(p, now)
        if (g.isNotEmpty()) return clamp(g.minOf { it.minutes }) to RestBasis.GUIDELINE
        return APP_DEFAULT_INTERVAL to RestBasis.APP_DEFAULT
    }

    fun prompts(p: PetEntity, now: Long = System.currentTimeMillis()): List<String> {
        val n = Korean.callName(p.name)
        val out = mutableListOf<String>()
        if (p.vetRestIntervalMinutes != null) out += "${n}의 수의사 안내 내용을 출발 전에 한 번 더 확인해 주세요."
        if (p.notes.isNotBlank()) out += "${n}의 건강 특이사항이 기록돼 있어요. 휴식 간격은 수의사와 상의해 정하는 걸 권해요."
        if ((p.senior ?: suggestSenior(p, now)) == true) out += "${n}${Korean.josa(n, "은", "는")} 노령견 기준으로 안내해요. 휴게소에서 짧게 걸으며 쉬어 가세요."
        if (isBrachy(p)) out += "${n}${Korean.josa(n, "은", "는")} 단두종으로 기록돼 있어요. 더운 날에는 차 안 온도를 확인하고 그늘에서 쉬어 가세요."
        val c = condition(p)
        if (c == HealthCondition.JOINT_HEART_RESP || c == HealthCondition.KIDNEY_DIABETES) out += "${n}의 건강 상태를 기록했어요. 수의사가 정한 간격이 있으면 그 간격을 입력해 주세요."
        return out
    }

    fun hasCare(p: PetEntity) = prompts(p).isNotEmpty()

    fun resolve(pets: List<PetEntity>, now: Long = System.currentTimeMillis()): RestPolicy {
        if (pets.isEmpty()) return RestPolicy(APP_DEFAULT_INTERVAL, RestBasis.APP_DEFAULT, null, listOf("반려견 정보가 없어 앱 기본값 사용"), emptyList())
        val each = pets.map { p -> Triple(p, petInterval(p, now).first, petInterval(p, now).second) }
        val pick = each.reduce { a, b -> if (b.second < a.second || (b.second == a.second && b.third == RestBasis.VET && a.third != RestBasis.VET)) b else a }
        val reasons = mutableListOf("${pick.first.name}: ${pick.third.label} ${pick.second}분")
        if (pick.third == RestBasis.GUIDELINE) reasons += "기준표 항목: " + guidelineItems(pick.first, now).joinToString(", ") { "${it.label} ${it.minutes}분" }
        if (pets.size > 1) reasons += "함께하는 ${pets.size}마리 중 가장 짧은 간격 적용(" + each.joinToString(", ") { "${it.first.name} ${it.second}분" } + ")"
        return RestPolicy(pick.second, pick.third, pick.first.id, reasons, pets.flatMap { prompts(it, now) })
    }

    // ── 음성·화면 문구 ──
    private fun subj(name: String) = Korean.callName(name).let { "$it${Korean.josa(it, "이", "가")}" }
    fun soonVoice(pet: String) = "곧 ${subj(pet)} 쉬어갈 시간이에요."
    fun dueVoice(pet: String, care: Boolean) =
        if (care) "${Korean.callName(pet)}의 여행 케어 설정을 고려하면 잠시 쉬어가는 게 좋겠어요. 가까운 휴식지를 안내할까요?"
        else "${subj(pet)} 쉬어갈 시간이네요. 가까운 휴식 장소를 찾아볼까요?"
    fun dueTitle(pet: String) = "${subj(pet)} 쉬어갈 시간이에요"
    fun placeFoundVoice(confirmed: Boolean) =
        if (confirmed) "경로 근처에 반려견 동반이 가능한 휴식 장소가 있어요. 경유지로 추가할까요?"
        else "경로 근처에 휴식 장소가 있어요. 반려견 동반 여부는 확인이 필요해요."
}
