// 요청서 13장 데이터 구조를 그대로 옮긴 도메인 모델입니다.
// Android 앱의 Room Entity(android/.../data/local/entity)와 필드 이름을 맞춰 두었습니다.

export type PetSize = 'small' | 'medium' | 'large';

export interface Pet {
  id: string;
  name: string;
  photoUri: string | null; // 웹: 압축한 data URL, Android: content:// URI
  birthDate: string | null; // YYYY-MM-DD
  ageYears: number | null; // 생년월일을 모를 때 사용
  weight: number | null; // kg
  size: PetSize;
  notes: string;
  restIntervalMinutes: number;
  createdAt: number;
}

export type TripStatus = 'driving' | 'stopped' | 'resting' | 'ended';

/** 기록의 출처. 데모 기록은 실제 통계에 절대 섞이지 않습니다. */
export type DataSource = 'demo' | 'device-location' | 'manual' | 'pleos-vehicle';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface NamedLocation extends GeoPoint {
  regionName: string; // 예: "강원 강릉시" (시·군 단위까지만)
}

export interface Trip {
  id: string;
  title: string;
  titleEdited: boolean;
  startTime: number;
  endTime: number | null;
  startLocation: NamedLocation | null;
  endLocation: NamedLocation | null;
  destinationName: string | null;
  destination: GeoPoint | null;
  totalDistanceKm: number;
  drivingDurationSeconds: number;
  elapsedDurationSeconds: number;
  restIntervalMinutes: number;
  status: TripStatus;
  diaryText: string;
  diarySource: 'none' | 'template' | 'ai' | 'user';
  memo: string;
  coverPhotoUri: string | null;
  source: DataSource;
  isDemo: boolean;
}

export interface TripPet {
  tripId: string;
  petId: string;
}

export interface TripLocation {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
}

export interface RestSession {
  id: string;
  tripId: string;
  startTime: number;
  endTime: number | null;
  latitude: number | null;
  longitude: number | null;
}

export type PlaceCategory = 'restaurant' | 'cafe' | 'park' | 'restArea' | 'lodging' | 'vet';

export interface VisitedPlace {
  id: string;
  tripId: string;
  placeName: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  visitedAt: number;
  isSample: boolean;
}

export interface TripPhoto {
  id: string;
  tripId: string;
  photoUri: string;
  createdAt: number;
}

export interface AppSettings {
  onboardingDone: boolean;
  demoMode: boolean;
  demoSpeed: number; // 시뮬레이션 배속
  voiceGuidance: boolean;
  apiBaseUrl: string; // AI 일기·장소 검색 프록시 서버 주소 (비우면 사용 안 함)
  defaultRestIntervalMinutes: number;
  userName: string;
  /** 카카오맵 JavaScript 키(도메인 제한 키라 클라이언트 보관 가능). 비우면 개요 지도 */
  kakaoJsKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboardingDone: false,
  demoMode: true,
  demoSpeed: 60,
  voiceGuidance: true,
  apiBaseUrl: '',
  defaultRestIntervalMinutes: 90,
  userName: '',
  kakaoJsKey: '',
};

export function mapJsKey(s: AppSettings): string {
  return (s.kakaoJsKey || (import.meta.env?.VITE_KAKAO_MAP_JS_KEY as string | undefined) || '').trim();
}

export const PET_SIZE_LABEL: Record<PetSize, string> = {
  small: '소형견',
  medium: '중형견',
  large: '대형견',
};

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  restaurant: '음식점',
  cafe: '카페',
  park: '공원·산책로',
  restArea: '휴게소',
  lodging: '숙소',
  vet: '동물병원',
};

export const SOURCE_LABEL: Record<DataSource, string> = {
  demo: '데모 시뮬레이션',
  'device-location': '기기 위치',
  manual: '수동 기록',
  'pleos-vehicle': '차량(Pleos)',
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
