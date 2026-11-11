// 화면 2. 게시글 상세(몰입형 다크): 세로형 사진·영상 · 좌우 스와이프 · 좋아요/댓글/공유/저장 · 장소 바로가기
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, Flag, Heart, Lock, MapPin, MessageCircle, Send, Share2, ShieldOff, Trash2 } from 'lucide-react';
import { back, navigate, queryParam } from '../../app/router';
import { useStore } from '../../app/store';
import { addComment, blockAuthor, commentsFor, getPostById, reportPost, toggleLike, toggleSave } from '../../app/community';
import { repo } from '../../data/db';
import { ME, REPORT_LABEL, VISIBILITY_LABEL, relativeTime, type Post, type PostComment, type ReportReason } from '../../domain/community';
import { CATEGORY_LABEL } from '../../domain/models';
import { PawGlyph } from '../../ui/Art';
import { ErrorState, Loading, Sheet } from '../../ui/components';
import { Author, MediaView } from './parts';

export default function PostDetail({ id, route }: { id: string; route: string }) {
  const { toast, settings } = useStore();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [idx, setIdx] = useState(0);
  const [more, setMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(queryParam(route, 'comments') === '1');
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => { getPostById(id).then((p) => setPost(p)).catch(() => setPost(null)); }, [id]);
  useEffect(() => { if (post && commentsOpen) void commentsFor(post).then(setComments); }, [post, commentsOpen]);

  if (post === undefined) return <div className="cm-dark"><Loading label="게시물을 불러오는 중이에요" /></div>;
  if (post === null) return <div className="screen"><ErrorState title="게시물을 찾을 수 없어요" desc="삭제되었거나 이 기기에 없는 게시물이에요." extra={<button className="btn ghost sm" onClick={() => navigate('/community', { replace: true })}>커뮤니티로</button>} /></div>;

  const p = post;
  const mine = p.authorId === ME;
  const onScroll = () => { const el = track.current; if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth)); };
  const go = (d: number) => { const el = track.current; if (el) el.scrollTo({ left: (idx + d) * el.clientWidth, behavior: 'smooth' }); };
  const run = async (fn: () => Promise<Post>) => { try { setPost(await fn()); } catch (e) { toast((e as Error).message, 'error'); } };
  const share = async () => {
    const t = `${p.title}${p.place ? ` · ${p.place.name}` : ''} — 멍로드`;
    try {
      if (navigator.share) { await navigator.share({ title: p.title, text: t }); return; }
      await navigator.clipboard.writeText(t); toast('게시물 내용을 복사했어요. (서버 연동 전이라 링크 공유는 지원하지 않아요)');
    } catch (e) { if ((e as Error).name !== 'AbortError') toast('공유를 지원하지 않는 환경이에요.', 'error'); }
  };
  const send = async () => {
    if (!text.trim()) return;
    try { const r = await addComment(p, text, settings.userName || '나'); setPost(r.post); setComments((c) => [...c, r.comment]); setText(''); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="pd" aria-label="게시글 상세">
      <div className="pd-track" ref={track} onScroll={onScroll}>
        {p.media.length ? p.media.map((m) => (
          <div key={m.id} className="pd-slide"><MediaView m={m} contain controls={m.kind === 'video'} /></div>
        )) : (
          <div className="pd-slide"><div className="nomedia"><PawGlyph size={56} color="rgba(141,174,245,.5)" /><b style={{ color: '#c8d3e6' }}>예시 게시물이라 사진이 없어요</b><span style={{ fontSize: 13 }}>실제 게시물에는 보호자가 올린 사진·영상이 표시돼요.</span></div></div>
        )}
      </div>

      <div className="pd-top">
        <button className="dk-btn" aria-label="뒤로" onClick={() => (history.length > 1 ? back() : navigate('/community'))}><ChevronLeft size={26} /></button>
        {p.media.length > 1 ? <span className="count-chip num">{idx + 1}/{p.media.length}</span> : <span />}
        <button className="dk-btn" aria-label="더보기" onClick={() => setMore(true)}><Ellipsis size={24} /></button>
      </div>
      {p.media.length > 1 && idx > 0 && <button className="dk-btn" aria-label="이전 사진" style={{ position: 'absolute', left: 6, top: '42%', zIndex: 3 }} onClick={() => go(-1)}><ChevronLeft size={28} /></button>}
      {p.media.length > 1 && idx < p.media.length - 1 && <button className="dk-btn" aria-label="다음 사진" style={{ position: 'absolute', right: 6, top: '42%', zIndex: 3 }} onClick={() => go(1)}><ChevronRight size={28} /></button>}

      <div className="pd-side">
        <button aria-label={p.liked ? '좋아요 취소' : '좋아요'} aria-pressed={p.liked} onClick={() => run(() => toggleLike(p))}><Heart size={30} fill={p.liked ? '#ff5a6e' : 'none'} color={p.liked ? '#ff5a6e' : '#fff'} />{p.likeCount}</button>
        <button aria-label="댓글" onClick={() => setCommentsOpen(true)}><MessageCircle size={30} />{p.commentCount}</button>
        <button aria-label="공유" onClick={share}><Share2 size={28} />공유</button>
      </div>

      <div className="pd-bottom">
        <div className="author">
          <Author name={p.authorName} photo={p.authorPhoto} size="lg" />
          <span>{p.authorName}{p.authorPetName ? <span style={{ fontWeight: 500, opacity: .8 }}> · {p.authorPetName}</span> : null}</span>
          {!mine && <button className="follow-pill" onClick={() => toast('팔로우는 서버 연동 후 사용할 수 있어요.')}>팔로우</button>}
          {p.isExample && <span className="badge sample">예시</span>}
        </div>
        <div className="ttl"><span className="grow">{p.title}</span>
          <button className="dk-btn" style={{ height: 30, minWidth: 30 }} aria-label={p.saved ? '저장 취소' : '저장'} aria-pressed={p.saved} onClick={() => run(() => toggleSave(p))}><Bookmark size={24} fill={p.saved ? '#fff' : 'none'} /></button>
        </div>
        {p.body && <p className={`body ${expanded ? '' : 'clamp'}`} onClick={() => setExpanded((v) => !v)}>{p.body}</p>}
        {p.hashtags.length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{p.hashtags.map((t) => <span key={t} className="tag-chip">#{t}</span>)}</div>}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{relativeTime(p.createdAt)}{mine ? ` · ${p.sync === 'local-only' ? '이 기기에만 저장' : '게시됨'} · ${VISIBILITY_LABEL[p.visibility]}` : ''}{p.media[idx]?.memo ? ` · 사진 메모: ${p.media[idx].memo}` : ''}</span>
        {p.place && p.locationConsent && (
          <button className="place-pill" onClick={() => navigate(`/community/post/${p.id}/place`)} aria-label={`${p.place.name} 장소 정보`}>
            <span className="ic"><MapPin size={18} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontWeight: 600 }} className="ellipsis">{p.place.name}</b>
              <span style={{ fontSize: 12.5, opacity: .8 }}>{p.place.petStatus === 'ok' ? '반려견 동반 가능' : '반려견 동반 확인 필요'}{p.place.category ? ` · ${CATEGORY_LABEL[p.place.category]}` : ''}{p.place.address ? ` · ${p.place.address}` : ''}</span>
            </span>
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <Sheet open={commentsOpen} onClose={() => setCommentsOpen(false)} labelledBy="cm-title">
        <h2 id="cm-title" className="h-md">댓글 {p.commentCount}</h2>
        <div style={{ display: 'grid', gap: 14, marginTop: 14, maxHeight: '45dvh', overflowY: 'auto' }}>
          {comments.length === 0 ? <p className="t-sub">첫 댓글을 남겨 보세요.</p> : comments.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <Author name={c.authorName} photo={null} />
              <div className="grow"><p style={{ fontSize: 13, fontWeight: 600 }}>{c.authorName} <span className="t-cap" style={{ fontWeight: 400 }}>{relativeTime(c.createdAt)}{c.isExample ? ' · 예시' : c.authorId === ME ? ' · 이 기기에만 저장' : ''}</span></p><p className="t-body" style={{ fontSize: 14 }}>{c.body}</p></div>
            </div>
          ))}
        </div>
        <div className="row mt-16" style={{ gap: 8 }}>
          <input className="input" placeholder="댓글을 입력하세요" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} aria-label="댓글 입력" />
          <button className="btn primary" style={{ flex: 'none' }} aria-label="댓글 등록" onClick={send}><Send size={18} /></button>
        </div>
        <p className="t-cap mt-8">서버 연동 전에는 댓글이 이 기기에만 저장돼요.</p>
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)} labelledBy="more-title">
        <h2 id="more-title" className="h-md">게시물 메뉴</h2>
        <div className="list-card mt-12">
          {mine ? (
            <>
              <div className="row-btn" style={{ cursor: 'default' }}><Lock size={18} /><span className="grow">공개 범위: {VISIBILITY_LABEL[p.visibility]}</span></div>
              <button className="row-btn" style={{ color: 'var(--error)' }} onClick={() => { setMore(false); setConfirmDel(true); }}><Trash2 size={18} />게시물 삭제</button>
            </>
          ) : (
            <>
              <button className="row-btn" onClick={() => { setMore(false); setReportOpen(true); }}><Flag size={18} />게시물 신고</button>
              <button className="row-btn" onClick={async () => { try { await blockAuthor(p); toast(`${p.authorName} 님을 차단했어요. 이 사용자의 게시물이 보이지 않아요.`); navigate('/community', { replace: true }); } catch (e) { toast((e as Error).message, 'error'); } }}><ShieldOff size={18} />작성자 차단</button>
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} labelledBy="rp-title">
        <h2 id="rp-title" className="h-md">신고 사유를 골라 주세요</h2>
        <div className="list-card mt-12">
          {(Object.keys(REPORT_LABEL) as ReportReason[]).map((r) => (
            <button key={r} className="row-btn" onClick={async () => { try { await reportPost(p, r); setReportOpen(false); toast('신고를 접수했어요. (서버 연동 전이라 이 기기에 기록만 돼요)'); } catch (e) { toast((e as Error).message, 'error'); } }}>{REPORT_LABEL[r]}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} center labelledBy="del-title">
        <h2 id="del-title" className="h-md">이 게시물을 삭제할까요?</h2>
        <p className="t-sub mt-8">사진·댓글이 함께 삭제되고 되돌릴 수 없어요. 원래 여행 기록과 사진은 그대로 남아요.</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setConfirmDel(false)}>취소</button>
          <button className="btn danger" onClick={async () => { try { await repo.deletePost(p.id); toast('게시물을 삭제했어요.'); navigate('/community', { replace: true }); } catch (e) { toast((e as Error).message, 'error'); } }}>삭제</button>
        </div>
      </Sheet>
    </div>
  );
}
