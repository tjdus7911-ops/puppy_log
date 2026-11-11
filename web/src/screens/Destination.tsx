// 여행지 활동 홈 (phase 'at-destination'): 목적지 도착 후에도 여행은 계속됩니다.
// 사진 추가 · 방문 장소 기록 · 여행 메모 · 주변 장소 탐색 · 이동 기록 확인 · 복귀 이동 시작 · 여행 마무리
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Camera, Car, ChevronRight, Compass, Flag, MapPinned, NotebookPen, Route, Undo2 } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { addPhotosToTrip } from '../app/photos';
import { repo } from '../data/db';
import { CATEGORY_LABEL, PHASE_LABEL, type PlaceCategory, type TripPhoto, type VisitedPlace } from '../domain/models';
import { formatDuration, formatKm, formatTime } from '../domain/format';
import { regionLabel } from '../domain/regions';
import { TripController } from '../trip/TripController';
import { completeTripWithDraft } from '../trip/completeTrip';
import { Hint, Sheet } from '../ui/components';
import { CategoryIcon, PlaceThumb, Scene } from '../ui/Art';

const CATS = Object.keys(CATEGORY_LABEL) as PlaceCategory[];

export default function Destination() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { settings, toast, reload } = useStore();
  const trip = live.trip;
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [places, setPlaces] = useState<VisitedPlace[]>([]);
  const [placeSheet, setPlaceSheet] = useState(false);
  const [placeForm, setPlaceForm] = useState<{ name: string; category: PlaceCategory; memo: string }>({ name: '', category: 'park', memo: '' });
  const [memoSheet, setMemoSheet] = useState(false);
  const [memo, setMemo] = useState(trip?.memo ?? '');
  const [finishSheet, setFinishSheet] = useState(false);
  const [busy, setBusy] = useState(false);

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
    const r = await TripController.startReturn({ demoSpeed: settings.demoSpeed });
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

  return (
    <div className="screen">
      <div className="dest-hero mt-8">
        <div className="cover" style={{ aspectRatio: '16 / 9' }}>
          {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="여행 대표 사진" /> : <Scene kind="rest" height={260} />}
          <span className="badge" style={{ position: 'absolute', left: 12, top: 12, background: 'var(--mint)', color: 'var(--mint-text)', height: 28, padding: '0 12px' }}><MapPinned size={14} />{PHASE_LABEL['at-destination']}</span>
          {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', right: 12, top: 12 }}>데모 여행</span>}
        </div>
        <h1 className="h-xl mt-16">{trip.title || '여행지에 도착했어요'}</h1>
        <p className="t-sub mt-8">
          {trip.endLocation ? regionLabel(trip.endLocation) : trip.destinationName ?? '목적지'} 도착 {trip.arrivedAt ? formatTime(trip.arrivedAt) : ''} · 가는 길 {formatKm(trip.totalDistanceKm)} · 주행 {formatDuration(trip.drivingDurationSeconds)}
        </p>
      </div>

      <div className="dest-grid mt-16">
        <button className="tile" onClick={addPhotos}><Camera size={26} />사진 추가<span className="t-cap">{photos.length}장</span></button>
        <button className="tile" onClick={() => setPlaceSheet(true)}><MapPinned size={26} />장소 기록<span className="t-cap">{places.length}곳</span></button>
        <button className="tile" onClick={() => { setMemo(trip.memo); setMemoSheet(true); }}><NotebookPen size={26} />메모 작성<span className="t-cap">{trip.memo ? '작성됨' : '비어 있음'}</span></button>
        <button className="tile" onClick={() => navigate('/explore')}><Compass size={26} />주변 장소 탐색<span className="t-cap">음식점·카페·산책로</span></button>
        <button className="tile" onClick={() => navigate(`/album/${trip.id}`)}><Route size={26} />이동 기록 확인<span className="t-cap">경로·휴식·사진</span></button>
      </div>

      {photos.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="h-md">이번 여행 사진</h2><button className="link" onClick={() => navigate(`/album/${trip.id}`)}>정리하기 <ChevronRight size={16} /></button></div>
          <div className="photo-strip">{photos.slice(-8).map((p) => <img key={p.id} src={p.photoUri} alt={p.memo || '여행 사진'} />)}</div>
        </section>
      )}

      {places.length > 0 && (
        <section className="section">
          <h2 className="h-md">기록한 장소</h2>
          <div className="card mt-12" style={{ padding: '4px 18px' }}>
            {places.map((p) => (
              <div key={p.id} className="row-item">
                <PlaceThumb category={p.category} size={40} radius={12} />
                <div className="grow">
                  <p style={{ fontWeight: 650 }} className="ellipsis">{p.placeName} {p.isSample && <span className="badge sample">샘플</span>}</p>
                  <p className="t-cap">{CATEGORY_LABEL[p.category]} · {formatTime(p.visitedAt)}{p.memo ? ` · ${p.memo}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {trip.memo && (
        <section className="section">
          <h2 className="h-md">여행 메모</h2>
          <div className="card mt-12"><p className="t-body" style={{ whiteSpace: 'pre-line' }}>{trip.memo}</p></div>
        </section>
      )}

      <div className="section" style={{ display: 'grid', gap: 10 }}>
        <button className="btn primary block xl" disabled={busy} onClick={startReturn}><Undo2 size={22} />돌아가는 길 기록 시작</button>
        <div className="btn-row">
          <button className="btn secondary" disabled={busy} onClick={startExtra}><Car size={18} />다른 장소로 이동</button>
          <button className="btn ghost" disabled={busy} onClick={() => setFinishSheet(true)}><Flag size={18} />여행 마무리</button>
        </div>
        <p className="t-cap" style={{ textAlign: 'center' }}>
          {trip.isDemo ? '데모: 돌아가는 길은 강릉 → 서울, 다른 장소 이동은 강릉 시내 짧은 가상 주행이에요.' : '이동을 시작하면 휴식 알림과 주행 기록이 다시 시작돼요.'} 복귀 기록 없이 편도로 마무리해도 돼요. 앱을 닫아도 여행지 활동 상태는 유지돼요.
        </p>
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
      <div className="mt-16"><Hint tone="green">여행지 활동 중에는 주행 기록이 멈춰 있어요. 휴식 알림은 돌아가는 길 기록을 시작하면 다시 켜져요.</Hint></div>
    </div>
  );
}
