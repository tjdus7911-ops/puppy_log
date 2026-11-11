// 저장된 기록에서 일기 입력을 만듭니다(모든 화면 공통). 실제 기록만 사용합니다.
import { repo } from '../data/db';
import type { Trip } from '../domain/models';
import { regionShort } from '../domain/regions';
import type { DiaryInput } from '../domain/tripText';

export async function buildDiaryInput(trip: Trip, petNames: string[]): Promise<DiaryInput> {
  const [rests, places, photos, legs] = await Promise.all([repo.restsOf(trip.id), repo.placesOf(trip.id), repo.photosOf(trip.id), repo.legsOf(trip.id)]);
  const outbound = legs.find((l) => l.kind === 'outbound');
  const ret = legs.find((l) => l.kind === 'return' && l.endTime != null);
  return {
    petNames: petNames.length ? petNames : ['우리 강아지'],
    startTime: trip.startTime,
    startRegion: trip.startLocation ? regionShort(trip.startLocation) : null,
    endRegion: trip.endLocation ? regionShort(trip.endLocation) : trip.destinationName,
    // 일기 첫 문장의 '…까지 달렸다'는 가는 길 기준, 전체 합계는 따로
    distanceKm: outbound?.distanceKm ?? trip.totalDistanceKm,
    drivingSec: outbound?.drivingDurationSeconds ?? trip.drivingDurationSeconds,
    elapsedSec: trip.elapsedDurationSeconds,
    restCount: rests.filter((r) => r.endTime).length,
    places: places.map((p) => ({ name: p.placeName, category: p.category, isSample: p.isSample })),
    photoCount: photos.length,
    memo: trip.memo,
    returnLeg: ret ? { distanceKm: ret.distanceKm, drivingSec: ret.drivingDurationSeconds } : null,
    placeNotes: places.filter((p) => !p.isSample && p.memo).map((p) => ({ name: p.placeName, memo: p.memo ?? '' })),
    photoNotes: photos.map((p) => p.memo).filter(Boolean),
  };
}
