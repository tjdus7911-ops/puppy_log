// 커뮤니티: 게시 검증, 게시 성공/실패 시 초안 유지, 신고·차단, 해시태그 정리
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { examplePosts, normalizeTags, validatePost, type PostMedia, type PostPlace } from '../domain/community';
import { repo } from '../data/db';
import { blockAuthor, Draft, publishDraft, reportPost } from './community';

const media = (id: string): PostMedia => ({ id, kind: 'image', src: 'data:image/png;base64,x', original: 'data:image/png;base64,x', crop: 'original', filter: 'none', text: '', textPos: 'bottom', memo: '' });
const place: PostPlace = { name: '강릉 경포해변', address: '강원 강릉', latitude: 37.806, longitude: 128.896, category: 'park', petStatus: 'check', source: 'trip' } as PostPlace;
const author = { name: '사슴 보호자', petName: '사슴', photo: null };

afterEach(() => { Draft.reset(); vi.restoreAllMocks(); });

describe('게시 검증', () => {
  it('제목·미디어·위치 동의를 확인', () => {
    expect(validatePost({ title: '', media: [media('a')], place: null, locationConsent: false })).toMatch(/제목/);
    expect(validatePost({ title: '산책', media: [], place: null, locationConsent: false })).toMatch(/1개 이상/);
    expect(validatePost({ title: '산책', media: Array.from({ length: 11 }, (_, i) => media(String(i))), place: null, locationConsent: false })).toMatch(/최대 10개/);
    expect(validatePost({ title: '산책', media: [media('a')], place, locationConsent: false })).toMatch(/동의/);
    expect(validatePost({ title: '산책', media: [media('a')], place, locationConsent: true })).toBeNull();
  });
  it('해시태그: # 제거·본문 태그 추출·중복 제거·최대 10개', () => {
    expect(normalizeTags(['#강릉', '강릉', ' 바다 '], '좋았다 #산책 #강릉')).toEqual(['강릉', '바다', '산책']);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});

describe('게시(이 기기 저장)', () => {
  it('성공하면 로컬 전용 게시물로 저장되고 초안은 비워짐', async () => {
    Draft.set({ media: [media('a'), media('b')], title: ' 강릉 바다 ', body: '#바다 좋아', place, locationConsent: true, hashtags: ['강릉'] });
    const r = await publishDraft(author);
    expect(r.ok).toBe(true);
    const saved = await repo.getPost((r as { id: string }).id);
    expect(saved?.title).toBe('강릉 바다');
    expect(saved?.sync).toBe('local-only');
    expect(saved?.media).toHaveLength(2);
    expect(saved?.hashtags).toEqual(['강릉', '바다']);
    expect(Draft.isEmpty()).toBe(true);
  });
  it('저장에 실패하면 입력한 내용과 사진을 그대로 유지', async () => {
    vi.spyOn(repo, 'savePost').mockRejectedValueOnce(new Error('QuotaExceeded'));
    Draft.set({ media: [media('a')], title: '실패 테스트', body: '본문' });
    const r = await publishDraft(author);
    expect(r.ok).toBe(false);
    const d = Draft.get();
    expect(d.title).toBe('실패 테스트');
    expect(d.media).toHaveLength(1);
    expect(d.lastError).toMatch(/그대로 남아/);
  });
  it('검증 실패도 초안을 지우지 않음, 내용을 고치면 오류 안내가 사라짐', async () => {
    Draft.set({ media: [media('a')], title: '' });
    const r = await publishDraft(author);
    expect(r.ok).toBe(false);
    expect(Draft.get().media).toHaveLength(1);
    Draft.set({ title: '고침' });
    expect(Draft.get().lastError).toBeNull();
  });
});

describe('신고·차단(이 기기 기준)', () => {
  it('신고 기록과 차단 목록이 저장됨', async () => {
    const ex = examplePosts().find((p) => p.id === 'ex2')!;
    await reportPost(ex, 'spam');
    expect((await repo.listReports()).some((x) => x.postId === 'ex2' && x.reason === 'spam')).toBe(true);
    await blockAuthor(ex);
    expect((await repo.listBlocks()).map((b) => b.authorId)).toContain(ex.authorId);
  });
});
