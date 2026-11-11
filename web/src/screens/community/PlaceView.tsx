// 화면 3. 여행지 연동: 게시글에 연결된 장소 · 동반 여부 · 확인된 정보 · 여행 기록 연결 · '이곳으로 여행하기'
import { useEffect, useState } from 'react';
import { Bookmark, Car, ChevronLeft, Clock3, Coffee, MapPin, Navigation, Users } from 'lucide-react';
import { back, navigate } from '../../app/router';
import { useStore } from '../../app/store';
import { getPostById, postsAtPlace, toggleSave, useCommunity } from '../../app/community';
import type { Post } from '../../domain/community';
import { CATEGORY_LABEL } from '../../domain/models';
import { formatDuration, formatKm } from '../../domain/format';
import { MapView } from '../../ui/MapView';
import { ErrorState, Loading } from '../../ui/components';
import { MediaView } from './parts';

export default function PlaceView({ id }: { id: string }) {
  const { toast } = useStore();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const { posts } = useCommunity();
  useEffect(() => { getPostById(id).then(setPost).catch(() => setPost(null)); }, [id]);

  if (post === undefined) return <div className="screen"><Loading /></div>;
  if (!post || !post.place) return <div className="screen"><ErrorState title="장소 정보가 없어요" desc="이 게시물에는 연결된 장소가 없어요." extra={<button className="btn ghost sm" onClick={() => back()}>돌아가기</button>} /></div>;

  const pl = post.place;
  const same = postsAtPlace(posts, pl.name);
  const photos = same.flatMap((p) => p.media.filter((m) => m.kind === 'image').map((m) => ({ m, postId: p.id }))).slice(0, 6);
  const sharers = new Set(same.map((p) => p.authorId)).size;
  const ts = post.tripSummary;
  const go = () => navigate(`/trip/setup?dest=${encodeURIComponent(pl.name)}&lat=${pl.latitude}&lng=${pl.longitude}&from=community`);

  return (
    <div className="screen no-nav" style={{ background: '#fff', paddingBottom: 0 }}>
      <div className="pv-photo">
        {post.media[0] ? <MediaView m={post.media[0]} /> : <MapView height={300} markers={[{ id: 'p', point: pl, kind: 'dest', label: pl.name }]} padKm={6} ariaLabel={`${pl.name} 위치`} />}
        <div className="top">
          <button className="glass-btn" aria-label="뒤로" onClick={() => back()}><ChevronLeft size={22} /></button>
          <button className="glass-btn" aria-label={post.saved ? '저장 취소' : '게시물 저장'} aria-pressed={post.saved} onClick={async () => { try { const n = await toggleSave(post); setPost(n); toast(n.saved ? '저장했어요.' : '저장을 취소했어요.'); } catch (e) { toast((e as Error).message, 'error'); } }}><Bookmark size={19} fill={post.saved ? 'currentColor' : 'none'} /></button>
        </div>
      </div>

      <div className="pv-card">
        <div style={{ display: 'grid', gap: 8 }}>
          <h1 className="h-xl">{pl.name}</h1>
          <p className="t-sub row" style={{ gap: 4 }}><MapPin size={15} />{pl.address ?? '주소 정보 없음'}</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge ${pl.petStatus === 'ok' ? 'rest' : 'est'}`} style={{ height: 28, padding: '0 10px' }}>{pl.petStatus === 'ok' ? '🐾 반려견 동반 가능' : '반려견 동반 확인 필요'}</span>
            {pl.category && <span className="badge" style={{ height: 28, padding: '0 10px' }}>{CATEGORY_LABEL[pl.category]}</span>}
          </div>
          {pl.petStatus === 'check' && <p className="t-cap">업체가 확인한 동반 정보가 없어요. 방문 전에 운영 여부와 동반 조건을 확인해 주세요.</p>}
        </div>

        {photos.length > 0 && (
          <div>
            <p className="t-cap" style={{ marginBottom: 8 }}>이 장소에 올라온 사진</p>
            <div className="pv-strip">{photos.slice(0, 3).map(({ m, postId }) => <button key={m.id} style={{ border: 0, padding: 0 }} onClick={() => navigate(`/community/post/${postId}`)} aria-label="게시물 보기"><MediaView m={m} /></button>)}</div>
          </div>
        )}

        <div className="info-rows">
          <div><span className="k"><Clock3 size={18} />이동 시간</span><span className="v num">{ts ? `${formatDuration(ts.drivingSec)}${ts.fromRegion ? ` (${ts.fromRegion} 기준)` : ''}` : '출발지에 따라 달라요'}</span></div>
          <div><span className="k"><Car size={18} />이동 거리</span><span className="v num">{ts ? formatKm(ts.distanceKm) : '—'}</span></div>
          {ts && <div><span className="k"><Coffee size={18} />작성자 휴식</span><span className="v">{ts.restCount}회</span></div>}
          <div><span className="k"><Users size={18} />멍로드 여행자</span><span className="v">{sharers}명이 공유했어요 <span className="t-cap" style={{ fontWeight: 400 }}>(이 기기 기준)</span></span></div>
        </div>
        {ts && <p className="t-cap" style={{ marginTop: -8 }}>작성자의 여행 기록 요약이에요. 이동 경로 전체와 출발 위치는 공개되지 않아요.</p>}

        <MapView height={150} markers={[{ id: 'p', point: pl, kind: 'dest', label: pl.name }]} padKm={8} ariaLabel={`${pl.name} 주변 지도`} />
      </div>

      <div className="bottom-cta">
        <button className="btn primary block xl" onClick={go}><Navigation size={18} />이곳으로 여행하기</button>
        <span className="t-cap" style={{ fontSize: 12 }}>여행 시작 화면에 목적지로 입력돼요 · 내비 연결은 차량 내비 지원 범위를 따라요</span>
      </div>
    </div>
  );
}
