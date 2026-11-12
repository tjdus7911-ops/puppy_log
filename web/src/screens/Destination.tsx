// 여행지 활동 홈 (phase 'at-destination'): 목적지 도착 후에도 여행은 계속됩니다.
// 사진 추가 · 방문 장소 기록 · 여행 메모 · 주변 장소 탐색 · 이동 기록 확인 · 복귀 이동 시작 · 여행 마무리
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Car, Camera, Compass, Flag, ImagePlus, MapPinned, NotebookPen, Pencil, Plus } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { addPhotosToTrip } from '../app/photos';
import { repo } from '../data/db';
import { CATEGORY_LABEL, PHASE_LABEL, type PlaceCategory, type TripPhoto, type VisitedPlace } from '../domain/models';
import { formatDuration, formatKm, formatTime } from '../domain/format';
import { regionLabel } from '../domain/regions';
import { useWide } from '../app/useWide';
import { openCarPreview } from '../CarPreview';
import { josa, petNames as joinNames } from '../domain/tripText';
import { TripController } from '../trip/TripController';
import { completeTripWithDraft } from '../trip/completeTrip';
import { Sheet } from '../ui/components';
import { CategoryIcon, PlaceThumb } from '../ui/Art';
import { PhotoFallback, PlaceRow, SectionHeader, Timeline, type TimelineItem } from '../ui/kit';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';

const CATS = Object.keys(CATEGORY_LABEL) as PlaceCategory[];

export default function Destination() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { settings, toast, reload } = useStore();
  const trip = live.trip;
  const wide = useWide();
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [places, setPlaces] = useState<VisitedPlace[]>([]);
  const [placeSheet, setPlaceSheet] = useState(false);
  const [placeForm, setPlaceForm] = useState<{ name: string; category: PlaceCategory; memo: string }>({ name: '', category: 'park', memo: '' });
  const [memoSheet, setMemoSheet] = useState(false);
  const [memo, setMemo] = useState(trip?.memo ?? '');
  const [finishSheet, setFinishSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<(Place & { distanceKm: number | null })[]>([]);
  const anchor = live.position ?? trip?.endLocation ?? null;
  const anchorKey = anchor ? `${anchor.latitude.toFixed(2)},${anchor.longitude.toFixed(2)}` : '';
  useEffect(() => {
    if (!anchor) return;
    const provider = getPlaceProvider(settings.apiBaseUrl);
    let off = false;
    Promise.all((['park', 'cafe'] as PlaceCategory[]).map((c) => provider.search({ category: c, centers: [anchor], radiusKm: 6 }).catch(() => [] as Place[])))
      .then((r) => { if (!off) setNearby(sortByDistance(r.flat(), anchor).slice(0, 2).map((x) => ({ ...x.place, distanceKm: x.distanceKm }))); });
    return () => { off = true; };
  }, [anchorKey, settings.apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const tripId = trip?.id;
  useEffect(() => {
    if (!tripId) return;
    void repo.photosOf(tripId).then(setPhotos).catch(() => {});
    void repo.placesOf(tripId).then(setPlaces).catch(() => {});
  }, [tripId]);

  if (!trip) return null;

  const addPhotos = async () => {
    const added = await addPhotosToTrip(trip.id, (m) => toast(m, 'error'));
    if (!added?.length) return;
    const list = [...photos, ...added];
    setPhotos(list);
    if (!trip.coverPhotoUri) {
      await repo.saveTrip({ ...trip, coverPhotoUri: list[0].photoUri });
      await TripController.refreshTrip();
    }
    toast(`사진 ${added.length}장을 이 여행에 추가했어요.`);
  };

  const savePlace = async () => {
    if (!placeForm.name.trim()) { toast('장소 이름을 입력해 주세요.', 'error'); return; }
    try {
      await TripController.recordPlace(placeForm.name, placeForm.category, placeForm.memo);
      setPlaces(await repo.placesOf(trip.id));
      setPlaceSheet(false);
      setPlaceForm({ name: '', category: 'park', memo: '' });
      toast('방문 장소를 기록했어요.');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const startExtra = async () => {
    setBusy(true);
    const r = await TripController.startExtraDrive({ demoSpeed: settings.demoSpeed });
    setBusy(false);
    if (r.ok) navigate('/trip/live');
    else toast(r.message, 'error');
  };

  const startReturn = async () => {
    setBusy(true);
    const r = await TripController.startReturn({ demoSpeed: settings.demoSpeed, home: settings.homeLocation ?? null });
    setBusy(false);
    if (r.ok) navigate('/trip/live');
    else toast(r.message, 'error');
  };

  const finish = async () => {
    setBusy(true);
    const id = await completeTripWithDraft(settings.apiBaseUrl);
    setBusy(false);
    setFinishSheet(false);
    if (id) { await reload(); navigate(`/album/${id}?new=1`, { replace: true }); }
  };

  const who = joinNames(live.petNames?.length ? live.petNames : []);
  const homeAsk = `${who}${josa(who, '과', '와')} 집으로 갈까요?`;
  const heroPhoto = trip.coverPhotoUri ?? photos[photos.length - 1]?.photoUri ?? null;
  const events: TimelineItem[] = [
    ...(trip.arrivedAt ? [{ id: 'arr', at: trip.arrivedAt, icon: <Flag />, title: `${trip.destinationName ?? (trip.endLocation ? regionLabel(trip.endLocation) : '목적지')} 도착`, time: formatTime(trip.arrivedAt), sub: `가는 길 ${formatKm(trip.totalDistanceKm)} · 주행 ${formatDuration(trip.drivingDurationSeconds)}` }] : []),
    ...places.map((pl) => ({ id: pl.id, at: pl.visitedAt, icon: <MapPinned />, title: pl.placeName, time: formatTime(pl.visitedAt), sub: [CATEGORY_LABEL[pl.category], pl.memo ? `“${pl.memo}”` : null, pl.isSample ? '샘플' : null].filter(Boolean).join(' · ') })),
    ...(photos.length ? [{ id: 'ph', at: Math.max(...photos.map((x) => x.createdAt)), icon: <Camera />, title: `사진 ${photos.length}장 추가`, time: formatTime(Math.max(...photos.map((x) => x.createdAt))) }] : []),
  ].sort((x, y) => x.at - y.at);

  return (
    <div className="screen">
      <section className="photo-hero dest-hero" aria-label="여행 대표 사진">
        {heroPhoto ? <img src={heroPhoto} alt="여행 대표 사진" /> : <PhotoFallback size={72} />}
        <div className="top">
          <span className="state-pill"><MapPinned size={14} />{PHASE_LABEL['at-destination']}</span>
          <span className="row" style={{ gap: 8 }}>
            {trip.isDemo && <span className="badge sample">데모 여행</span>}
            <button className="glass-btn" aria-label="사진 추가" onClick={addPhotos}><Camera size={18} /></button>
          </span>
        </div>
        <div className="cap" style={heroPhoto ? undefined : { color: 'var(--text)' }}>
          <h1>{trip.title || '여행지에 도착했어요'}</h1>
          <p className="num">{trip.endLocation ? regionLabel(trip.endLocation) : trip.destinationName ?? '목적지'} 도착 {trip.arrivedAt ? formatTime(trip.arrivedAt) : ''} · 가는 길 {formatKm(trip.totalDistanceKm)} · 주행 {formatDuration(trip.drivingDurationSeconds)}</p>
        </div>
      </section>

      <div className="stack overlap">
        <div className="qa" role="group" aria-label="여행지 기록">
          <button className="tile" onClick={addPhotos}><span className="ic"><ImagePlus size={26} /></span>사진 추가<span className="t-cap">{photos.length}장</span></button>
          <button className="tile" onClick={() => setPlaceSheet(true)}><span className="ic"><MapPinned size={26} /></span>장소 기록<span className="t-cap">{places.length}곳</span></button>
          <button className="tile" onClick={() => { setMemo(trip.memo); setMemoSheet(true); }}><span className="ic"><NotebookPen size={26} /></span>메모<span className="t-cap">{trip.memo ? '작성됨' : '비어 있음'}</span></button>
          <button className="tile" onClick={() => navigate('/explore')}><span className="ic"><Compass size={26} /></span>주변 탐색<span className="t-cap">동반 장소</span></button>
        </div>

        <section>
          <SectionHeader title={`오늘의 사진 · ${photos.length}장`} action="앨범 정리" onAction={() => navigate(`/album/${trip.id}`)} />
          <div className="photo-row">
            {photos.slice(-3).map((ph) => <div key={ph.id}><img src={ph.photoUri} alt={ph.memo || '여행 사진'} /></div>)}
            <button className="add" onClick={addPhotos} aria-label="사진 추가하기"><Plus size={22} />추가</button>
          </div>
        </section>

        <section>
          <SectionHeader title="오늘의 기록" action="이동 기록" onAction={() => navigate(`/album/${trip.id}`)} />
          <div className="card">
            {events.length ? <Timeline items={events} /> : <p className="t-sub">사진·장소·메모를 남기면 이곳에 시간순으로 쌓여요.</p>}
          </div>
        </section>

        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <div className="row between"><p style={{ fontWeight: 600, fontSize: 16 }}>여행 메모</p><button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="메모 수정" onClick={() => { setMemo(trip.memo); setMemoSheet(true); }}><Pencil size={18} /></button></div>
          <p className="t-body" style={{ color: trip.memo ? 'var(--text-2)' : 'var(--text-3)', whiteSpace: 'pre-line' }}>{trip.memo || '여행지에서 있었던 일을 적어 두면 여행 일기에 그대로 반영돼요.'}</p>
        </section>

        <section>
          <SectionHeader title="주변 반려견 동반 장소" action="더보기" onAction={() => navigate('/explore')} />
          <div className="list-card">
            {nearby.length === 0 ? <p className="t-sub" style={{ padding: '12px 0' }}>주변 장소를 찾는 중이에요.</p> : nearby.map((pl) => {
              const ok = !!(pl.policy.smallDog || pl.policy.largeDog);
              return (
                <PlaceRow key={pl.id} onClick={() => navigate('/explore')}
                  thumb={<PlaceThumb category={pl.category} size={56} radius={14} />}
                  title={pl.name} meta={`${CATEGORY_LABEL[pl.category]}${pl.distanceKm != null ? ` · ${formatKm(pl.distanceKm)}` : ''}${pl.isSample ? ' · 샘플 데이터' : ''}`}
                  status={{ tone: ok ? 'ok' : 'check', label: ok ? '동반 가능' : '확인 필요' }} />
              );
            })}
          </div>
        </section>

        <section className="next-move">
          <p style={{ fontWeight: 600, fontSize: 16 }}>{homeAsk}</p>
          {wide ? (
            <>
              <button className="btn primary block xl" disabled={busy} onClick={startReturn}>집으로 출발 · 돌아가는 길 기록</button>
              <p className="t-cap" style={{ fontSize: 12 }}>
                {trip.isDemo ? '데모: 서울(가상 집)까지 주행해요.' : settings.homeLocation ? `저장한 집 위치(${settings.homeLocation.name}) 근처에 오면 도착을 알려 드려요.` : <>집 위치를 저장하면 집 근처 도착을 알려 드려요. <button className="link" onClick={() => navigate('/my')}>집 위치 저장</button></>}
              </p>
              <div className="btn-row">
                <button className="btn ghost" disabled={busy} onClick={startExtra}>다른 장소로 이동</button>
                <button className="btn ghost" disabled={busy} onClick={() => setFinishSheet(true)}>여행 마무리</button>
              </div>
            </>
          ) : (
            <>
              <div className="car-only-dest" data-testid="return-in-car">
                <Car size={18} color="var(--primary)" />
                <span className="grow"><b>차에 타면 차량 앱이 이어서 기록해요</b><small>“{homeAsk}”라고 물어보고, 집까지 오는 길을 같은 여행으로 기록해요</small></span>
              </div>
              {trip.isDemo && <button className="btn primary block xl" onClick={openCarPreview}><Car size={20} />차량 화면에서 이어 가기 (데모)</button>}
              <button className="btn ghost block" disabled={busy} onClick={() => setFinishSheet(true)}>돌아가는 길 없이 여행 마무리</button>
            </>
          )}
          <p className="t-cap" style={{ fontSize: 12 }}>
            {trip.isDemo ? '데모: 돌아가는 길은 강릉 → 서울, 다른 장소 이동은 강릉 시내 짧은 가상 주행이에요. ' : ''}돌아가는 길 없이 마무리해도 기록은 그대로 남아요. 앱을 닫아도 여행지 활동 상태는 유지돼요.
          </p>
        </section>
      </div>

      <Sheet open={placeSheet} onClose={() => setPlaceSheet(false)} labelledBy="pl-title">
        <h2 id="pl-title" className="h-lg">방문 장소 기록</h2>
        <p className="t-cap mt-8">현재 위치({live.position ? regionLabel(live.position) : '마지막 기록 위치'})에 기록돼요.</p>
        <label className="field"><span className="label">장소 이름</span>
          <input className="input" maxLength={40} placeholder="예: 경포 솔숲 산책로" value={placeForm.name} onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })} />
        </label>
        <div className="field"><span className="label" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>종류</span>
          <div className="chips">
            {CATS.map((c) => <button key={c} className={`chip ${placeForm.category === c ? 'on' : ''}`} onClick={() => setPlaceForm({ ...placeForm, category: c })}><CategoryIcon category={c} size={15} />{CATEGORY_LABEL[c]}</button>)}
          </div>
        </div>
        <label className="field"><span className="label">메모 <span className="opt">(선택)</span></span>
          <textarea className="input" maxLength={200} placeholder="예: 그늘이 많아 쉬기 좋았음" value={placeForm.memo} onChange={(e) => setPlaceForm({ ...placeForm, memo: e.target.value })} />
        </label>
        <button className="btn primary block mt-16" onClick={savePlace}>기록하기</button>
      </Sheet>

      <Sheet open={memoSheet} onClose={() => setMemoSheet(false)} labelledBy="memo-title">
        <h2 id="memo-title" className="h-lg">여행 메모</h2>
        <textarea className="input mt-12" style={{ minHeight: 180 }} maxLength={1000} placeholder="여행지에서 있었던 일을 적어 주세요. 여행 일기에 그대로 반영돼요." value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="여행 메모" />
        <button className="btn primary block mt-12" onClick={async () => { await TripController.saveMemo(memo.trim()); setMemoSheet(false); toast('메모를 저장했어요.'); }}>저장</button>
      </Sheet>

      <Sheet open={finishSheet} onClose={() => !busy && setFinishSheet(false)} center labelledBy="fin-title">
        <h2 id="fin-title" className="h-lg">여기서 여행을 마무리할까요?</h2>
        <p className="t-sub mt-8">돌아가는 길은 기록하지 않고 여행을 완료해요. 사진·메모·일기는 완료 후에도 계속 추가할 수 있어요.</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" disabled={busy} onClick={() => setFinishSheet(false)}>취소</button>
          <button className="btn primary" disabled={busy} onClick={finish}>여행 완료</button>
        </div>
      </Sheet>
    </div>
  );
}
