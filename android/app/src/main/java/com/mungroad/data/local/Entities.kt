package com.mungroad.data.local

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
)
