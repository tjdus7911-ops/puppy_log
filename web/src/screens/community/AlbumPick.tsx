// 화면 4. 앨범 선택(다크): 전체/사진/동영상 · 최대 10개 · 선택 순서 번호 · 다음
// 웹에서는 기기 사진 목록을 직접 읽을 수 없어 '기기에서 가져오기'(파일 선택)와 '내 여행 사진'을 보여줍니다.
// Android 앱에서는 MediaStore + 사진 접근 권한(READ_MEDIA_IMAGES/VIDEO)으로 같은 화면을 채웁니다.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ImagePlus, ImageOff, X } from 'lucide-react';
import { navigate, queryParam, useRoute } from '../../app/router';
import { useStore } from '../../app/store';
import { Draft, startDraftFromTrip, useDraft } from '../../app/community';
import { fileToMedia, photoToMedia, pickMediaFiles } from '../../app/media';
import { repo } from '../../data/db';
import { MAX_MEDIA, type PostMedia } from '../../domain/community';
import { TripController } from '../../trip/TripController';
import { drivingLocked } from '../../trip/driveLock';
import { Sheet } from '../../ui/components';
import { DriveLock, MediaView } from './parts';

type F = 'all' | 'image' | 'video';
const keyOf = (m: PostMedia) => m.fromTripPhotoId ? `tp:${m.fromTripPhotoId}` : m.id;

export default function AlbumPick() {
  const route = useRoute();
  const tripParam = queryParam(route, 'trip');
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { toast } = useStore();
  const d = useDraft();
  const [filter, setFilter] = useState<F>('all');
  const [tripMedia, setTripMedia] = useState<PostMedia[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // 여행 기록에서 '커뮤니티에 공유'로 들어오면 그 여행의 사진·제목·장소를 불러옴
  useEffect(() => {
    if (tripParam && Draft.get().tripId !== tripParam) startDraftFromTrip(tripParam).catch((e) => toast((e as Error).message, 'error'));
  }, [tripParam, toast]);
  // 내 여행 사진(완료·진행 중 모든 여행)
  useEffect(() => {
    (async () => {
      const trips = await repo.listTrips();
      const list: PostMedia[] = [];
      for (const t of trips) for (const p of await repo.photosOf(t.id)) list.push(photoToMedia(p));
      setTripMedia(list);
    })().catch(() => setTripMedia([]));
  }, []);

  const selected = d.media;
  const selKeys = useMemo(() => selected.map(keyOf), [selected]);
  const tripSrc = useMemo(() => {
    // 여행에서 불러온 사진이 목록에 없을 수도 있으므로(삭제 등) 선택된 항목도 합침
    const base = tripMedia ?? [];
    const have = new Set(base.map(keyOf));
    return [...selected.filter((m) => m.fromTripPhotoId && !have.has(keyOf(m))), ...base];
  }, [tripMedia, selected]);
  const pool = d.pool;
  const shown = (l: PostMedia[]) => l.filter((m) => filter === 'all' || m.kind === filter);

  if (drivingLocked(live)) return <DriveLock title="게시물 작성" />;

  const toggle = (m: PostMedia) => {
    const k = keyOf(m);
    if (selKeys.includes(k)) { Draft.set((s) => ({ media: s.media.filter((x) => keyOf(x) !== k), current: 0 })); return; }
    if (selected.length >= MAX_MEDIA) { toast(`최대 ${MAX_MEDIA}개까지 선택할 수 있어요.`, 'error'); return; }
    Draft.set((s) => ({ media: [...s.media, m] }));
  };

  const importFiles = async () => {
    const files = await pickMediaFiles();
    if (files === 'unsupported') { setUnsupported(true); return; }
    if (!files) return;
    setBusy(true);
    const added: PostMedia[] = [];
    for (const f of files.slice(0, 30)) {
      try { added.push(await fileToMedia(f)); } catch (e) { toast((e as Error).message, 'error'); }
    }
    setBusy(false);
    if (!added.length) return;
    const room = MAX_MEDIA - Draft.get().media.length;
    Draft.set((s) => ({ pool: [...added, ...s.pool], media: [...s.media, ...added.slice(0, Math.max(0, room))] }));
    if (added.length > room) toast(`최대 ${MAX_MEDIA}개까지만 선택했어요. 나머지는 목록에 남겨 둘게요.`);
  };

  const cell = (m: PostMedia) => {
    const n = selKeys.indexOf(keyOf(m));
    return (
      <button key={keyOf(m)} className={`ab-item ${n >= 0 ? 'sel' : ''}`} onClick={() => toggle(m)} aria-pressed={n >= 0} aria-label={`${m.kind === 'video' ? '동영상' : '사진'}${n >= 0 ? ` ${n + 1}번째 선택됨` : ''}`}>
        <MediaView m={m} showDuration />
        <span className="ab-num">{n >= 0 ? n + 1 : ''}</span>
      </button>
    );
  };
  const nothing = tripMedia !== null && tripSrc.length === 0 && pool.length === 0;

  return (
    <div className="cm-dark">
      <div className="bar">
        <button className="dk-btn" aria-label="닫기" onClick={() => navigate('/community')}><X size={24} /></button>
        <span className="ttl">앨범에서 선택</span>
        <button className="dk-btn" onClick={() => { Draft.reset(); navigate('/community', { replace: true }); }}>취소</button>
      </div>
      <div className="dk-seg" role="radiogroup" aria-label="미디어 종류">
        {([['all', '전체'], ['image', '사진'], ['video', '동영상']] as [F, string][]).map(([k, l]) => <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {d.tripId && <p className="ab-sec" style={{ color: '#8daef5' }}>여행 기록에서 사진 {selected.filter((m) => m.fromTripPhotoId).length}장을 불러왔어요. 빼거나 더할 수 있어요.</p>}

      {nothing ? (
        <div className="ab-empty">
          <ImageOff size={44} />
          <b style={{ color: '#fff', fontSize: 17 }}>불러올 사진이 없어요</b>
          <span style={{ fontSize: 14, lineHeight: 1.6 }}>기기에서 사진·동영상을 가져오거나 여행 중에 사진을 남겨 주세요.<br />앱에서는 사진 접근 권한을 허용해야 앨범이 보여요.</span>
          <button className="btn primary" onClick={importFiles} disabled={busy}><ImagePlus size={18} />{busy ? '불러오는 중…' : '기기에서 가져오기'}</button>
        </div>
      ) : (
        <>
          <div className="ab-grid">
            <button className="ab-item ab-add" onClick={importFiles} disabled={busy} aria-label="기기에서 사진·동영상 가져오기"><ImagePlus size={26} />{busy ? '불러오는 중…' : '기기에서 가져오기'}</button>
            {shown(pool).map(cell)}
            {shown(tripSrc).map(cell)}
          </div>
          {tripSrc.length > 0 && filter === 'video' && shown(tripSrc).length === 0 && shown(pool).length === 0 && <p className="ab-sec" style={{ textAlign: 'center' }}>동영상이 없어요. 기기에서 가져올 수 있어요.</p>}
        </>
      )}

      <div className="ab-foot">
        <span className="grow" style={{ fontSize: 14, color: '#c8d3e6' }}><b style={{ color: '#fff' }}>{selected.length}개</b> 선택됨 (최대 {MAX_MEDIA}개)</span>
        <button className="btn primary" disabled={selected.length === 0} onClick={() => navigate('/community/new/edit')}>다음</button>
      </div>

      <Sheet open={unsupported} onClose={() => setUnsupported(false)} labelledBy="perm-t">
        <h2 id="perm-t" className="h-md">사진에 접근할 수 없어요</h2>
        <p className="t-sub mt-8">이 환경에서는 기기 사진을 불러올 수 없어요. 브라우저나 앱 설정에서 사진·카메라 접근을 허용한 뒤 다시 시도해 주세요.</p>
        <button className="btn primary block mt-16" onClick={() => setUnsupported(false)}>확인</button>
      </Sheet>
    </div>
  );
}
