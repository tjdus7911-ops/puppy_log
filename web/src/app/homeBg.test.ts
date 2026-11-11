// 홈 여행 배경: 저장·재실행 후 유지·잘못된 값 무시·초기화
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { repo } from '../data/db';

describe('홈 여행 배경', () => {
  it('선택한 배경이 저장되고, 앱 재실행(모듈 재로드) 후에도 유지', async () => {
    const { HomeBackground } = await import('./homeBg');
    await HomeBackground.set({ kind: 'preset', id: 'sunset', updatedAt: 1 });
    vi.resetModules();
    const again = await import('./homeBg');
    await again.HomeBackground.load();
    expect(again.HomeBackground.get()).toMatchObject({ kind: 'preset', id: 'sunset' });
  });
  it('잘못 저장된 값은 무시하고 기본 배경 사용', async () => {
    await repo.saveHomeBackground({ kind: 'upload', src: 'javascript:alert(1)' });
    vi.resetModules();
    const m = await import('./homeBg');
    await m.HomeBackground.load();
    expect(m.HomeBackground.get()).toEqual(m.DEFAULT_BG);
  });
  it('초기화하면 저장값이 지워짐', async () => {
    vi.resetModules();
    const m = await import('./homeBg');
    await m.HomeBackground.set({ kind: 'preset', id: 'forest', updatedAt: 2 });
    await m.HomeBackground.reset();
    expect(await repo.getHomeBackground()).toBeNull();
    expect(m.HomeBackground.get()).toEqual(m.DEFAULT_BG);
  });
});
