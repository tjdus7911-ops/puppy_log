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
import androidx.sqlite.db.SupportSQLiteDatabase
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
    @TypeConverter fun phase(v: TripPhase) = v.name
    @TypeConverter fun phase(v: String) = TripPhase.valueOf(v)
    @TypeConverter fun legKind(v: LegKind) = v.name
    @TypeConverter fun legKind(v: String) = LegKind.valueOf(v)
}

/**
 * v1 → v2: 여행 라이프사이클.
 * - 기존 데이터는 지우지 않고 컬럼만 추가합니다(기본값으로 채움).
 * - 종료된 여행(ENDED)은 phase=COMPLETED, 합계를 그대로 담은 'migrated-<id>' 가는 길 구간 1개를 만듭니다(웹 migrateV1toV2 와 동일).
 * - 진행 중이던 여행은 phase=OUTBOUND 로 둡니다.
 */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE trip ADD COLUMN phase TEXT NOT NULL DEFAULT 'COMPLETED'")
        db.execSQL("ALTER TABLE trip ADD COLUMN arrivedAt INTEGER")
        db.execSQL("ALTER TABLE trip ADD COLUMN returnStartedAt INTEGER")
        db.execSQL("ALTER TABLE trip ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
        db.execSQL("UPDATE trip SET phase = 'OUTBOUND' WHERE status != 'ENDED'")
        db.execSQL("UPDATE trip SET arrivedAt = endTime WHERE status = 'ENDED'")
        db.execSQL("ALTER TABLE rest_session ADD COLUMN legId TEXT")
        db.execSQL("ALTER TABLE visited_place ADD COLUMN origin TEXT NOT NULL DEFAULT 'SEARCH'")
        db.execSQL("ALTER TABLE visited_place ADD COLUMN memo TEXT NOT NULL DEFAULT ''")
        db.execSQL("ALTER TABLE trip_photo ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE trip_photo ADD COLUMN memo TEXT NOT NULL DEFAULT ''")
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS drive_leg (" +
                "id TEXT NOT NULL PRIMARY KEY, tripId TEXT NOT NULL, kind TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, " +
                "distanceKm REAL NOT NULL, drivingDurationSeconds INTEGER NOT NULL, elapsedDurationSeconds INTEGER NOT NULL, " +
                "restCount INTEGER NOT NULL, restDurationSeconds INTEGER NOT NULL, " +
                "startLat REAL, startLng REAL, startRegion TEXT, endLat REAL, endLng REAL, endRegion TEXT, " +
                "source TEXT NOT NULL, isDemo INTEGER NOT NULL, " +
                "FOREIGN KEY(tripId) REFERENCES trip(id) ON UPDATE NO ACTION ON DELETE CASCADE)",
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_drive_leg_tripId ON drive_leg(tripId)")
        db.execSQL(
            "INSERT INTO drive_leg SELECT 'migrated-' || t.id, t.id, 'OUTBOUND', t.startTime, t.endTime, t.totalDistanceKm, " +
                "t.drivingDurationSeconds, t.elapsedDurationSeconds, " +
                "(SELECT COUNT(*) FROM rest_session r WHERE r.tripId = t.id), " +
                "COALESCE((SELECT SUM(r.endTime - r.startTime) / 1000 FROM rest_session r WHERE r.tripId = t.id AND r.endTime IS NOT NULL), 0), " +
                "t.startLat, t.startLng, t.startRegion, t.endLat, t.endLng, t.endRegion, t.source, t.isDemo " +
                "FROM trip t WHERE t.status = 'ENDED'",
        )
        // 사진 순서: 기존 촬영 시각 순
        db.execSQL("UPDATE trip_photo SET sortOrder = (SELECT COUNT(*) FROM trip_photo p2 WHERE p2.tripId = trip_photo.tripId AND p2.createdAt < trip_photo.createdAt)")
    }
}

data class TripStats(val count: Int, val totalKm: Double?, val drivingSeconds: Long?)

@Dao
interface PetDao {
    @Query("SELECT * FROM pet ORDER BY createdAt") fun observeAll(): Flow<List<PetEntity>>
    @Upsert suspend fun upsert(pet: PetEntity)
    @Query("DELETE FROM pet WHERE id = :id") suspend fun delete(id: String)
}

@Dao
abstract class TripDao {
    @Query("SELECT * FROM trip WHERE status = 'ENDED' ORDER BY startTime DESC") abstract fun observeEnded(): Flow<List<TripEntity>>
    @Query("SELECT * FROM trip WHERE status != 'ENDED' LIMIT 1") abstract suspend fun findActive(): TripEntity?
    @Query("SELECT * FROM trip WHERE id = :id") abstract suspend fun get(id: String): TripEntity?
    @Upsert abstract suspend fun upsert(trip: TripEntity)
    @Insert(onConflict = OnConflictStrategy.IGNORE) abstract suspend fun linkPets(refs: List<TripPetCrossRef>)

    /** 중복 여행 시작 방지: 진행 중인 여행이 없을 때만 생성 */
    @Transaction
    open suspend fun createIfNoActive(trip: TripEntity, petIds: List<String>): Boolean {
        if (findActive() != null) return false
        upsert(trip)
        linkPets(petIds.map { TripPetCrossRef(trip.id, it) })
        return true
    }

    /** 실제 기록만 집계(데모 제외) */
    @Query("SELECT COUNT(*) AS count, SUM(totalDistanceKm) AS totalKm, SUM(drivingDurationSeconds) AS drivingSeconds FROM trip WHERE status = 'ENDED' AND isDemo = 0")
    abstract fun observeRealStats(): Flow<TripStats>

    @Insert abstract suspend fun insertLocations(list: List<TripLocationEntity>)
    @Query("SELECT * FROM trip_location WHERE tripId = :tripId ORDER BY timestamp") abstract suspend fun locations(tripId: String): List<TripLocationEntity>
    @Upsert abstract suspend fun upsertRest(rest: RestSessionEntity)
    @Query("SELECT * FROM rest_session WHERE tripId = :tripId ORDER BY startTime") abstract suspend fun rests(tripId: String): List<RestSessionEntity>
    @Upsert abstract suspend fun upsertPlace(place: VisitedPlaceEntity)
    @Upsert abstract suspend fun upsertPhoto(photo: TripPhotoEntity)
    @Query("DELETE FROM trip WHERE id = :id") abstract suspend fun delete(id: String) // 하위 테이블은 CASCADE
    @Query("DELETE FROM trip WHERE isDemo = 1") abstract suspend fun deleteDemo()
    @Query("DELETE FROM trip") abstract suspend fun deleteAll()

    // ── v2: 주행 구간 · 앨범 ──
    @Upsert abstract suspend fun upsertLeg(leg: DriveLegEntity)
    @Query("SELECT * FROM drive_leg WHERE tripId = :tripId ORDER BY startTime") abstract suspend fun legs(tripId: String): List<DriveLegEntity>
    @Query("SELECT * FROM trip_photo WHERE tripId = :tripId ORDER BY sortOrder, createdAt") abstract suspend fun photos(tripId: String): List<TripPhotoEntity>
    @Query("SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM trip_photo WHERE tripId = :tripId") abstract suspend fun nextPhotoOrder(tripId: String): Int
    @Query("UPDATE trip_photo SET sortOrder = :order WHERE id = :id") abstract suspend fun setPhotoOrder(id: String, order: Int)

    @Transaction
    open suspend fun reorderPhotos(ids: List<String>) { ids.forEachIndexed { i, id -> setPhotoOrder(id, i) } }
}

@Database(
    entities = [
        PetEntity::class, TripEntity::class, TripPetCrossRef::class, TripLocationEntity::class,
        RestSessionEntity::class, VisitedPlaceEntity::class, TripPhotoEntity::class, DriveLegEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class MungRoadDatabase : RoomDatabase() {
    abstract fun petDao(): PetDao
    abstract fun tripDao(): TripDao

    companion object {
        /** 스키마 변경 시 여기에 Migration 을 추가하고 version 을 올립니다(파괴적 마이그레이션 사용 안 함). */
        val MIGRATIONS: Array<Migration> = arrayOf(MIGRATION_1_2)

        @Volatile private var instance: MungRoadDatabase? = null
        fun get(context: Context): MungRoadDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context, MungRoadDatabase::class.java, "mungroad.db")
                .addMigrations(*MIGRATIONS)
                .build().also { instance = it }
        }
    }
}
