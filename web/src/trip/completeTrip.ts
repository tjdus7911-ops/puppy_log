// 여행 완료 + 일기 초안 자동 생성(요청서 7장). 이미 일기가 있으면 덮어쓰지 않습니다.
// AI 서버가 없거나 실패하면 기록 기반 템플릿 초안이 저장되고, 사용자가 언제든 수정·재생성할 수 있습니다.
import { repo } from '../data/db';
import { generateDiary } from '../diary/diaryGenerator';
import { buildDiaryInput } from '../diary/buildInput';
import { TripController } from './TripController';

export async function completeTripWithDraft(apiBaseUrl: string): Promise<string | null> {
  const id = await TripController.finish();
  if (!id) return null;
  try {
    const trip = await repo.getTrip(id);
    if (trip && !trip.diaryText) {
      const [petIds, pets] = await Promise.all([repo.petIdsOfTrip(id), repo.listPets()]);
      const names = pets.filter((p) => petIds.includes(p.id)).map((p) => p.name);
      const r = await generateDiary(await buildDiaryInput(trip, names), apiBaseUrl);
      await repo.saveTrip({ ...trip, diaryText: r.text, diarySource: r.source });
    }
  } catch {
    // 초안 생성 실패는 여행 완료를 막지 않습니다(일기 화면에서 다시 만들 수 있음).
  }
  return id;
}
