// 도착 이벤트 아웃박스: 중복 방지 · 서버 전송 · 데모 미전송
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { arrivalPush, flushEvents, queueEvent, type NotificationEvent } from './events';
import { repo } from '../data/db';

const ev = (id: string, delivery: NotificationEvent['delivery'] = 'pending'): NotificationEvent => ({
  id, type: 'TRIP_ARRIVED', tripId: 't1', legId: 'l1', destinationName: '강릉 경포해변', petNames: ['사슴'], tripStatus: 'AT_DESTINATION',
  occurredAt: 1, isDemo: delivery === 'skipped-demo', push: arrivalPush('사슴이', '강릉 경포해변', 't1'), delivery, attempts: 0,
});

describe('도착 이벤트', () => {
  it('푸시 문구와 딥링크', () => {
    const p = arrivalPush('사슴이', '강릉 경포해변', 't1');
    expect(p.title).toBe('🐾 사슴이와 목적지에 도착했어요!');
    expect(p.body).toBe('강릉 경포해변에 도착했어요. 오늘의 여행을 사진과 함께 기록해 보세요!');
    expect(p.deepLink).toBe('mungroad://trip/t1/activity');
  });
  it('같은 도착 이벤트는 한 번만 쌓임', async () => {
    expect(await queueEvent(ev('A'))).toBe(true);
    expect(await queueEvent(ev('A'))).toBe(false);
    expect((await repo.getOutbox()).filter((x) => x.id === 'A')).toHaveLength(1);
  });
  it('서버 주소가 없으면 대기, 있으면 전송(멱등 키 포함), 데모 이벤트는 보내지 않음', async () => {
    await queueEvent(ev('DEMO', 'skipped-demo'));
    expect((await flushEvents('')).pending).toBeGreaterThan(0);
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    const r = await flushEvents('https://api.example', f as unknown as typeof fetch);
    expect(r.sent).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('A');
    expect((await repo.getOutbox()).find((x) => x.id === 'DEMO')?.delivery).toBe('skipped-demo');
  });
});
