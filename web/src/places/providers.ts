import type { GeoPoint, PlaceCategory } from '../domain/models';
import { haversineKm } from '../domain/geo';
import { regionShort } from '../domain/regions';
import {
  PlaceSearchError,
  type Place,
  type PlaceQuery,
  type PlaceSearchProvider,
  type Tri,
} from './PlaceSearchProvider';

// ---------------------------------------------------------------------------
// 1) 샘플(데모) 장소 Provider — API 키가 없을 때 사용. 모든 이름은 가상이며 '샘플' 표시가 붙습니다.
// ---------------------------------------------------------------------------

const NAME_PARTS: Record<PlaceCategory, { pre: string[]; suf: string[] }> = {
  restaurant: { pre: ['솔바람', '들꽃', '꼬순내', '산들', '느린숲'], suf: ['식당', '국수집', '밥상', '화덕'] },
  cafe: { pre: ['멍멍', '발자국', '포근', '햇살', '도토리'], suf: ['카페', '커피', '베이커리'] },
  park: { pre: ['솔숲', '강변', '물소리', '은행나무', '바람'], suf: ['산책로', '공원', '둘레길'] },
  restArea: { pre: ['샘플', '푸른', '고갯마루', '한숨'], suf: ['쉼터 휴게소', '반려 쉼터', '졸음쉼터'] },
  lodging: { pre: ['솔향', '파도', '다락', '꼬리'], suf: ['펫스테이', '독채', '게스트하우스'] },
  vet: { pre: ['튼튼', '든든', '하늘', '새싹'], suf: ['동물병원', '동물메디컬센터'] },
};

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hashPoint(p: GeoPoint, cat: string) {
  let h = Math.round(p.latitude * 50) * 7919 + Math.round(p.longitude * 50) * 104729;
  for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) + 1;
}

const tri = (r: () => number, pTrue: number, pNull: number): Tri => {
  const x = r();
  if (x < pNull) return null;
  return x < pNull + (1 - pNull) * pTrue;
};

export class SamplePlaceProvider implements PlaceSearchProvider {
  readonly isSample = true;
  readonly label = '샘플 데이터';
  readonly providesPetPolicy = true;

  async search(q: PlaceQuery, signal?: AbortSignal): Promise<Place[]> {
    await new Promise((r) => setTimeout(r, 350)); // 로딩 상태 확인용
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const all: Place[] = [];
    for (const c of q.centers) all.push(...this.around(c, q.category, q.radiusKm));
    const uniq = new Map(all.map((p) => [p.id, p]));
    let list = [...uniq.values()];
    if (q.keyword?.trim()) {
      const k = q.keyword.trim();
      list = list.filter((p) => p.name.includes(k) || p.address.includes(k));
    }
    return list;
  }

  private around(center: GeoPoint, cat: PlaceCategory, radiusKm: number): Place[] {
    const r = seeded(hashPoint(center, cat));
    const n = cat === 'vet' || cat === 'lodging' ? 3 : 5;
    const parts = NAME_PARTS[cat];
    const out: Place[] = [];
    for (let i = 0; i < n; i++) {
      const dist = 0.4 + r() * Math.max(0.5, radiusKm - 0.4);
      const ang = r() * Math.PI * 2;
      const lat = center.latitude + (dist / 111) * Math.cos(ang);
      const lon = center.longitude + (dist / (111 * Math.cos((center.latitude * Math.PI) / 180))) * Math.sin(ang);
      const pre = parts.pre[Math.floor(r() * parts.pre.length)];
      const suf = parts.suf[Math.floor(r() * parts.suf.length)];
      const region = regionShort({ latitude: lat, longitude: lon });
      const outdoorish = cat === 'park' || cat === 'restArea';
      out.push({
        id: `sample-${cat}-${lat.toFixed(4)}-${lon.toFixed(4)}`,
        name: `${pre} ${suf}`,
        category: cat,
        address: `${region === '어딘가' ? '' : `${region} `}샘플로 ${Math.floor(r() * 300) + 1}`,
        latitude: lat,
        longitude: lon,
        phone: r() < 0.6 ? `0${Math.floor(r() * 8) + 2}-000-${String(Math.floor(r() * 9000) + 1000)}` : null,
        hours: r() < 0.65 ? (outdoorish ? '상시 개방' : `${9 + Math.floor(r() * 3)}:00 ~ ${19 + Math.floor(r() * 3)}:00`) : null,
        imageUri: null,
        policy: {
          smallDog: tri(r, 0.95, 0.1),
          largeDog: tri(r, 0.5, 0.3),
          indoor: outdoorish ? false : tri(r, 0.55, 0.3),
          outdoor: tri(r, 0.85, 0.25),
          carrierRequired: outdoorish ? false : tri(r, 0.35, 0.4),
          parking: tri(r, 0.7, 0.3),
        },
        isSample: true,
        sourceLabel: '샘플 데이터',
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// 2) 서버 프록시 Provider — server/ 의 프록시가 외부 장소 API(예: 카카오 로컬)를 호출합니다.
//    API 키는 서버 환경 변수에만 두고 클라이언트에는 저장하지 않습니다.
//    키워드 검색 결과에는 반려동물 동반 조건 필드가 없으므로 모두 '정보 없음'(null)으로 둡니다.
// ---------------------------------------------------------------------------

const KEYWORD: Record<PlaceCategory, string> = {
  restaurant: '애견동반 식당',
  cafe: '애견동반 카페',
  park: '반려견 산책',
  restArea: '휴게소',
  lodging: '애견동반 숙소',
  vet: '동물병원',
};

interface ProxyPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
}

export class ProxyPlaceProvider implements PlaceSearchProvider {
  readonly isSample = false;
  readonly label = '장소 검색 API';
  readonly providesPetPolicy = false;
  private baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async search(q: PlaceQuery, signal?: AbortSignal): Promise<Place[]> {
    const results: Place[] = [];
    for (const c of q.centers.slice(0, 5)) {
      const url = new URL('/api/places', this.baseUrl);
      url.searchParams.set('query', q.keyword?.trim() || KEYWORD[q.category]);
      url.searchParams.set('lat', String(c.latitude));
      url.searchParams.set('lng', String(c.longitude));
      url.searchParams.set('radius', String(Math.round(Math.min(20, q.radiusKm) * 1000)));
      let res: Response;
      try {
        res = await fetch(url, { signal });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new PlaceSearchError('네트워크에 연결할 수 없어요.', 'network');
      }
      if (!res.ok) throw new PlaceSearchError(`장소 검색 서버 오류 (${res.status})`, 'server');
      const body = (await res.json()) as { places: ProxyPlace[] };
      for (const p of body.places ?? []) {
        results.push({
          id: `api-${p.id}`,
          name: p.name,
          category: q.category,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          phone: p.phone || null,
          hours: null,
          imageUri: null,
          policy: { smallDog: null, largeDog: null, indoor: null, outdoor: null, carrierRequired: null, parking: null },
          isSample: false,
          sourceLabel: '장소 검색 API',
        });
      }
    }
    return [...new Map(results.map((p) => [p.id, p])).values()];
  }
}

export function sortByDistance(places: Place[], from: GeoPoint | null) {
  return places
    .map((p) => ({ place: p, distanceKm: from ? haversineKm(from, p) : null }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export function getPlaceProvider(apiBaseUrl: string): PlaceSearchProvider {
  return apiBaseUrl.trim() ? new ProxyPlaceProvider(apiBaseUrl.trim()) : new SamplePlaceProvider();
}
