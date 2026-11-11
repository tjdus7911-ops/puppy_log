// 차량·모바일 공통 이벤트 아웃박스(서버 동기화 준비).
// - 목적지 도착 등 이벤트를 이 기기에 먼저 저장하고, 서버 주소가 설정되면 전송합니다.
// - 이벤트 id = `${type}:${tripId}:${legId}` 로 고정해 같은 도착을 두 번 보내지 않습니다(서버도 같은 id로 중복 제거).
// - 서버가 받으면 연결된 모바일 기기로 푸시를 보내는 구조(서버·푸시는 아직 미구현).
import { repo } from '../data/db';

export type TripStatusCode = 'PLANNED' | 'DRIVING' | 'RESTING' | 'AT_DESTINATION' | 'COMPLETED' | 'CANCELLED';

export interface NotificationEvent {
  id: string;
  type: 'TRIP_ARRIVED';
  tripId: string;
  legId: string;
  destinationName: string | null;
  petNames: string[];
  tripStatus: TripStatusCode;
  occurredAt: number;
  isDemo: boolean;
  /** 모바일 푸시 문구(서버가 그대로 사용 가능) */
  push: { title: string; body: string; deepLink: string };
  /** pending: 서버 미전송 · sent: 전송 완료 · skipped-demo: 데모라 전송 안 함 */
  delivery: 'pending' | 'sent' | 'skipped-demo';
  attempts: number;
}

export function arrivalPush(petName: string, destinationName: string | null, tripId: string) {
  return {
    title: `🐾 ${petName}와 목적지에 도착했어요!`,
    body: `${destinationName ?? '목적지'}에 도착했어요. 오늘의 여행을 사진과 함께 기록해 보세요!`,
    deepLink: `mungroad://trip/${tripId}/activity`,
  };
}

/** 같은 id가 이미 있으면 추가하지 않음(중복 도착 방지). 추가되면 true */
export async function queueEvent(ev: NotificationEvent): Promise<boolean> {
  const list = await repo.getOutbox();
  if (list.some((x) => x.id === ev.id)) return false;
  await repo.saveOutbox([...list, ev].slice(-200));
  return true;
}

/** 서버로 전송(서버 주소가 없으면 대기 상태 유지). 실패하면 다음 기회에 재시도 */
export async function flushEvents(apiBase: string, fetcher: typeof fetch = fetch): Promise<{ sent: number; pending: number }> {
  const list = await repo.getOutbox();
  let sent = 0;
  if (apiBase) {
    for (const ev of list) {
      if (ev.delivery !== 'pending') continue;
      try {
        const r = await fetcher(`${apiBase.replace(/\/$/, '')}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': ev.id }, body: JSON.stringify(ev) });
        ev.attempts += 1;
        if (r.ok) { ev.delivery = 'sent'; sent += 1; }
      } catch { ev.attempts += 1; }
    }
    await repo.saveOutbox(list);
  }
  return { sent, pending: list.filter((x) => x.delivery === 'pending').length };
}
