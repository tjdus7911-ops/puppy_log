// 게시물 미디어: 기기에서 사진·동영상 가져오기, 비율 자르기(원본 보관), 동영상 표시용 URL
import { useEffect, useState } from 'react';
import { newId } from '../domain/models';
import type { CropRatio, PostMedia } from '../domain/community';
import { fileToDataUrl } from './image';

export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/** 파일 선택 창(사진·동영상). 취소 시 null. 파일 입력을 쓸 수 없는 환경이면 'unsupported' */
export function pickMediaFiles(): Promise<File[] | null | 'unsupported'> {
  return new Promise((resolve) => {
    let input: HTMLInputElement;
    try {
      input = document.createElement('input');
      input.type = 'file';
      if (input.type !== 'file') { resolve('unsupported'); return; }
    } catch { resolve('unsupported'); return; }
    input.accept = 'image/*,video/*';
    input.multiple = true;
    let done = false;
    input.onchange = () => { done = true; const f = input.files ? [...input.files] : []; resolve(f.length ? f : null); };
    input.addEventListener('cancel', () => { if (!done) resolve(null); });
    input.click();
  });
}

function videoDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = (d?: number) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : undefined);
    v.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 4000);
    v.src = url;
  });
}

/** 파일 → 게시물 미디어. 사진은 긴 변 1600px JPEG 로 줄여 저장, 동영상은 원본 Blob(최대 60MB) */
export async function fileToMedia(file: File): Promise<PostMedia> {
  const base = { id: newId(), crop: 'original' as const, filter: 'none' as const, text: '', textPos: 'bottom' as const, memo: '' };
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error(`동영상은 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있어요.`);
    return { ...base, kind: 'video', src: '', original: '', blob: file, durationSec: await videoDuration(file) };
  }
  const data = await fileToDataUrl(file, 1600, 0.85);
  return { ...base, kind: 'image', src: data, original: data };
}

export function photoToMedia(photo: { id: string; photoUri: string; memo: string }): PostMedia {
  return { id: newId(), kind: 'image', src: photo.photoUri, original: photo.photoUri, crop: 'original', filter: 'none', text: '', textPos: 'bottom', memo: photo.memo, fromTripPhotoId: photo.id };
}

const RATIO: Record<Exclude<CropRatio, 'original'>, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

/** 원본에서 가운데 기준으로 비율 자르기 → 새 data URL (게시물 데이터에 실제로 반영) */
export async function cropDataUrl(original: string, crop: CropRatio): Promise<string> {
  if (crop === 'original' || !original) return original;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 열 수 없어요.')); i.src = original; });
  const r = RATIO[crop];
  let w = img.width, h = img.height;
  if (w / h > r) w = Math.round(h * r); else h = Math.round(w / r);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.88);
}

/** 동영상 Blob 을 화면에 쓰는 URL (컴포넌트가 사라지면 해제) */
export function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function formatDurationShort(sec?: number) {
  if (sec == null) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
