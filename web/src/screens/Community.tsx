// SCREEN 07 — 멍친구 커뮤니티 (향후 확장). 기본 UI·데이터 구조만 준비, 실제 운영 기능은 서버와 함께 단계적으로 개발.
import { drivingLocked } from '../trip/driveLock';
import { useState, useSyncExternalStore } from 'react';
import { TripController } from '../trip/TripController';
import { Heart, MessageCircle, MoreHorizontal, PenLine, ShieldCheck } from 'lucide-react';
import { examplePosts, POST_KIND_LABEL, type PostKind } from '../domain/community';
import { EmptyState, Hint, TopBar } from '../ui/components';
import { DogFace } from '../ui/Art';
import { useStore } from '../app/store';

const TABS: { key: 'all' | PostKind; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'review', label: '여행 후기' }, { key: 'buddy', label: '멍친구 찾기' }, { key: 'meetup', label: '모임' },
];

function ago(ts: number) {
  const h = Math.floor((Date.now() - ts) / 3600_000);
  return h < 1 ? '방금 전' : h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

export default function Community() {
  const { toast } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  if (drivingLocked(live)) {
    return (
      <div className="screen">
        <TopBar title="멍친구 커뮤니티" showBack={false} />
        <EmptyState kind="empty-place" title="주행 중에는 커뮤니티를 쓸 수 없어요" desc="안전을 위해 정차하거나 휴식 중일 때 이용해 주세요." />
      </div>
    );
  }
  const posts = examplePosts().filter((p) => tab === 'all' || p.kind === tab);

  return (
    <div className="screen">
      <TopBar title="멍친구 커뮤니티" showBack={false} right={<span className="badge gray">준비 중</span>} />
      <Hint tone="green"><span>커뮤니티는 향후 확장 기능이에요. 지금 보이는 글은 화면 구성을 보여주기 위한 <b>예시 게시물</b>이며, 글쓰기·댓글·참여 신청은 서버 연동 후 열려요.</span></Hint>
      <div className="chips scroll mt-16" role="tablist">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`chip ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div className="mt-16" style={{ display: 'grid', gap: 14 }}>
        {posts.map((p) => {
          const on = liked.has(p.id);
          return (
            <article key={p.id} className="card">
              <div className="row" style={{ gap: 10 }}>
                <div className="avatar" style={{ width: 40, height: 40 }}><DogFace size={40} tone={p.id === 'ex3' ? 'brown' : 'white'} /></div>
                <div className="grow">
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{p.author.nickname} <span className="badge sample" style={{ height: 20 }}>예시</span></p>
                  <p className="t-cap">{ago(p.createdAt)} · {POST_KIND_LABEL[p.kind]}{p.region ? ` · ${p.region}` : ''}</p>
                </div>
                <button className="icon-btn" aria-label="더보기(신고·차단 예정)" onClick={() => toast('신고·차단은 서버 연동 후 제공돼요.')}><MoreHorizontal size={18} /></button>
              </div>
              <p className="h-md mt-12">{p.title}</p>
              <p className="t-sub mt-8">{p.body}</p>
              <div className="row between mt-16">
                <div className="row" style={{ gap: 14 }}>
                  <button className="link" style={{ color: on ? 'var(--error)' : undefined }} aria-pressed={on} onClick={() => setLiked((s) => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; })}>
                    <Heart size={16} fill={on ? 'currentColor' : 'none'} /> {p.likeCount + (on ? 1 : 0)}
                  </button>
                  <span className="link"><MessageCircle size={16} /> {p.commentCount}</span>
                </div>
                {p.kind !== 'review' && <button className="btn primary sm" onClick={() => toast('참여 신청은 서버 연동 후 제공돼요(승인제 예정).')}>함께하기</button>}
              </div>
            </article>
          );
        })}
      </div>
      <button className="btn secondary block mt-24" onClick={() => toast('글쓰기는 준비 중이에요.')}><PenLine size={18} />글쓰기 (준비 중)</button>
      <p className="t-cap mt-16 row" style={{ gap: 6 }}><ShieldCheck size={14} />정확한 실시간 위치와 개인 이동 경로는 다른 사용자에게 기본 공개하지 않아요.</p>
    </div>
  );
}
