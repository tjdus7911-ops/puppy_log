import { drivingLocked } from '../trip/driveLock';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Car, Check, ChevronLeft, ChevronRight, Coffee, Download, Flag, FlaskConical, House, ImagePlus, Lock, MapPin, MessageSquare, Navigation, Pencil, Route, Share2, Sparkles, Star, Trash2, Undo2, Users, X } from 'lucide-react';
import { useStore } from '../app/store';
import { back, navigate, queryParam } from '../app/router';
import { addPhotosToTrip } from '../app/photos';
import { buildDiaryInput } from '../diary/buildInput';
import { renderShareCard } from '../app/shareCard';
import { repo } from '../data/db';
import { CATEGORY_LABEL, LEG_LABEL, PHASE_LABEL, SOURCE_LABEL, type DriveLeg, type RestSession, type Trip, type TripLocation, type TripPhoto, type VisitedPlace } from '../domain/models';
import { formatDuration, formatKm, formatKoreanDate, formatShortDate, formatTime } from '../domain/format';
import { regionLabel, regionShort } from '../domain/regions';
import { petNames as joinPetNames } from '../domain/tripText';
import { generateDiary } from '../diary/diaryGenerator';
import { TripController } from '../trip/TripController';
import { ErrorState, Hint, Loading, Sheet, TopBar } from '../ui/components';
import { PlaceThumb } from '../ui/Art';
import { PhotoFallback, SectionHeader, Stat, Timeline, type TimelineItem } from '../ui/kit';
import { MapView, type MapMarker } from '../ui/MapView';

const formatKmPlain = (km: number) => (km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(/\.0$/, ''));
const regionLabelOr = (p: { latitude: number; longitude: number } | null | undefined, fb: string) => (p ? regionLabel(p) : fb);

interface Data {
  trip: Trip;
  locs: TripLocation[];
  rests: RestSession[];
  places: VisitedPlace[];
  photos: TripPhoto[];
  legs: DriveLeg[];
}

export default function TripDetail({ id, route, onChanged }: { id: string; route: string; onChanged: () => Promise<void> }) {
  const { petsOfTrip, settings, toast } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [diaryDraft, setDiaryDraft] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [share, setShare] = useState<{ url: string; blob: Blob } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manualKm, setManualKm] = useState('');
  const [photoMemo, setPhotoMemo] = useState<{ photo: TripPhoto; text: string } | null>(null);
  const [heroI, setHeroI] = useState(0);
  const isNew = queryParam(route, 'new') === '1';
  const driving = drivingLocked(live);

  const load = useCallback(async () => {
    try {
      const trip = await repo.getTrip(id);
      if (!trip) { setError('여행 기록을 찾을 수 없어요.'); return; }
      const [locs, rests, places, photos, legs] = await Promise.all([repo.locationsOf(id), repo.restsOf(id), repo.placesOf(id), repo.photosOf(id), repo.legsOf(id)]);
      setData({ trip, locs, rests, places, photos, legs });
      setMemo(trip.memo);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  const wantShare = queryParam(route, 'share') === '1';
  const sharedOnce = useRef(false);
  useEffect(() => {
    if (wantShare && data && !sharedOnce.current) { sharedOnce.current = true; void makeShareRef.current?.(); }
  }, [wantShare, data]);
  const makeShareRef = useRef<(() => Promise<void>) | null>(null);

  if (error) return <div className="screen no-nav"><TopBar title="여행 상세" /><ErrorState desc={error} onRetry={load} extra={<button className="btn ghost sm" onClick={() => navigate('/album', { replace: true })}>앨범으로</button>} /></div>;
  if (!data) return <div className="screen no-nav"><TopBar title="여행 상세" /><Loading /></div>;

  const { trip, locs, rests, places, photos, legs } = data;
  const inProgress = trip.phase !== 'completed';
  const isLiveTrip = live.trip?.id === trip.id;
  const pets = petsOfTrip(trip.id);
  const names = pets.map((p) => p.name);
  const restTotal = rests.reduce((a, r) => a + (r.endTime ? (r.endTime - r.startTime) / 1000 : 0), 0);
  const route2 = locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));

  const save = async (patch: Partial<Trip>) => {
    const next = { ...trip, ...patch };
    try {
      await repo.saveTrip(next);
      setData({ ...data, trip: next });
      if (isLiveTrip) await TripController.refreshTrip(); // 진행 중 여행이면 컨트롤러 사본도 맞춤(덮어쓰기 방지)
      await onChanged();
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  };

  const genDiary = async () => {
    setGenBusy(true);
    const r = await generateDiary(await buildDiaryInput({ ...trip, memo }, names), settings.apiBaseUrl).catch(() => null);
    setGenBusy(false);
    if (!r) return;
    if (await save({ diaryText: r.text, diarySource: r.source, memo })) {
      setDiaryDraft(null);
      toast(r.source === 'ai' ? 'AI 여행 일기를 만들었어요.' : r.fallbackReason ? `${r.fallbackReason} · 기본 일기로 만들었어요.` : '기록을 바탕으로 기본 여행 일기를 만들었어요.');
    }
  };

  const addPhotos = async () => {
    const added = await addPhotosToTrip(trip.id, (m) => toast(m, 'error'));
    if (!added || added.length === 0) return;
    const list = [...photos, ...added];
    setData({ ...data, photos: list });
    if (!trip.coverPhotoUri) await save({ coverPhotoUri: list[0].photoUri });
    toast(`사진 ${added.length}장을 추가했어요. 기존 기록은 그대로예요.`);
  };

  const movePhoto = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[idx], next[j]] = [next[j], next[idx]];
    setData({ ...data, photos: next.map((p, i) => ({ ...p, order: i })) });
    try { await repo.reorderPhotos(trip.id, next.map((p) => p.id)); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const makeShare = async () => {
    try {
      const blob = await renderShareCard({
        title: trip.title,
        petPhoto: pets[0]?.photoUri ?? null,
        coverPhoto: trip.coverPhotoUri,
        regions: `${regionShort(trip.startLocation)} → ${regionShort(trip.endLocation)}`,
        distance: formatKm(trip.totalDistanceKm),
        date: formatKoreanDate(trip.startTime),
        petNames: joinPetNames(names.length ? names : ['우리 강아지']),
        isDemo: trip.isDemo,
      });
      setShare({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  makeShareRef.current = makeShare;

  const doShare = async () => {
    if (!share) return;
    const file = new File([share.blob], 'mungroad.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: trip.title });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = share.url;
    a.download = `mungroad-${formatShortDate(trip.startTime)}.png`;
    a.click();
  };

  const markers: MapMarker[] = [];
  if (route2.length) {
    markers.push({ id: 's', point: route2[0], kind: 'start', label: '출발' });
    markers.push({ id: 'e', point: route2[route2.length - 1], kind: 'end', label: '도착' });
  }
  rests.forEach((r) => r.latitude != null && r.longitude != null && markers.push({ id: r.id, point: { latitude: r.latitude, longitude: r.longitude }, kind: 'rest' }));
  places.forEach((p) => markers.push({ id: p.id, point: p, kind: 'place', label: p.placeName }));

  const doneRests = rests.filter((r) => r.endTime);
  const gallery = photos.length ? photos.map((p) => p.photoUri) : trip.coverPhotoUri ? [trip.coverPhotoUri] : [];
  const heroIdx = Math.min(heroI, Math.max(0, gallery.length - 1));
  // 경로·방문 타임라인: 주행 구간 · 휴식 · 방문 장소를 시간순으로
  type Ev = TimelineItem & { at: number };
  const evs: Ev[] = [];
  legs.forEach((l) => {
    const startTitle = l.kind === 'outbound' ? `${regionLabelOr(l.startLocation ?? trip.startLocation, '출발지')} 출발` : l.kind === 'return' ? '돌아오는 길 시작' : '여행지 내 이동 시작';
    evs.push({ id: `${l.id}-s`, at: l.startTime, icon: l.kind === 'return' ? <Undo2 /> : <Navigation />, title: startTitle, time: formatTime(l.startTime) });
    evs.push({ id: `${l.id}-l`, at: l.startTime + 1, kind: 'leg', icon: <Car />, title: `${LEG_LABEL[l.kind]} · ${formatKm(l.distanceKm)} · 주행 ${formatDuration(l.drivingDurationSeconds)}` });
    if (l.endTime) evs.push({ id: `${l.id}-e`, at: l.endTime, icon: l.kind === 'return' ? <House /> : <Flag />, title: l.kind === 'outbound' ? `${trip.destinationName ?? regionLabelOr(l.endLocation, '목적지')} 도착` : l.kind === 'return' ? '집 도착 · 여행 완료' : '다음 장소 도착', time: formatTime(l.endTime) });
  });
  rests.forEach((r) => evs.push({ id: r.id, at: r.startTime, kind: 'rest', icon: <Coffee />, title: r.latitude != null && r.longitude != null ? `${regionLabel({ latitude: r.latitude, longitude: r.longitude })} 휴식` : '휴식', time: formatTime(r.startTime), sub: r.endTime ? `휴식 ${formatDuration((r.endTime - r.startTime) / 1000)}` : '휴식 중' }));
  places.forEach((pl) => evs.push({ id: pl.id, at: pl.visitedAt, icon: <MapPin />, title: pl.placeName, time: formatTime(pl.visitedAt), sub: [pl.memo ? `“${pl.memo}”` : CATEGORY_LABEL[pl.category], pl.isSample ? '샘플' : null].filter(Boolean).join(' · ') }));
  evs.sort((x, y) => x.at - y.at);

  return (
    <div className="screen no-nav">
      <section className="photo-hero light" style={{ height: 380 }} aria-label="여행 사진">
        {gallery.length ? <img src={gallery[heroIdx]} alt="여행 대표 사진" /> : <PhotoFallback size={72} />}
        <div className="top">
          <button className="glass-btn" aria-label="뒤로" onClick={() => (isNew ? navigate('/album', { replace: true }) : back())}><ChevronLeft size={22} /></button>
          <button className="glass-btn" aria-label="공유 이미지 만들기" onClick={makeShare}><Share2 size={18} /></button>
        </div>
        {gallery.length > 1 && (
          <div className="row between" style={{ position: 'absolute', left: 20, right: 20, bottom: 20, zIndex: 2 }}>
            <span className="dots">{gallery.slice(0, 8).map((_, i) => <i key={i} className={i === heroIdx ? 'on' : ''} onClick={() => setHeroI(i)} />)}</span>
            <span className="count-pill num">{heroIdx + 1} / {gallery.length}</span>
          </div>
        )}
      </section>

      <div className="stack" style={{ marginTop: 24 }}>
        {(isNew || inProgress) && (
          <div className={`hint ${isNew ? 'green' : ''}`}>
            {isNew ? <Check size={16} /> : <Route size={16} />}
            <div className="grow">{isNew ? '여행을 완료했어요! 사진과 메모는 언제든 더 추가할 수 있고, 여행 일기도 다시 만들 수 있어요.' : <>진행 중인 여행이에요 · <b>{PHASE_LABEL[trip.phase]}</b>
              {isLiveTrip && <button className="link" style={{ marginLeft: 8, color: 'var(--primary)' }} onClick={() => navigate(live.driving ? '/trip/live' : '/home')}>{live.driving ? '주행 화면으로' : '여행지 활동으로'} <ChevronRight size={14} /></button>}</>}
            </div>
          </div>
        )}

        <section style={{ display: 'grid', gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">{inProgress ? '진행 중' : '여행 완료'}</span>
            {doneRests.length > 0 && <span className="badge rest">휴식 {doneRests.length}회</span>}
            {trip.isDemo && <span className="badge sample"><FlaskConical size={12} />데모 기록 · 통계 제외</span>}
          </div>
          {editingTitle ? (
            <div className="row" style={{ gap: 6 }}>
              <input className="input" autoFocus maxLength={40} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} aria-label="여행 제목" />
              <button className="icon-btn" aria-label="취소" onClick={() => setEditingTitle(false)}><X size={20} /></button>
              <button className="icon-btn" aria-label="제목 저장" style={{ background: 'var(--primary)', color: '#fff' }} onClick={async () => {
                const t = titleDraft.trim();
                if (!t) { toast('제목을 입력해 주세요.', 'error'); return; }
                if (await save({ title: t, titleEdited: true })) setEditingTitle(false);
              }}><Check size={20} /></button>
            </div>
          ) : (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <h1 className="h-lg grow" style={{ fontSize: 22 }}>{trip.title}</h1>
              <button className="icon-btn" style={{ width: 36, height: 36, color: 'var(--text-3)' }} aria-label="제목 수정" onClick={() => { setTitleDraft(trip.title); setEditingTitle(true); }}><Pencil size={18} /></button>
            </div>
          )}
          <p className="t-cap num">{formatKoreanDate(trip.startTime)} {formatTime(trip.startTime)} – {trip.endTime && !inProgress ? formatTime(trip.endTime) : '진행 중'} · {regionShort(trip.startLocation)} ↔ {trip.endLocation ? regionShort(trip.endLocation) : trip.destinationName ?? '알 수 없는 지역'}</p>
          <p className="t-cap">함께한 친구: {names.join(', ') || '정보 없음'} · 기록 방식: {SOURCE_LABEL[trip.source]}</p>
        </section>

        <section className="card stat-grid" aria-label="여행 통계">
          <Stat value={formatKmPlain(trip.totalDistanceKm)} unit="km" label="총 이동 거리" />
          <Stat value={formatDuration(trip.drivingDurationSeconds)} label={`주행 시간 · 전체 ${formatDuration(trip.elapsedDurationSeconds)}`} />
          <Stat value={String(doneRests.length)} unit="회" label={`휴식 · 총 ${formatDuration(restTotal)}`} />
          <Stat value={String(photos.length)} unit="장" label={`사진 · 장소 ${places.length}곳`} />
        </section>

        <section aria-label="앨범">
          <SectionHeader title={`앨범 · ${photos.length}장`} action="정리하기" onAction={() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth' })} />
          {photos.length === 0 ? (
            <button className="card" style={{ width: '100%', textAlign: 'center', cursor: 'pointer', font: 'inherit' }} disabled={driving} onClick={addPhotos}><ImagePlus size={22} color="var(--primary)" /><p className="t-sub mt-8">사진을 추가하면 앨범이 만들어져요</p></button>
          ) : (
            <>
              <div className="album-grid">
                <img className="big" src={photos[0].photoUri} alt={photos[0].memo || '여행 사진 1'} />
                <div className="col">{photos.slice(1, 3).map((p, i) => <img key={p.id} src={p.photoUri} alt={p.memo || `여행 사진 ${i + 2}`} />)}</div>
              </div>
              {photos.length > 3 && (
                <div className="album-row">
                  {photos.slice(3, 6).map((p, i) => (
                    <div key={p.id}><img src={p.photoUri} alt={p.memo || `여행 사진 ${i + 4}`} />{i === 2 && photos.length > 6 && <span className="more">+{photos.length - 6}</span>}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section aria-label="이동 경로와 방문 장소">
          <SectionHeader title="이동 경로 · 방문 장소" />
          {route2.length > 1 ? (
            <MapView route={route2} markers={markers} height={180} ariaLabel="이동 경로 지도" note="공유 카드에는 경로가 표시되지 않아요" />
          ) : (
            <div className="muted-box t-sub">{trip.source === 'manual' ? '수동 기록 모드라 이동 경로가 없어요.' : '저장된 이동 경로가 없어요.'}</div>
          )}
          {evs.length > 0 && <div className="card mt-12"><Timeline items={evs} /></div>}
        </section>

        <button className="diary-preview" onClick={() => navigate(`/album/${trip.id}/diary`)} aria-label="AI 일기 화면 열기">
          <span className="row" style={{ gap: 8 }}><Sparkles size={20} color="var(--primary)" /><b className="grow" style={{ fontWeight: 600, fontSize: 16 }}>AI 여행 일기</b>{trip.diarySource !== 'none' && <span className="badge photo">{trip.diarySource === 'ai' ? 'AI 생성' : trip.diarySource === 'template' ? '초안' : '직접 작성'}</span>}</span>
          <span className="t-body" style={{ color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{trip.diaryText || '이동 기록·방문 장소·사진·메모를 바탕으로 여행 일기를 만들어 드려요.'}</span>
          <span className="row" style={{ gap: 2, color: 'var(--primary)', fontWeight: 600 }}>{trip.diaryText ? '일기 전체 보기' : '일기 만들기'}<ChevronRight size={18} /></span>
        </button>

        <div style={{ display: 'grid', gap: 8, textAlign: 'center' }}>
          <button className="btn primary block xl" disabled={driving || inProgress} onClick={() => navigate(`/community/new?trip=${trip.id}`)}><Users size={18} />커뮤니티에 공유하기</button>
          <button className="btn secondary block" onClick={makeShare}>SNS 공유 카드 만들기</button>
          <span className="t-cap" style={{ fontSize: 12 }}>{inProgress ? '여행을 완료하면 커뮤니티에 공유할 수 있어요 · ' : ''}커뮤니티 게시물과 공유 카드에는 집 주소·GPS 이동 경로가 포함되지 않아요</span>
        </div>
        {driving && <p className="lock-note"><Lock size={15} />주행 중에는 상세 편집이 잠겨요. 정차 후 이용해 주세요.</p>}
      </div>

      <h2 className="h-md" style={{ marginTop: 48, paddingTop: 24, borderTop: '8px solid var(--line)', marginLeft: -24, marginRight: -24, paddingLeft: 24 }}>기록 관리</h2>
      <section className="section">
        <h2 className="h-md row" style={{ gap: 6 }}><Car size={18} color="var(--primary)" />주행 기록</h2>
        {legs.length === 0 ? <p className="t-sub mt-8">저장된 주행 구간이 없어요.</p> : (
          <div className="card mt-12" style={{ padding: '4px 18px' }}>
            {legs.map((l) => (
              <div key={l.id} className="row-item">
                <span className="badge" style={{ background: l.kind === 'return' ? 'var(--mint)' : 'var(--primary-soft)', color: l.kind === 'return' ? 'var(--mint-text)' : 'var(--primary)' }}>{LEG_LABEL[l.kind]}</span>
                <div className="grow">
                  <p style={{ fontWeight: 650 }}>{formatKm(l.distanceKm)} · 주행 {formatDuration(l.drivingDurationSeconds)}{l.restCount ? ` · 휴식 ${l.restCount}회` : ''}</p>
                  <p className="t-cap">{formatTime(l.startTime)} ~ {l.endTime ? formatTime(l.endTime) : '기록 중'} · {regionShort(l.startLocation)} → {regionShort(l.endLocation)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {trip.source === 'manual' && (
        <div className="card mt-12">
          <p style={{ fontWeight: 700 }}>이동 거리 직접 입력</p>
          <div className="row mt-8">
            <input className="input" type="number" inputMode="decimal" min={0} max={2000} placeholder={`${trip.totalDistanceKm}`} value={manualKm} onChange={(e) => setManualKm(e.target.value)} aria-label="이동 거리(km)" />
            <button className="btn secondary" onClick={async () => {
              const v = Number(manualKm);
              if (!Number.isFinite(v) || v < 0 || v > 2000) { toast('0~2000km 사이로 입력해 주세요.', 'error'); return; }
              if (await save({ totalDistanceKm: v })) { setManualKm(''); toast('이동 거리를 저장했어요.'); }
            }}>저장</button>
          </div>
        </div>
      )}

      <section className="section">
        <h2 className="h-md">휴식 기록</h2>
        {rests.length === 0 ? <p className="t-sub mt-8">이번 여행에서는 휴식을 기록하지 않았어요.</p> : (
          <div className="card mt-12" style={{ padding: '4px 18px' }}>
            {rests.map((r, i) => (
              <div key={r.id} className="row-item">
                <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--accent-soft)', color: '#B5730D', display: 'grid', placeItems: 'center' }}><Coffee size={18} /></div>
                <div className="grow">
                  <p style={{ fontWeight: 650 }}>{i + 1}번째 휴식 · {r.endTime ? formatDuration((r.endTime - r.startTime) / 1000) : '진행 중'}</p>
                  <p className="t-cap">{formatTime(r.startTime)} ~ {r.endTime ? formatTime(r.endTime) : ''} · {r.latitude != null && r.longitude != null ? regionLabel({ latitude: r.latitude, longitude: r.longitude }) : '위치 정보 없음'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h-md">방문 장소</h2>
        {places.length === 0 ? <p className="t-sub mt-8">기록된 방문 장소가 없어요. 여행 중 정차했을 때 ‘들렀어요’로 남길 수 있어요.</p> : (
          <div className="card mt-12" style={{ padding: '4px 18px' }}>
            {places.map((p) => (
              <div key={p.id} className="row-item">
                <PlaceThumb category={p.category} size={40} radius={12} />
                <div className="grow">
                  <p style={{ fontWeight: 650 }} className="ellipsis">{p.placeName} {p.isSample && <span className="badge sample">샘플</span>}</p>
                  <p className="t-cap">{CATEGORY_LABEL[p.category]} · {formatTime(p.visitedAt)}{p.source === 'user' ? ' · 직접 기록' : ''}</p>
                  {p.memo && <p className="t-sub" style={{ fontSize: 13 }}>“{p.memo}”</p>}
                </div>
                <button className="icon-btn" aria-label={`${p.placeName} 삭제`} onClick={async () => {
                  try { await repo.deleteVisitedPlace(p.id); setData({ ...data, places: places.filter((x) => x.id !== p.id) }); } catch (e) { toast((e as Error).message, 'error'); }
                }}><X size={18} /></button>
              </div>
            ))}
          </div>
        )}
        {places.some((p) => p.isSample) && <p className="t-cap mt-8">샘플 장소는 여행 일기에 넣지 않아요.</p>}
      </section>

      <section className="section">
        <div className="section-head" id="photos"><h2 className="h-md">사진 정리</h2><span className="t-cap">{photos.length}장</span></div>
        <p className="t-cap" style={{ marginBottom: 8 }}>★ 대표 사진 · ◀ ▶ 순서 바꾸기 · 💬 사진 메모 — 여행을 마친 뒤에도 추가·삭제할 수 있어요.</p>
        <div className="photo-grid">
          {photos.map((p, i) => (
            <div key={p.id} className="photo-cell">
              <img src={p.photoUri} alt={p.memo || `여행 사진 ${i + 1}`} />
              {trip.coverPhotoUri === p.photoUri && <span className="badge" style={{ position: 'absolute', left: 4, top: 4, height: 20, background: 'var(--accent)', color: '#3b2b10' }}>대표</span>}
              {p.memo && <span className="photo-memo">{p.memo}</span>}
              {!driving && (
                <div className="photo-tools">
                  <button aria-label="앞으로" disabled={i === 0} onClick={() => movePhoto(i, -1)}><ArrowLeft size={14} /></button>
                  <button aria-label="대표 사진으로 지정" onClick={() => save({ coverPhotoUri: p.photoUri })}><Star size={14} /></button>
                  <button aria-label="사진 메모" onClick={() => setPhotoMemo({ photo: p, text: p.memo })}><MessageSquare size={14} /></button>
                  <button aria-label="사진 삭제" onClick={async () => {
                    try {
                      await repo.deletePhoto(p.id);
                      const rest = photos.filter((x) => x.id !== p.id);
                      setData({ ...data, photos: rest });
                      if (trip.coverPhotoUri === p.photoUri) await save({ coverPhotoUri: rest[0]?.photoUri ?? null });
                    } catch (e) { toast((e as Error).message, 'error'); }
                  }}><Trash2 size={13} /></button>
                  <button aria-label="뒤로" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}><ArrowRight size={14} /></button>
                </div>
              )}
            </div>
          ))}
          <button className="photo-add" disabled={driving} onClick={addPhotos} aria-label="사진 추가"><span style={{ display: 'grid', placeItems: 'center', gap: 4 }}><ImagePlus size={22} />사진 추가</span></button>
        </div>
      </section>

      <section className="section">
        <h2 className="h-md">메모</h2>
        <textarea className="input mt-12" maxLength={500} placeholder="오늘 기억하고 싶은 순간을 적어 주세요" value={memo} disabled={driving} onChange={(e) => setMemo(e.target.value)} onBlur={() => memo !== trip.memo && save({ memo })} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h-md">여행 일기</h2>
          {trip.diarySource !== 'none' && <span className="badge gray">{trip.diarySource === 'ai' ? 'AI 생성' : trip.diarySource === 'template' ? '기본 템플릿' : '직접 작성'}</span>}
        </div>
        {driving ? (
          <p className="lock-note"><Lock size={15} />주행 중에는 일기를 편집할 수 없어요. 정차 후 이용해 주세요.</p>
        ) : diaryDraft != null ? (
          <>
            <textarea className="input" style={{ minHeight: 220 }} value={diaryDraft} onChange={(e) => setDiaryDraft(e.target.value)} aria-label="여행 일기" maxLength={2000} />
            <div className="btn-row mt-12">
              <button className="btn ghost" onClick={() => setDiaryDraft(null)}>취소</button>
              <button className="btn primary" onClick={async () => { if (await save({ diaryText: diaryDraft.trim(), diarySource: 'user' })) setDiaryDraft(null); }}>저장</button>
            </div>
          </>
        ) : trip.diaryText ? (
          <div className="card">
            <p className="t-body" style={{ whiteSpace: 'pre-line' }}>{trip.diaryText}</p>
            <div className="btn-row mt-16">
              <button className="btn ghost sm" onClick={() => setDiaryDraft(trip.diaryText)}><Pencil size={15} />수정</button>
              <button className="btn ghost sm" disabled={genBusy} onClick={genDiary}><Sparkles size={15} />{genBusy ? '만드는 중…' : '다시 만들기'}</button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="t-sub">이동 기록·방문 장소·사진·메모를 바탕으로 여행 일기를 만들어 드려요.</p>
            <button className="btn primary mt-16" disabled={genBusy} onClick={genDiary}><Sparkles size={18} />{genBusy ? '일기를 쓰는 중…' : '여행 일기 만들기'}</button>
            <p className="t-cap mt-12">{settings.apiBaseUrl ? 'AI 서버로 생성하고, 실패하면 기본 일기로 대신해요.' : 'AI 서버가 설정되지 않아 기록 기반 기본 일기로 만들어요.'}</p>
          </div>
        )}
        <div className="mt-12"><Hint>일기는 실제 기록만 사용해요. 기록에 없는 장소를 만들거나 반려견의 감정·건강을 단정하지 않아요.</Hint></div>
      </section>

      <div className="btn-row mt-24">
        <button className="btn secondary" onClick={makeShare}><Share2 size={18} />공유 이미지</button>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}><Trash2 size={18} />기록 삭제</button>
      </div>

      <Sheet open={!!photoMemo} onClose={() => setPhotoMemo(null)} labelledBy="pm-title">
        <h2 id="pm-title" className="h-md">사진 메모</h2>
        {photoMemo && <img src={photoMemo.photo.photoUri} alt="" className="mt-12" style={{ borderRadius: 14, maxHeight: 220, objectFit: 'cover', width: '100%' }} />}
        <textarea className="input mt-12" maxLength={200} placeholder="이 사진에 남기고 싶은 말 (일기에 그대로 인용돼요)" value={photoMemo?.text ?? ''} onChange={(e) => setPhotoMemo((m) => (m ? { ...m, text: e.target.value } : m))} aria-label="사진 메모" />
        <button className="btn primary block mt-12" onClick={async () => {
          if (!photoMemo) return;
          const next = { ...photoMemo.photo, memo: photoMemo.text.trim() };
          try {
            await repo.updatePhoto(next);
            setData({ ...data, photos: photos.map((x) => (x.id === next.id ? next : x)) });
            setPhotoMemo(null);
            toast('사진 메모를 저장했어요.');
          } catch (e) { toast((e as Error).message, 'error'); }
        }}>저장</button>
      </Sheet>

      <Sheet open={!!share} onClose={() => { if (share) URL.revokeObjectURL(share.url); setShare(null); }} labelledBy="share-title">
        <h2 id="share-title" className="h-lg">공유 이미지</h2>
        <p className="t-cap mt-8">정확한 주소와 상세 GPS 경로는 넣지 않았어요.</p>
        {share && <img src={share.url} alt="공유 이미지 미리보기" className="mt-16" style={{ borderRadius: 16, boxShadow: 'var(--shadow)' }} />}
        <button className="btn primary block mt-16" onClick={doShare}><Download size={18} />저장 / 공유하기</button>
        <p className="t-cap mt-8" style={{ textAlign: 'center' }}>저장이 되지 않는 환경(미리보기 페이지 등)에서는 이미지를 길게 누르거나 우클릭해 저장해 주세요.</p>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} center labelledBy="tdel">
        <h2 id="tdel" className="h-md">이 여행 기록을 삭제할까요?</h2>
        <p className="t-sub mt-8">경로·휴식·사진·일기가 모두 삭제되고 되돌릴 수 없어요.</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>취소</button>
          <button className="btn danger" onClick={async () => {
            try { await repo.deleteTrip(trip.id); await onChanged(); toast('여행 기록을 삭제했어요.'); navigate('/album', { replace: true }); } catch (e) { toast((e as Error).message, 'error'); }
          }}>삭제</button>
        </div>
      </Sheet>
    </div>
  );
}
