package com.mungroad.providers

/** 지도 컴포저블에 넘기는 화면 상태(지도 SDK 와 무관한 순수 모델) */
data class MapState(
    val current: GeoPoint?,
    val driven: List<GeoPoint>,
    val planned: List<GeoPoint>,
    val destination: GeoPoint?,
    val hazards: List<Hazard>,
    val places: List<PetPlace>,
)
