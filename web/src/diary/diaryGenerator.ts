import { templateDiary, type DiaryInput } from '../domain/tripText';

export interface DiaryResult {
  text: string;
  source: 'ai' | 'template';
  fallbackReason?: string;
}

/**
 * AI 여행 일기 생성. AI 키는 서버(server/)에만 있고 클라이언트는 프록시 주소만 압니다.
 * 서버가 없거나 실패하면 항상 기본 템플릿 일기로 대체합니다.
 */
export async function generateDiary(input: DiaryInput, apiBaseUrl: string, signal?: AbortSignal): Promise<DiaryResult> {
  const fallback = (reason?: string): DiaryResult => ({ text: templateDiary(input), source: 'template', fallbackReason: reason });
  if (!apiBaseUrl.trim()) return fallback();
  try {
    const res = await fetch(new URL('/api/diary', apiBaseUrl.trim()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(input)),
      signal,
    });
    if (!res.ok) return fallback(`AI 서버 응답 오류(${res.status})`);
    const body = (await res.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) return fallback('AI 응답이 비어 있어요');
    if (!passesSafetyCheck(text, input)) return fallback('기록에 없는 장소가 포함되어 기본 일기로 대체했어요');
    return { text, source: 'ai' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return fallback('AI 서버에 연결할 수 없어요');
  }
}

/** AI에 넘기는 값: 실제 기록만. 샘플 장소·정확한 좌표·주소는 보내지 않습니다. */
export function toPayload(d: DiaryInput) {
  return {
    petNames: d.petNames,
    date: new Date(d.startTime).toISOString().slice(0, 10),
    startRegion: d.startRegion,
    endRegion: d.endRegion,
    distanceKm: Math.round(d.distanceKm),
    drivingMinutes: Math.round(d.drivingSec / 60),
    totalMinutes: Math.round(d.elapsedSec / 60),
    restCount: d.restCount,
    places: d.places.filter((p) => !p.isSample).map((p) => ({ name: p.name, category: p.category })),
    photoCount: d.photoCount,
    memo: d.memo.slice(0, 500),
  };
}

/** 간단한 후처리 점검: 장소 목록이 비었는데 '…에 들렀다' 류의 구체적 방문 서술이 있으면 거부 */
export function passesSafetyCheck(text: string, d: DiaryInput): boolean {
  const realPlaces = d.places.filter((p) => !p.isSample);
  if (realPlaces.length === 0 && /(카페|식당|음식점|공원|휴게소|숙소|병원)에\s?(들렀|갔|방문)/.test(text)) return false;
  return text.length <= 2000;
}
