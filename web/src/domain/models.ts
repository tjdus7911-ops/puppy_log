// 요청서 13장 데이터 구조를 그대로 옮긴 도메인 모델입니다.
// Android 앱의 Room Entity(android/.../data/local/entity)와 필드 이름을 맞춰 두었습니다.

import type { CabinCapabilities, CabinPromptKind } from './cabin';
import type { MungReview } from './mungchelin';
import type { IntervalChange, PetCare, RestPolicy, RestRecoEntry } from './restCare';

export type PetSize = 'small' | 'medium' | 'large';

export interface Pet {
  id: string;
  name: string;
  /** 견종(선택). 이전 버전 데이터에는 없을 수 있음 */
  breed?: string | null;
  photoUri: string | null; // 웹: 압축한 data URL, Android: content:// URI
  birthDate: string | null; // YYYY-MM-DD
  ageYears: number | null; // 생년월일을 모를 때 사용
  weight: number | null; // kg
  size: PetSize;
  notes: string;
  restIntervalMinutes: number;
  /** 여행 케어(선택): 노령견·멀미·이동 불안·건강 특이사항·수의사 안내 */
  care?: PetCare;
  createdAt: number;
}

export type TripStatus = 'driving' | 'stopped' | 'resting' | 'ended';

/**
 * 전체 여행 세션의 단계. 주행(DriveLeg)과 분리되어 있습니다.
 * planning(여행 준비) → outbound(이동 중) → at-destination(목적지 도착·여행지 활동)
 *   → returning(복귀 이동 중) → completed(여행 완료)
 * 목적지 도착은 여행 종료가 아닙니다. 여행지에서 바로 마무리하면 returning 을 건너뜁니다.
 */
export type TripPhase = 'planning' | 'outbound' | 'at-destination' | 'returning' | 'completed';

export const PHASE_LABEL: Record<TripPhase, string> = {
  planning: '여행 준비',
  outbound: '이동 중',
  'at-destination': '여행지 활동 중',
  returning: '복귀 이동 중',
  completed: '여행 완료',
};

/** outbound = 가는 길, extra = 여행지 내 추가 이동(여러 번 가능), return = 돌아오는 길 */
export type LegKind = 'outbound' | 'extra' | 'return';

/** 차량 주행 기록 1구간(가는 길 / 돌아오는 길). 여행 세션 합계는 구간 합으로 계산합니다. */
export interface DriveLeg {
  id: string;
  tripId: string;
  kind: LegKind;
  startTime: number;
  endTime: number | null;
  distanceKm: number;
  drivingDurationSeconds: number;
  elapsedDurationSeconds: number;
  restCount: number;
  restDurationSeconds: number;
  startLocation: NamedLocation | null;
  endLocation: NamedLocation | null;
  source: DataSource;
  isDemo: boolean;
}

export const LEG_LABEL: Record<LegKind, string> = { outbound: '가는 길', extra: '여행지 내 이동', return: '돌아오는 길' };

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
  /** v2: 여행 단계 (기존 기록은 마이그레이션으로 채움) */
  phase: TripPhase;
  arrivedAt: number | null;
  returnStartedAt: number | null;
  /** 차량 앱 ↔ 모바일 앱 동기화 대비 필드. 동기화 서버가 없으므로 항상 'local-only' */
  updatedAt: number;
  syncState: 'local-only';
  /** 휴식 추천 근거(출발 시 결정) · 추천 이력 · 여행 중 간격 변경 이유 */
  restPolicy?: RestPolicy;
  restRecoLog?: RestRecoEntry[];
  restIntervalChanges?: IntervalChange[];
  /** 여행 시작 때 확인한 차량 탑승 공간 도메인 지원 여부 */
  vehicleCaps?: CabinCapabilities;
  safetyLog?: SafetyLogEntry[];
  /** 출발 전 고른 경로 옵션(내비 requestRoute 로 전달 예정) */
  routeOption?: RouteOption;
  /** 출발 전 경유지로 넣은 추천 휴식지 */
  plannedWaypoints?: PlannedWaypoint[];
  /** 여행 중 정보 수정 기록(목적지·경로 옵션·경유지) */
  infoEdits?: { at: number; fields: string[] }[];
  placeSuggestLog?: PlaceSuggestEntry[];
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
  legId?: string | null;
}

export interface RestSession {
  id: string;
  tripId: string;
  startTime: number;
  endTime: number | null;
  latitude: number | null;
  longitude: number | null;
  legId?: string | null;
  /** 휴식 시작 방법(기획서 5장 RestSession): 화면 버튼 · 음성 · 주차 중 뒷문 열림 확인 */
  startMethod?: RestStartMethod;
  /** 휴식 중 반려견을 잠깐 차에 두고 내렸는지(펫 모드 안내를 본 경우 true, 함께 내렸으면 false) */
  petStayedInCar?: boolean | null;
}

export type RestStartMethod = 'button' | 'voice' | 'door';
export type RouteOption = 'comfort' | 'fast';
export const ROUTE_OPTION_LABEL: Record<RouteOption, string> = { comfort: '편한 길', fast: '빠른 길' };
export interface PlannedWaypoint { name: string; latitude: number; longitude: number; isSample: boolean; atMinute: number }
export const REST_START_LABEL: Record<RestStartMethod, string> = { button: '버튼', voice: '음성', door: '뒷문 열림 확인' };

/** 탑승 안전 안내·뒷문 휴식 확인 기록 */
export interface SafetyLogEntry { at: number; kind: CabinPromptKind; response: 'yes' | 'no' | 'none' }
/** 주행 중 동반 장소 제안 기록(장소 제안 수락률) */
export interface PlaceSuggestEntry { at: number; placeId: string; accepted: boolean | null }

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
  /** 'search' = 검색 결과에서 '들렀어요', 'user' = 여행지에서 직접 기록 */
  source?: 'search' | 'user';
  memo?: string;
  /** 멍슐랭 후기(보호자가 남긴 반려견 동반 후기, 선택) */
  review?: MungReview;
}

export interface TripPhoto {
  id: string;
  tripId: string;
  photoUri: string;
  createdAt: number;
  /** v2: 앨범 표시 순서와 사진별 메모 */
  order: number;
  memo: string;
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
  /** 출발 전 안전 체크에서 확인한 항목 id (새 여행을 시작하면 비움) */
  safetyChecks: string[];
  /** 주행 중 반려견 동반 장소 자동 추천 */
  autoRecommend: boolean;
  autoRecoCategories: PlaceCategory[];
  /** 예상 휴식 계산 시 도착 직전(20분 이내) 휴식은 세지 않음 */
  skipRestNearArrival: boolean;
  /** 대표 반려견(홈 환영 문구·나의 반려견 카드). 없거나 삭제됐으면 첫 번째 반려견 */
  mainPetId?: string | null;
  /** 반려견 동승 기준 돌발 상황 음성 안내(기본 켬) */
  hazardAlerts?: boolean;
  /** 집 위치(오는 길 안내용). 이 기기에만 저장, 공유 카드·커뮤니티에 넣지 않음 */
  homeLocation?: { name: string; latitude: number; longitude: number; savedAt: number } | null;
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
  safetyChecks: [],
  autoRecommend: true,
  autoRecoCategories: ['restArea', 'cafe', 'park', 'restaurant'],
  skipRestNearArrival: true,
  mainPetId: null,
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

/** 저장된 여행(구버전 포함)을 v2 형태로 맞춥니다. 빠진 필드만 채우고 기존 값은 바꾸지 않습니다. */
export function normalizeTrip(t: Trip): Trip {
  const anyT = t as Partial<Trip> & Trip;
  return {
    ...t,
    phase: anyT.phase ?? (t.status === 'ended' ? 'completed' : 'outbound'),
    arrivedAt: anyT.arrivedAt ?? (t.status === 'ended' ? t.endTime : null),
    returnStartedAt: anyT.returnStartedAt ?? null,
    updatedAt: anyT.updatedAt ?? t.endTime ?? t.startTime,
    syncState: 'local-only',
  };
}

export function normalizePhoto(p: TripPhoto): TripPhoto {
  const a = p as Partial<TripPhoto> & TripPhoto;
  return { ...p, order: a.order ?? p.createdAt, memo: a.memo ?? '' };
}
