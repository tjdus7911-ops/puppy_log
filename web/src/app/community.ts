// 커뮤니티 상태: 피드(내 게시물 + 예시 게시물), 상호작용, 신고·차단, 작성 초안(실패해도 보존), 게시
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { repo } from '../data/db';
import { newId } from '../domain/models';
import { regionLabel, regionShort } from '../domain/regions';
import {
  examplePosts, exampleComments, ME, normalizeTags, validatePost,
  type AuthorBlock, type Post, type PostComment, type PostMedia, type PostPlace, type ReportReason, type TripSummary, type Visibility,
} from '../domain/community';
import { photoToMedia } from './media';

// ───────────────────────── 작성 초안 ─────────────────────────
export interface PostDraft {
  media: PostMedia[];
  /** 앨범 화면에서 기기에서 가져온 항목(선택 해제해도 목록에 남도록) */
  pool: PostMedia[];
  current: number;
  title: string;
  body: string;
  place: PostPlace | null;
  locationConsent: boolean;
  hashtags: string[];
  visibility: Visibility;
  tripId: string | null;
  tripSummary: TripSummary | null;
  /** 마지막 게시 실패 메시지(입력 내용은 그대로 보존) */
  lastError: string | null;
}

const EMPTY: PostDraft = { media: [], pool: [], current: 0, title: '', body: '', place: null, locationConsent: false, hashtags: [], visibility: 'public', tripId: null, tripSummary: null, lastError: null };
let draft: PostDraft = EMPTY;
const subs = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const Draft = {
  get: () => draft,
  subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn); },
  set(patch: Partial<PostDraft> | ((d: PostDraft) => Partial<PostDraft>)) {
    const p = typeof patch === 'function' ? patch(draft) : patch;
    // 사용자가 내용을 고치면 지난 오류 안내는 지움(오류를 직접 설정하는 경우 제외)
    draft = { ...draft, ...('lastError' in p ? {} : { lastError: null }), ...p };
    subs.forEach((f) => f());
    // 앱이 닫혀도 작성 중인 내용이 남도록 저장(실패해도 화면 동작에는 영향 없음)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void repo.savePostDraft(draft).catch(() => {}); }, 400);
  },
  reset() { draft = EMPTY; subs.forEach((f) => f()); void repo.savePostDraft(null).catch(() => {}); },
  isEmpty: () => draft.media.length === 0 && !draft.title && !draft.body,
  /** 저장해 둔 초안 복구(앱 재실행 후) */
  async restore() {
    try { const d = (await repo.getPostDraft()) as PostDraft | null; if (d && Draft.isEmpty()) { draft = { ...EMPTY, ...d }; subs.forEach((f) => f()); } } catch { /* noop */ }
  },
};

export function useDraft() {
  return useSyncExternalStore(Draft.subscribe, Draft.get);
}

/** 여행 기록 → 커뮤니티 공유: 사진·제목·장소·메모를 불러옵니다. 이동 경로·집 주소는 넣지 않습니다. */
export async function startDraftFromTrip(tripId: string) {
  const trip = await repo.getTrip(tripId);
  if (!trip) throw new Error('여행 기록을 찾을 수 없어요.');
  const [photos, rests] = await Promise.all([repo.photosOf(tripId), repo.restsOf(tripId)]);
  const end = trip.destination ?? trip.endLocation;
  // 좌표는 소수 셋째 자리(약 100m)로만 남겨 정확한 위치를 노출하지 않음
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const place: PostPlace | null = end ? {
    name: trip.destinationName ?? regionLabel(end),
    address: trip.endLocation ? regionLabel(trip.endLocation) : regionLabel(end),
    latitude: round(end.latitude), longitude: round(end.longitude),
    category: null, petStatus: 'check', source: 'trip',
  } : null;
  const region = trip.endLocation ? regionShort(trip.endLocation) : null;
  draft = {
    ...EMPTY,
    media: photos.slice(0, 10).map(photoToMedia),
    title: trip.title,
    body: trip.memo,
    place,
    hashtags: [region && region !== '알 수 없음' ? region : null, '반려견여행', '멍로드'].filter(Boolean) as string[],
    tripId,
    tripSummary: { distanceKm: trip.totalDistanceKm, drivingSec: trip.drivingDurationSeconds, fromRegion: trip.startLocation ? regionShort(trip.startLocation) : null, restCount: rests.filter((r) => r.endTime).length },
  };
  subs.forEach((f) => f());
}

export async function publishDraft(author: { name: string; petName: string | null; photo: string | null }): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const d = Draft.get();
  const err = validatePost(d);
  if (err) { Draft.set({ lastError: err }); return { ok: false, message: err }; }
  const now = Date.now();
  const post: Post = {
    id: newId(), authorId: ME, authorName: author.name, authorPetName: author.petName, authorPhoto: author.photo,
    title: d.title.trim(), body: d.body.trim(), media: d.media, place: d.place, locationConsent: !!d.place && d.locationConsent,
    hashtags: normalizeTags(d.hashtags, d.body), visibility: d.visibility, tripId: d.tripId, tripSummary: d.tripSummary,
    createdAt: now, updatedAt: now, likeCount: 0, commentCount: 0, liked: false, saved: false, sync: 'local-only', isExample: false,
  };
  try {
    await repo.savePost(post);
  } catch (e) {
    const message = `게시물을 저장하지 못했어요 (${(e as Error).message}). 입력한 내용과 사진은 그대로 남아 있어요.`;
    Draft.set({ lastError: message });
    return { ok: false, message };
  }
  Draft.reset();
  return { ok: true, id: post.id };
}

// ───────────────────────── 피드 ─────────────────────────
type Inter = Record<string, { liked?: boolean; saved?: boolean }>;

export function useCommunity() {
  const [state, setState] = useState<{ posts: Post[]; blocks: AuthorBlock[]; ready: boolean; error: string | null }>({ posts: [], blocks: [], ready: false, error: null });
  const load = useCallback(async () => {
    try {
      const [mine, inter, blocks] = await Promise.all([repo.listPosts(), repo.getInteractions(), repo.listBlocks()]);
      const blocked = new Set(blocks.map((b) => b.authorId));
      const ex = examplePosts().map((p) => applyInter(p, inter));
      const posts = [...mine, ...ex].filter((p) => !blocked.has(p.authorId)).sort((a, b) => b.createdAt - a.createdAt);
      setState({ posts, blocks, ready: true, error: null });
    } catch (e) {
      setState((s) => ({ ...s, ready: true, error: (e as Error).message }));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}

function applyInter(p: Post, inter: Inter): Post {
  const i = inter[p.id];
  if (!i) return p;
  return { ...p, liked: !!i.liked, saved: !!i.saved, likeCount: p.likeCount + (i.liked ? 1 : 0) };
}

export async function getPostById(id: string): Promise<Post | null> {
  const mine = await repo.getPost(id);
  if (mine) return mine;
  const ex = examplePosts().find((p) => p.id === id);
  return ex ? applyInter(ex, await repo.getInteractions()) : null;
}

export async function toggleLike(p: Post): Promise<Post> {
  const liked = !p.liked;
  const next = { ...p, liked, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) };
  if (p.isExample) { const inter = await repo.getInteractions(); inter[p.id] = { ...inter[p.id], liked }; await repo.saveInteractions(inter); }
  else await repo.savePost(next);
  return next;
}

export async function toggleSave(p: Post): Promise<Post> {
  const next = { ...p, saved: !p.saved };
  if (p.isExample) { const inter = await repo.getInteractions(); inter[p.id] = { ...inter[p.id], saved: next.saved }; await repo.saveInteractions(inter); }
  else await repo.savePost(next);
  return next;
}

export async function commentsFor(p: Post): Promise<PostComment[]> {
  const local = await repo.commentsOf(p.id);
  return [...(p.isExample ? exampleComments().filter((c) => c.postId === p.id) : []), ...local].sort((a, b) => a.createdAt - b.createdAt);
}

export async function addComment(p: Post, body: string, authorName: string): Promise<{ post: Post; comment: PostComment }> {
  const comment: PostComment = { id: newId(), postId: p.id, authorId: ME, authorName, body: body.trim(), createdAt: Date.now(), isExample: false };
  await repo.addComment(comment);
  const post = { ...p, commentCount: p.commentCount + 1 };
  if (!p.isExample) await repo.savePost(post);
  return { post, comment };
}

export async function reportPost(p: Post, reason: ReportReason) {
  await repo.addReport({ id: newId(), postId: p.id, reason, createdAt: Date.now(), sync: 'local-only' });
}

export async function blockAuthor(p: Post) {
  await repo.block({ authorId: p.authorId, authorName: p.authorName, createdAt: Date.now() });
}

/** 같은 장소를 연결한 게시물(이 기기 기준) */
export function postsAtPlace(posts: Post[], name: string) {
  return posts.filter((p) => p.place && p.place.name === name);
}
