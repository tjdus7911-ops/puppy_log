package com.mungroad.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import androidx.room.Upsert
import androidx.room.migration.Migration
import kotlinx.coroutines.flow.Flow

class Converters {
    @TypeConverter fun petSize(v: PetSize) = v.name
    @TypeConverter fun petSize(v: String) = PetSize.valueOf(v)
    @TypeConverter fun tripStatus(v: TripStatus) = v.name
    @TypeConverter fun tripStatus(v: String) = TripStatus.valueOf(v)
    @TypeConverter fun source(v: DataSource) = v.name
    @TypeConverter fun source(v: String) = DataSource.valueOf(v)
    @TypeConverter fun category(v: PlaceCategory) = v.name
    @TypeConverter fun category(v: String) = PlaceCategory.valueOf(v)
}

data class TripStats(val count: Int, val totalKm: Double?, val drivingSeconds: Long?)

@Dao
interface PetDao {
    @Query("SELECT * FROM pet ORDER BY createdAt") fun observeAll(): Flow<List<PetEntity>>
    @Upsert suspend fun upsert(pet: PetEntity)
    @Query("DELETE FROM pet WHERE id = :id") suspend fun delete(id: String)
}

@Dao
interface TripDao {
    @Query("SELECT * FROM trip WHERE status = 'ENDED' ORDER BY startTime DESC") fun observeEnded(): Flow<List<TripEntity>>
    @Query("SELECT * FROM trip WHERE status != 'ENDED' LIMIT 1") suspend fun findActive(): TripEntity?
    @Query("SELECT * FROM trip WHERE id = :id") suspend fun get(id: String): TripEntity?
    @Upsert suspend fun upsert(trip: TripEntity)
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun linkPets(refs: List<TripPetCrossRef>)

    /** 중복 여행 시작 방지: 진행 중인 여행이 없을 때만 생성 */
    @Transaction
    suspend fun createIfNoActive(trip: TripEntity, petIds: List<String>): Boolean {
        if (findActive() != null) return false
        upsert(trip)
        linkPets(petIds.map { TripPetCrossRef(trip.id, it) })
        return true
    }

    /** 실제 기록만 집계(데모 제외) */
    @Query("SELECT COUNT(*) AS count, SUM(totalDistanceKm) AS totalKm, SUM(drivingDurationSeconds) AS drivingSeconds FROM trip WHERE status = 'ENDED' AND isDemo = 0")
    fun observeRealStats(): Flow<TripStats>

    @Insert suspend fun insertLocations(list: List<TripLocationEntity>)
    @Query("SELECT * FROM trip_location WHERE tripId = :tripId ORDER BY timestamp") suspend fun locations(tripId: String): List<TripLocationEntity>
    @Upsert suspend fun upsertRest(rest: RestSessionEntity)
    @Query("SELECT * FROM rest_session WHERE tripId = :tripId ORDER BY startTime") suspend fun rests(tripId: String): List<RestSessionEntity>
    @Upsert suspend fun upsertPlace(place: VisitedPlaceEntity)
    @Upsert suspend fun upsertPhoto(photo: TripPhotoEntity)
    @Query("DELETE FROM trip WHERE id = :id") suspend fun delete(id: String) // 하위 테이블은 CASCADE
    @Query("DELETE FROM trip WHERE isDemo = 1") suspend fun deleteDemo()
    @Query("DELETE FROM trip") suspend fun deleteAll()
}

@Database(
    entities = [
        PetEntity::class, TripEntity::class, TripPetCrossRef::class, TripLocationEntity::class,
        RestSessionEntity::class, VisitedPlaceEntity::class, TripPhotoEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class MungRoadDatabase : RoomDatabase() {
    abstract fun petDao(): PetDao
    abstract fun tripDao(): TripDao

    companion object {
        /** 스키마 변경 시 여기에 Migration 을 추가하고 version 을 올립니다(파괴적 마이그레이션 사용 안 함). */
        val MIGRATIONS: Array<Migration> = arrayOf()

        @Volatile private var instance: MungRoadDatabase? = null
        fun get(context: Context): MungRoadDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context, MungRoadDatabase::class.java, "mungroad.db")
                .addMigrations(*MIGRATIONS)
                .build().also { instance = it }
        }
    }
}
