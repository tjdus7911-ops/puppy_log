package com.mungroad.domain

import com.mungroad.providers.GeoPoint

/** 목적지 빠른 선택·집 위치용 시·군 대표 좌표(근사값, 웹 domain/regions.ts 의 일부). 실제 안내 지점은 내비가 정합니다. */
data class Region(val id: String, val name: String, val point: GeoPoint)

object Regions {
    val ALL = listOf(
        Region("seoul", "서울", GeoPoint(37.5665, 126.978)),
        Region("incheon", "인천", GeoPoint(37.4563, 126.7052)),
        Region("suwon", "수원", GeoPoint(37.2636, 127.0286)),
        Region("seongnam", "성남", GeoPoint(37.42, 127.1267)),
        Region("yangpyeong", "양평", GeoPoint(37.4917, 127.4875)),
        Region("gapyeong", "가평", GeoPoint(37.8315, 127.5105)),
        Region("chuncheon", "춘천", GeoPoint(37.8813, 127.7298)),
        Region("pyeongchang", "평창", GeoPoint(37.3708, 128.39)),
        Region("gangneung", "강릉", GeoPoint(37.7519, 128.8761)),
        Region("sokcho", "속초", GeoPoint(38.207, 128.5918)),
        Region("yangyang", "양양", GeoPoint(38.0754, 128.6191)),
        Region("danyang", "단양", GeoPoint(36.9845, 128.3655)),
        Region("taean", "태안", GeoPoint(36.7456, 126.2979)),
        Region("jeonju", "전주", GeoPoint(35.8242, 127.148)),
        Region("gyeongju", "경주", GeoPoint(35.8562, 129.2247)),
        Region("busan", "부산", GeoPoint(35.1796, 129.0756)),
        Region("yeosu", "여수", GeoPoint(34.7604, 127.6622)),
    )
    val DESTINATIONS = ALL.filter { it.id !in setOf("seoul", "incheon", "suwon", "seongnam") }
    fun byId(id: String?) = ALL.firstOrNull { it.id == id }
}
