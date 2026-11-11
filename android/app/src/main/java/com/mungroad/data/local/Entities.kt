package com.mungroad.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

// 요청서 13장 데이터 구조. 웹 프로토타입(web/src/domain/models.ts)과 필드 이름을 맞췄습니다.
// ⚠ 이 Android 코드는 빌드 환경 제약으로 아직 컴파일·실행 검증을 하지 못했습니다(docs/IMPLEMENTATION_STATUS.md).

enum class PetSize { SMALL, MEDIUM, LARGE }
enum class TripStatus { DRIVING, STOPPED, RESTING, ENDED }
enum class DataSource { DEMO, DEVICE_LOCATION, MANUAL, PLEOS_VEHICLE }
enum class PlaceCategory { RESTAURANT, CAFE, PARK, REST_AREA, LODGING, VET }

/**
 * 여행(journey) 단계 — 웹 TripPhase 와 동일.
 * PREPARING → OUTBOUND(가는 길·여행지 내 이동) → AT_DESTINATION ⇄ OUTBOUND(EXTRA) → RETURNING → COMPLETED
 * 도착은 종료가 아니며, 돌아오는 길 없이도(AT_DESTINATION → COMPLETED) 완료할 수 있습니다.
 */
enum class TripPhase { PREPARING, OUTBOUND, AT_DESTINATION, RETURNING, COMPLETED }

/** 한 여행 안의 주행 구간 종류 — 웹 LegKind 와 동일 */
enum class LegKind { OUTBOUND, EXTRA, RETURN }

@Entity(tableName = "pet")
data class PetEntity(
    @PrimaryKey val id: String,
    val name: String,
    val photoUri: String?,
    val birthDate: String?, // YYYY-MM-DD
    val ageYears: Int?,
    val weight: Double?,
    val size: PetSize,
    val notes: String,
    val restIntervalMinutes: Int,
    val createdAt: Long,
)

@Entity(tableName = "trip", indices = [Index("startTime")])
data class TripEntity(
    @PrimaryKey val id: String,
    val title: String,
    val titleEdited: Boolean,
    val startTime: Long,
    val endTime: Long?,
    val startLat: Double?, val startLng: Double?, val startRegion: String?,
    val endLat: Double?, val endLng: Double?, val endRegion: String?,
    val destinationName: String?,
    val totalDistanceKm: Double,
    val drivingDurationSeconds: Long,
    val elapsedDurationSeconds: Long,
    val restIntervalMinutes: Int,
    val status: TripStatus,
    val diaryText: String,
    val memo: String,
    val coverPhotoUri: String?,
    val source: DataSource,
    /** 데모 기록은 통계 쿼리에서 항상 제외 */
    val isDemo: Boolean,
    // ── v2: 여행 라이프사이클 (Migration 1→2) ──
    /** 여행 단계. 합계(totalDistanceKm 등)는 완료된 DriveLeg 의 합입니다. */
    @ColumnInfo(defaultValue = "COMPLETED") val phase: TripPhase = TripPhase.OUTBOUND,
    val arrivedAt: Long? = null,
    val returnStartedAt: Long? = null,
    @ColumnInfo(defaultValue = "0") val updatedAt: Long = 0,
)

@Entity(
    tableName = "trip_pet",
    primaryKeys = ["tripId", "petId"],
    indices = [Index("petId")],
    foreignKeys = [
        ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = ["tripId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = PetEntity::class, parentColumns = ["id"], childColumns = ["petId"], onDelete = ForeignKey.CASCADE),
    ],
)
data class TripPetCrossRef(val tripId: String, val petId: String)

private const val TRIP_FK = "tripId"

@Entity(
    tableName = "trip_location",
    indices = [Index(TRIP_FK)],
    foreignKeys = [ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = [TRIP_FK], onDelete = ForeignKey.CASCADE)],
)
data class TripLocationEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val accuracy: Float?,
)

@Entity(
    tableName = "rest_session",
    indices = [Index(TRIP_FK)],
    foreignKeys = [ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = [TRIP_FK], onDelete = ForeignKey.CASCADE)],
)
data class RestSessionEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val startTime: Long,
    val endTime: Long?,
    val latitude: Double?,
    val longitude: Double?,
    /** v2: 어느 주행 구간의 휴식인지 */
    val legId: String? = null,
)

@Entity(
    tableName = "visited_place",
    indices = [Index(TRIP_FK)],
    foreignKeys = [ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = [TRIP_FK], onDelete = ForeignKey.CASCADE)],
)
data class VisitedPlaceEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val placeName: String,
    val category: PlaceCategory,
    val latitude: Double,
    val longitude: Double,
    val visitedAt: Long,
    val isSample: Boolean,
    /** v2: 'SEARCH'(검색해 고른 장소) | 'USER'(여행지에서 직접 기록) */
    @ColumnInfo(defaultValue = "SEARCH") val origin: String = "SEARCH",
    @ColumnInfo(defaultValue = "") val memo: String = "",
)

@Entity(
    tableName = "trip_photo",
    indices = [Index(TRIP_FK)],
    foreignKeys = [ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = [TRIP_FK], onDelete = ForeignKey.CASCADE)],
)
data class TripPhotoEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val photoUri: String,
    val createdAt: Long,
    /** v2: 앨범 순서(작을수록 앞) · 사진별 메모 */
    @ColumnInfo(name = "sortOrder", defaultValue = "0") val order: Int = 0,
    @ColumnInfo(defaultValue = "") val memo: String = "",
)

/** v2: 한 여행 안의 주행 구간(가는 길 · 여행지 내 이동 · 돌아오는 길). 여행 1 : 구간 N */
@Entity(
    tableName = "drive_leg",
    indices = [Index(TRIP_FK)],
    foreignKeys = [ForeignKey(entity = TripEntity::class, parentColumns = ["id"], childColumns = [TRIP_FK], onDelete = ForeignKey.CASCADE)],
)
data class DriveLegEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val kind: LegKind,
    val startTime: Long,
    val endTime: Long?,
    val distanceKm: Double,
    val drivingDurationSeconds: Long,
    val elapsedDurationSeconds: Long,
    val restCount: Int,
    val restDurationSeconds: Long,
    val startLat: Double?, val startLng: Double?, val startRegion: String?,
    val endLat: Double?, val endLng: Double?, val endRegion: String?,
    val source: DataSource,
    val isDemo: Boolean,
)
