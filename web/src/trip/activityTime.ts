import { repo } from '../data/db';

/**
 * 여행 안의 '지금' 시각. 데모 주행은 시뮬레이션 시계가 실제 시각보다 앞서 있으므로,
 * 여행지 활동(장소·사진)과 다음 주행 구간이 이미 기록된 시각보다 앞서지 않도록 맞춥니다.
 * 실제 기록에서는 언제나 Date.now() 그대로입니다(앞선 기록이 없기 때문).
 */
export async function activityTime(tripId: string): Promise<number> {
  const now = Date.now();
  const [legs, places, photos] = await Promise.all([repo.legsOf(tripId), repo.placesOf(tripId), repo.photosOf(tripId)]);
  const latest = Math.max(0, ...legs.map((l) => l.endTime ?? l.startTime), ...places.map((p) => p.visitedAt), ...photos.map((p) => p.createdAt));
  return latest >= now ? latest + 60_000 : now;
}
