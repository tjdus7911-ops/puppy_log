// 멍로드 커뮤니티 데이터 모델 (게시물 · 미디어 · 장소 연결 · 댓글 · 신고 · 차단)
// 서버가 아직 없으므로 내 게시물은 이 기기(IndexedDB)에만 저장하고 sync: 'local-only' 로 표시합니다.
// 다른 사용자의 게시물은 '예시' 게시물만 보여주며, 실제 사진이 없으면 사진을 지어내지 않습니다.
// 개인정보 원칙: 이동 경로 전체·집 주소·정확한 실시간 위치는 게시물에 넣지 않습니다(장소는 사용자가 고른 한 곳만).
import type { PlaceCategory } from './models';

export type Visibility = 'public' | 'followers' | 'private';
export type MediaFilter = 'none' | 'warm' | 'cool' | 'vivid' | 'mono' | 'soft';
export type CropRatio = 'original' | '1:1' | '4:5' | '16:9';
export type TextPos = 'top' | 'center' | 'bottom';

export interface PostMedia {
  id: string;
  kind: 'image' | 'video';
  /** 화면에 쓰는 이미지(data URL). 자르기를 적용하면 잘린 결과가 들어갑니다. 동영상은 빈 문자열. */
  src: string;
  /** 자르기 전 원본(data URL) — 다시 자르기 위해 보관 */
  original: string;
  /** 동영상 원본 */
  blob?: Blob;
  durationSec?: number;
  crop: CropRatio;
  filter: MediaFilter;
  text: string;
  textPos: TextPos;
  memo: string;
  /** 여행 사진에서 가져온 경우 원본 사진 id */
  fromTripPhotoId?: string;
}

export interface PostPlace {
  name: string;
  /** 시·군·구 수준 주소(번지·집 주소 없음) */
  address: string | null;
  latitude: number;
  longitude: number;
  category: PlaceCategory | null;
  /** 업체 확인 정보가 있을 때만 'ok', 그 외 '확인 필요' */
  petStatus: 'ok' | 'check';
  source: 'trip' | 'search' | 'region';
}

export interface TripSummary {
  distanceKm: number;
  drivingSec: number;
  fromRegion: string | null;
  restCount: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPetName: string | null;
  authorPhoto: string | null;
  title: string;
  body: string;
  media: PostMedia[];
  place: PostPlace | null;
  /** 장소 정보를 게시물에 공개하는 데 동의했는지(장소를 연결하면 필수) */
  locationConsent: boolean;
  hashtags: string[];
  visibility: Visibility;
  tripId: string | null;
  tripSummary: TripSummary | null;
  createdAt: number;
  updatedAt: number;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  /** 서버 동기화 상태. 서버 연동 전에는 항상 local-only */
  sync: 'local-only' | 'synced';
  isExample: boolean;
}

export interface PostComment { id: string; postId: string; authorId: string; authorName: string; body: string; createdAt: number; isExample: boolean }
export type ReportReason = 'spam' | 'abuse' | 'privacy' | 'animal' | 'other';
export interface PostReport { id: string; postId: string; reason: ReportReason; createdAt: number; sync: 'local-only' }
export interface AuthorBlock { authorId: string; authorName: string; createdAt: number }

export const ME = 'me';
export const MAX_MEDIA = 10;

export const VISIBILITY_LABEL: Record<Visibility, string> = { public: '전체 공개', followers: '팔로워 공개', private: '나만 보기' };
export const REPORT_LABEL: Record<ReportReason, string> = { spam: '스팸·광고', abuse: '욕설·괴롭힘', privacy: '개인정보 노출', animal: '동물 학대 의심', other: '기타' };
export const FILTER_LABEL: Record<MediaFilter, string> = { none: '원본', warm: '따뜻하게', cool: '시원하게', vivid: '선명하게', mono: '흑백', soft: '부드럽게' };
export const FILTER_CSS: Record<MediaFilter, string> = {
  none: 'none',
  warm: 'sepia(.18) saturate(1.15) brightness(1.03)',
  cool: 'saturate(1.05) hue-rotate(-8deg) brightness(1.03) contrast(1.02)',
  vivid: 'saturate(1.35) contrast(1.08)',
  mono: 'grayscale(1) contrast(1.05)',
  soft: 'brightness(1.07) contrast(.92) saturate(.92)',
};
export const CROP_LABEL: Record<CropRatio, string> = { original: '원본', '1:1': '1:1', '4:5': '4:5', '16:9': '16:9' };

/** 본문의 #태그와 입력한 태그를 합쳐 중복 없이 최대 10개 */
export function normalizeTags(tags: string[], body = ''): string[] {
  const fromBody = [...body.matchAll(/#([0-9A-Za-z가-힣_]{1,20})/g)].map((m) => m[1]);
  const all = [...tags, ...fromBody].map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
  return [...new Set(all)].slice(0, 10);
}

export function relativeTime(ts: number, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}일 전` : new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

/** 게시 전 검사: 제목·사진·장소 공개 동의 */
export function validatePost(p: Pick<Post, 'title' | 'media' | 'place' | 'locationConsent'>): string | null {
  if (!p.title.trim()) return '게시글 제목을 입력해 주세요.';
  if (p.media.length === 0) return '사진이나 동영상을 1개 이상 선택해 주세요.';
  if (p.media.length > MAX_MEDIA) return `사진·동영상은 최대 ${MAX_MEDIA}개까지 올릴 수 있어요.`;
  if (p.place && !p.locationConsent) return '연결한 장소를 공개하려면 위치 정보 공개에 동의해 주세요.';
  return null;
}

const H = 3600_000;
/** 예시 게시물: 서버 연동 전 화면 구성을 보여주기 위한 것. 사진은 없으며(지어내지 않음) '예시'로 표시합니다. */
export function examplePosts(now = Date.now()): Post[] {
  const base = { authorPhoto: null, media: [], locationConsent: true, visibility: 'public' as const, tripId: null, liked: false, saved: false, sync: 'synced' as const, isExample: true };
  return [
    { ...base, id: 'ex1', authorId: 'ex-u1', authorName: '예시·멍여행러', authorPetName: '보리', title: '강릉 경포해변, 시원한 바다 산책', body: '보리랑 경포해변에 다녀왔어요! 바다도 보고 근처 동반 카페도 들렀는데 너무 좋았어요. 동반 여부는 방문 전에 꼭 확인하세요.', place: { name: '강릉 경포해변', address: '강원 강릉시', latitude: 37.8055, longitude: 128.9086, category: 'park', petStatus: 'check', source: 'region' }, hashtags: ['강릉', '경포해변', '반려견여행'], tripSummary: { distanceKm: 214, drivingSec: 2 * 3600 + 51 * 60, fromRegion: '서울', restCount: 1 }, createdAt: now - 3 * 24 * H, updatedAt: now - 3 * 24 * H, likeCount: 246, commentCount: 2 } as Post,
    { ...base, id: 'ex2', authorId: 'ex-u2', authorName: '예시·코코네', authorPetName: '코코', title: '서울 → 속초, 휴게소 두 번 쉬어간 후기', body: '90분 간격으로 쉬었더니 이동이 한결 편했어요. 휴게소 반려견 쉼터는 운영 여부를 꼭 확인하세요.', place: { name: '속초 영랑호', address: '강원 속초시', latitude: 38.2195, longitude: 128.5838, category: 'park', petStatus: 'check', source: 'region' }, hashtags: ['속초', '휴게소', '휴식알림'], tripSummary: { distanceKm: 196, drivingSec: 2 * 3600 + 40 * 60, fromRegion: '서울', restCount: 2 }, createdAt: now - 26 * H, updatedAt: now - 26 * H, likeCount: 18, commentCount: 1 } as Post,
    { ...base, id: 'ex3', authorId: 'ex-u3', authorName: '예시·대형견모임', authorPetName: '두부', title: '양평 강변 대형견 산책 모임 후기', body: '주말 오전 양평 강변 산책로를 함께 걸었어요. 그늘이 있는 구간이 많았어요.', place: { name: '양평 두물머리', address: '경기 양평군', latitude: 37.5348, longitude: 127.3150, category: 'park', petStatus: 'check', source: 'region' }, hashtags: ['양평', '대형견', '산책'], tripSummary: null, createdAt: now - 50 * H, updatedAt: now - 50 * H, likeCount: 9, commentCount: 0 } as Post,
  ];
}

export function exampleComments(now = Date.now()): PostComment[] {
  return [
    { id: 'exc1', postId: 'ex1', authorId: 'ex-u9', authorName: '예시·몽이맘', body: '저도 다음 달에 가보려고요! 주차는 편했나요?', createdAt: now - 2 * 24 * H, isExample: true },
    { id: 'exc2', postId: 'ex1', authorId: 'ex-u1', authorName: '예시·멍여행러', body: '공영주차장이 넓었어요 :)', createdAt: now - 47 * H, isExample: true },
    { id: 'exc3', postId: 'ex2', authorId: 'ex-u7', authorName: '예시·초코아빠', body: '휴식 간격 꿀팁 감사합니다!', createdAt: now - 20 * H, isExample: true },
  ];
}
