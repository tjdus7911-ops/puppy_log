// 여행 사진 추가 공통 로직. 기존 사진·기록은 건드리지 않고 뒤에 이어 붙입니다(순서 = 기존 최댓값 + 1…).
import { repo } from '../data/db';
import { newId, type TripPhoto } from '../domain/models';
import { fileToDataUrl, pickImages } from './image';

export async function addPhotosToTrip(tripId: string, onError: (msg: string) => void): Promise<TripPhoto[] | null> {
  const files = await pickImages(true);
  if (!files) return null; // 선택 취소: 아무것도 바꾸지 않음
  let order = await repo.nextPhotoOrder(tripId);
  const added: TripPhoto[] = [];
  for (const f of files.slice(0, 30)) {
    try {
      const p: TripPhoto = { id: newId(), tripId, photoUri: await fileToDataUrl(f), createdAt: Date.now(), order: order++, memo: '' };
      await repo.addPhoto(p);
      added.push(p);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return added;
}
