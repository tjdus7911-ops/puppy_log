// 화면 1. 커뮤니티 피드: 사진이 먼저 보이는 대형 게시물 · 추천/최신/팔로우/여행지 탭 · 작성 플로팅 버튼
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Bell, Bookmark, FlaskConical, Heart, MapPin, MessageCircle, Plus, Search, X } from 'lucide-react';
import { navigate, queryParam, useRoute } from '../../app/router';
import { useStore } from '../../app/store';
import { toggleLike, toggleSave, useCommunity } from '../../app/community';
import { relativeTime, type Post } from '../../domain/community';
import { TripController } from '../../trip/TripController';
import { drivingLocked } from '../../trip/driveLock';
import { PawGlyph } from '../../ui/Art';
import { EmptyState, Loading } from '../../ui/components';
import { Author, DriveLock, MediaView } from './parts';

type Tab = 'rec' | 'new' | 'follow' | 'place';
// Figma M7: 여행 피드 · 멍슐랭(장소 후기) · 멍친구
const TABS: [Tab, string][] = [['rec', '여행 피드'], ['place', '멍슐랭'], ['follow', '멍친구']];

export default function Feed() {
  const route = useRoute();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { toast } = useStore();
  const { posts, ready, error, reload } = useCommunity();
  const [local, setLocal] = useState<Record<string, Post>>({});
  const tab = (queryParam(route, 'tab') as Tab) || 'rec';
  const [q, setQ] = useState<string | null>(null);
  const [placeSel, setPlaceSel] = useState<string | null>(null);

  const merged = posts.map((p) => local[p.id] ?? p);
  const visible = useMemo(() => {
    let l = merged;
    if (q?.trim()) {
      const k = q.trim().replace(/^#/, '');
      l = l.filter((p) => p.title.includes(k) || p.body.includes(k) || p.hashtags.some((t) => t.includes(k)) || p.place?.name.includes(k));
    }
    if (tab === 'rec') return [...l].sort((a, b) => score(b) - score(a));
    if (tab === 'place') return placeSel ? l.filter((p) => p.place?.name === placeSel) : l.filter((p) => p.place);
    return l;
  }, [merged, tab, q, placeSel]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = useMemo(() => [...new Set(merged.filter((p) => p.place).map((p) => p.place!.name))], [merged]);

  if (drivingLocked(live)) return <DriveLock />;

  const like = async (p: Post) => { try { const n = await toggleLike(p); setLocal((s) => ({ ...s, [p.id]: n })); } catch (e) { toast((e as Error).message, 'error'); } };
  const save = async (p: Post) => { try { const n = await toggleSave(p); setLocal((s) => ({ ...s, [p.id]: n })); toast(n.saved ? '저장했어요.' : '저장을 취소했어요.'); } catch (e) { toast((e as Error).message, 'error'); } };

  return (
    <div className="screen" style={{ background: '#fff' }}>
      <header className="cm-head">
        <div className="cm-logo">
          <span className="mark"><PawGlyph size={21} color="#fff" /></span>
          <span><b>멍로드</b><small>MUNG ROAD</small></span>
        </div>
        <button className="icon-btn" aria-label="알림" onClick={() => toast('알림은 서버 연동 후 사용할 수 있어요.')}><Bell size={22} /></button>
        <button className="icon-btn" aria-label="검색" onClick={() => setQ(q == null ? '' : null)}>{q == null ? <Search size={22} /> : <X size={22} />}</button>
      </header>
      {q != null && <input className="input" autoFocus placeholder="제목·#해시태그·장소로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="게시물 검색" style={{ marginBottom: 8 }} />}

      <nav className="cm-tabs" role="tablist" aria-label="피드 종류">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/community?tab=${k}`, { replace: true })}>{l}</button>)}
      </nav>

      <div className="hint mt-12" style={{ fontSize: 12.5, padding: '9px 12px' }}>
        <FlaskConical size={15} />
        <div>서버 미연동 데모 · 내 게시물은 <b>이 기기에만</b> 저장되고, 다른 사람 게시물은 <b>예시</b>예요.</div>
      </div>

      {tab === 'place' && places.length > 0 && (
        <div className="chips scroll mt-12">
          <button className={`chip ${!placeSel ? 'on' : ''}`} onClick={() => setPlaceSel(null)}>전체</button>
          {places.map((n) => <button key={n} className={`chip ${placeSel === n ? 'on' : ''}`} onClick={() => setPlaceSel(n)}><MapPin size={14} />{n}</button>)}
        </div>
      )}

      {!ready ? <Loading /> : error ? (
        <EmptyState kind="error" title="게시물을 불러오지 못했어요" desc={error} action={<button className="btn ghost sm" onClick={reload}>다시 시도</button>} />
      ) : tab === 'follow' ? (
        <EmptyState kind="empty-place" title="팔로우는 서버 연동 후 열려요" desc="다른 보호자를 팔로우하고 새 글을 모아 보는 기능은 계정·서버가 필요해요." />
      ) : visible.length === 0 ? (
        <EmptyState kind="empty-place" title="게시물이 없어요" desc="첫 여행 이야기를 올려 보세요." />
      ) : (
        <div className="cm-feed">
          {visible.map((p) => <PostCard key={p.id} post={p} onLike={() => like(p)} onSave={() => save(p)} />)}
        </div>
      )}

      <button className="fab wide" aria-label="게시물 작성" onClick={() => navigate('/community/new')}><Plus size={20} />글쓰기</button>
    </div>
  );
}

function score(p: Post) {
  const days = (Date.now() - p.createdAt) / 86400_000;
  return p.likeCount * 0.6 + p.commentCount * 2 + (p.isExample ? 0 : 40) - days * 4;
}

export function PostCard({ post: p, onLike, onSave }: { post: Post; onLike: () => void; onSave: () => void }) {
  const first = p.media[0];
  return (
    <article className={`post-card ${first ? '' : 'nophoto'}`} onClick={() => navigate(`/community/post/${p.id}`)} aria-label={`${p.title} 게시물 보기`}>
      {first ? <MediaView m={first} /> : (
        <div className="nophoto-label"><PawGlyph size={44} color="rgba(77,128,232,.35)" />예시 게시물 · 사진 없음</div>
      )}
      {p.isExample ? <span className="badge sample tl-badge">예시</span> : p.sync === 'local-only' ? <span className="badge photo tl-badge">내 게시물 · 이 기기에만 저장</span> : null}
      {p.media.length > 1 && <span className="count-chip count num">1/{p.media.length}</span>}
      <div className="ov">
        <span className="who"><Author name={p.authorName} photo={p.authorPhoto} />{p.authorName}</span>
        <span className="ttl">{p.title}</span>
        {p.place && <span className="meta"><MapPin size={14} />{p.place.address?.split(' ').slice(-1)[0] ?? p.place.name} · {relativeTime(p.createdAt)}</span>}
        <span className="acts" onClick={(e) => e.stopPropagation()}>
          <button aria-label={p.liked ? '좋아요 취소' : '좋아요'} aria-pressed={p.liked} onClick={onLike}><Heart size={19} fill={p.liked ? '#ff5a6e' : 'none'} color={p.liked ? '#ff5a6e' : 'currentColor'} />{p.likeCount}</button>
          <button aria-label="댓글" onClick={() => navigate(`/community/post/${p.id}?comments=1`)}><MessageCircle size={19} />{p.commentCount}</button>
          <button className="save" aria-label={p.saved ? '저장 취소' : '저장'} aria-pressed={p.saved} onClick={onSave}><Bookmark size={20} fill={p.saved ? 'currentColor' : 'none'} /></button>
        </span>
      </div>
    </article>
  );
}
