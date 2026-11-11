// SCREEN 05 — AI 여행 일기 (대표 사진 · 제목 · 날짜 · 일기 · 수정 · 사진 추가 · 저장)
import { drivingLocked } from '../trip/driveLock';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ImagePlus, Info, Lock, Pencil, RefreshCw, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { useStore } from '../app/store';
import { addPhotosToTrip } from '../app/photos';
import { repo } from '../data/db';
import type { RestSession, Trip, TripPhoto, VisitedPlace } from '../domain/models';
import { formatKm, formatKoreanDate, formatShortDate } from '../domain/format';
import { regionShort } from '../domain/regions';
import { navigate } from '../app/router';
import { generateDiary } from '../diary/diaryGenerator';
import { buildDiaryInput } from '../diary/buildInput';
import { TripController } from '../trip/TripController';
import { ErrorState, Loading, TopBar } from '../ui/components';
import { PawGlyph } from '../ui/Art';
import { PhotoFallback } from '../ui/kit';

export default function DiaryScreen({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const { petsOfTrip, settings, toast } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const driving = drivingLocked(live);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rests, setRests] = useState<RestSession[]>([]);
  const [places, setPlaces] = useState<VisitedPlace[]>([]);

  const load = useCallback(async () => {
    try {
      const t = await repo.getTrip(id);
      if (!t) { setError('여행 기록을 찾을 수 없어요.'); return; }
      setTrip(t);
      setPhotos(await repo.photosOf(id));
      setRests(await repo.restsOf(id));
      setPlaces(await repo.placesOf(id));
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="screen"><TopBar title="AI 여행 일기" /><ErrorState desc={error} onRetry={load} /></div>;
  if (!trip) return <div className="screen"><TopBar title="AI 여행 일기" /><Loading /></div>;

  const save = async (patch: Partial<Trip>) => {
    const next = { ...trip, ...patch };
    try { await repo.saveTrip(next); setTrip(next); await onChanged(); return true; }
    catch (e) { toast((e as Error).message, 'error'); return false; }
  };

  const generate = async () => {
    setBusy(true);
    const names = petsOfTrip(id).map((p) => p.name);
    const r = await generateDiary(await buildDiaryInput(trip, names), settings.apiBaseUrl).catch(() => null);
    setBusy(false);
    if (!r) return;
    if (await save({ diaryText: r.text, diarySource: r.source })) toast(r.source === 'ai' ? 'AI 여행 일기를 만들었어요.' : `${r.fallbackReason ? `${r.fallbackReason} · ` : ''}기록 기반 일기를 만들었어요.`);
  };

  const addPhotos = async () => {
    const added = await addPhotosToTrip(id, (m) => toast(m, 'error'));
    if (!added) return;
    const list = [...photos, ...added];
    setPhotos(list);
    if (!trip.coverPhotoUri && list[0]) await save({ coverPhotoUri: list[0].photoUri });
  };

  const gallery = photos.length ? photos.map((p) => p.photoUri) : trip.coverPhotoUri ? [trip.coverPhotoUri] : [];
  const sourceLabel = trip.diarySource === 'ai' ? 'AI 생성' : trip.diarySource === 'template' ? '기록 기반 템플릿' : trip.diarySource === 'user' ? '직접 작성' : null;

  const doneRests = rests.filter((r) => r.endTime).length;
  const facts = [`이동 ${formatKm(trip.totalDistanceKm)}`, doneRests ? `휴식 ${doneRests}회` : null, places.filter((p) => !p.isSample).length ? `방문 ${places.filter((p) => !p.isSample).length}곳` : null, photos.length ? `사진 ${photos.length}장` : null, trip.memo ? '여행 메모' : null].filter(Boolean) as string[];
  const paragraphs = (trip.diaryText || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="screen" style={{ background: 'var(--surface)' }}>
      <TopBar title="AI 여행 일기" right={!driving && trip.diaryText && draft == null ? <button className="icon-btn" aria-label="일기 수정" onClick={() => setDraft(trip.diaryText)}><Pencil size={19} /></button> : undefined} />
      <div className="stack" style={{ gap: 24 }}>
        <div className="diary-cover">
          {gallery.length ? <img src={gallery[idx % gallery.length]} alt="여행 사진" /> : <PhotoFallback size={64} />}
          <span className="badge photo" style={{ height: 26 }}>{formatShortDate(trip.startTime)} · {regionShort(trip.endLocation)}</span>
          {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', right: 14, top: 14 }}>데모 기록</span>}
          {gallery.length > 1 && (
            <span className="dots" style={{ position: 'absolute', right: 16, bottom: 20 }}>{gallery.slice(0, 8).map((_, i) => <i key={i} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />)}</span>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            {sourceLabel && <span className="badge">{trip.diarySource === 'template' ? 'AI 초안' : sourceLabel}</span>}
            <span className="t-cap">{trip.diarySource === 'template' ? '기록 기반 · 언제든 고칠 수 있어요' : formatKoreanDate(trip.startTime)}</span>
          </div>
          <h1 className="h-lg" style={{ fontSize: 22 }}>{trip.title}</h1>
        </div>

        {driving ? (
          <p className="lock-note"><Lock size={15} />주행 중에는 일기를 편집할 수 없어요. 정차 후 이용해 주세요.</p>
        ) : draft != null ? (
          <textarea className="input" style={{ minHeight: 280, fontSize: 16, lineHeight: 1.75 }} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} aria-label="여행 일기" />
        ) : trip.diaryText ? (
          <div className="diary-text t-body">{paragraphs.map((t, i) => <p key={i}>{t}</p>)}</div>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="t-sub">이동 거리·주행 시간·휴식·방문 장소·메모를 바탕으로 일기를 만들어 드려요.</p>
            <button className="btn primary mt-16" disabled={busy} onClick={generate}><Sparkles size={18} />{busy ? '일기를 쓰는 중…' : 'AI 여행 일기 만들기'}</button>
            <p className="t-cap mt-12">{settings.apiBaseUrl ? 'AI 서버로 생성하고, 실패하면 기록 기반 템플릿으로 만들어요.' : 'AI 서버 미설정 · 기록 기반 템플릿으로 만들어요.'}</p>
          </div>
        )}

        {trip.diaryText && (
          <section className="facts" aria-label="이 일기에 쓰인 기록">
            <p className="row" style={{ gap: 8, fontWeight: 600 }}><Info size={18} color="var(--text-2)" />이 일기에 쓰인 기록</p>
            <div className="chips" style={{ gap: 6 }}>{facts.map((f) => <span key={f} className="badge photo" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>{f}</span>)}</div>
            <p className="t-cap">기록에 없는 장소·행동을 지어내거나 반려견의 감정·건강을 단정하지 않아요.</p>
          </section>
        )}

        {!driving && (
          <div className="btn-row">
            {draft != null ? (
              <>
                <button className="btn ghost" onClick={() => setDraft(null)}>취소</button>
                <button className="btn primary" onClick={async () => { if (await save({ diaryText: draft.trim(), diarySource: 'user' })) { setDraft(null); toast('일기를 저장했어요.'); } }}><Save size={18} />저장</button>
              </>
            ) : (
              <>
                <button className="btn ghost" onClick={addPhotos}><ImagePlus size={18} />사진 추가</button>
                {trip.diaryText && <button className="btn ghost" onClick={() => setDraft(trip.diaryText)}><Pencil size={18} />직접 수정</button>}
                {trip.diaryText && <button className="btn secondary" disabled={busy} onClick={generate}><RefreshCw size={18} />{busy ? '만드는 중…' : '다시 만들기'}</button>}
              </>
            )}
          </div>
        )}

        <section style={{ borderTop: '8px solid var(--bg)', margin: '0 -24px', padding: '24px 24px 0', display: 'grid', gap: 14 }} aria-label="SNS 공유 카드">
          <h2 className="h-md">SNS 공유 카드</h2>
          <div className="share-prev">
            {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="" /> : <PhotoFallback size={64} />}
            <div className="sp-card">
              <span className="row" style={{ gap: 6, color: 'var(--primary)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em' }}><PawGlyph size={14} color="var(--primary)" />MUNG ROAD</span>
              <b style={{ fontSize: 17, fontWeight: 700 }}>{trip.title}</b>
              <span className="t-cap num">{formatShortDate(trip.startTime)} · {formatKm(trip.totalDistanceKm)} · {regionShort(trip.endLocation)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8, background: 'var(--mint)', color: 'var(--mint-text)', borderRadius: 14, padding: '12px 14px', fontSize: 13 }}><ShieldCheck size={18} style={{ flex: 'none' }} />집 주소·정확한 위치·GPS 경로는 넣지 않아요. 지역은 시·군까지만 표시해요.</div>
          <button className="btn primary block xl" onClick={() => navigate(`/album/${trip.id}?share=1`)}>이미지 저장 · 공유</button>
        </section>
      </div>
    </div>
  );
}
