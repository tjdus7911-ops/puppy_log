// 홈 '새 여행 시작' 배경 설정. 반려견 프로필 사진과 별개로 관리합니다.
// 계정·서버 동기화가 없어 이 기기(IndexedDB)에만 저장되고, 화면에도 그렇게 표시합니다.
import { useSyncExternalStore } from 'react';
import { repo } from '../data/db';
import type { SceneId } from '../ui/scenes';

export type HomeBg =
  | { kind: 'preset'; id: SceneId; updatedAt: number }
  | { kind: 'upload'; src: string; updatedAt: number };

export const DEFAULT_BG: HomeBg = { kind: 'preset', id: 'sea', updatedAt: 0 };
/** 저장 위치: 서버 동기화가 구현되면 'synced'로 바뀝니다 */
export const BG_SYNC: 'local' | 'synced' = 'local';

let bg: HomeBg = DEFAULT_BG;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function valid(v: unknown): v is HomeBg {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.kind === 'preset') return o.id === 'sea' || o.id === 'forest' || o.id === 'sunset';
  return o.kind === 'upload' && typeof o.src === 'string' && o.src.startsWith('data:image/');
}

export const HomeBackground = {
  get: () => bg,
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  async load() {
    if (loaded) return;
    loaded = true;
    try { const v = await repo.getHomeBackground(); if (valid(v)) { bg = v; emit(); } } catch { /* 기본 배경 유지 */ }
  },
  async set(next: HomeBg) {
    const prev = bg;
    bg = next; emit();
    try { await repo.saveHomeBackground(next); } catch (e) { bg = prev; emit(); throw e; }
  },
  async reset() {
    bg = DEFAULT_BG; emit();
    await repo.saveHomeBackground(null);
  },
};

export function useHomeBackground() {
  return useSyncExternalStore(HomeBackground.subscribe, HomeBackground.get, HomeBackground.get);
}

/** 업로드 사진을 배경용으로 줄여 data URL로 변환(최대 1600px, JPEG) */
export async function imageFileToBg(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일만 배경으로 쓸 수 있어요.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 읽지 못했어요.')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}
