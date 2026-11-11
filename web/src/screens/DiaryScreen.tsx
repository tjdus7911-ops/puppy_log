// SCREEN 05 — AI 여행 일기 (대표 사진 · 제목 · 날짜 · 일기 · 수정 · 사진 추가 · 저장)
import { drivingLocked } from '../trip/driveLock';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ImagePlus, Lock, Pencil, Save, Sparkles } from 'lucide-react';
import { useStore } from '../app/store';
import { addPhotosToTrip } from '../app/photos';
import { repo } from '../data/db';
import type { Trip, TripPhoto } from '../domain/models';
import { formatKoreanDate } from '../domain/format';
import { generateDiary } from '../diary/diaryGenerator';
import { buildDiaryInput } from '../diary/buildInput';
import { TripController } from '../trip/TripController';
import { ErrorState, Hint, Loading, TopBar } from '../ui/components';
import { Scene } from '../ui/Art';

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

  const load = useCallback(async () => {
    try {
      const t = await repo.getTrip(id);
      if (!t) { setError('여행 기록을 찾을 수 없어요.'); return; }
      setTrip(t);
      setPhotos(await repo.photosOf(id));
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

  return (
    <div className="screen">
      <TopBar title="AI 여행 일기" right={!driving && trip.diaryText && draft == null ? <button className="icon-btn" aria-label="일기 수정" onClick={() => setDraft(trip.diaryText)}><Pencil size={19} /></button> : undefined} />
      <div className="cover" style={{ aspectRatio: '16 / 10' }}>
        {gallery.length ? <img src={gallery[idx % gallery.length]} alt="여행 사진" /> : <Scene kind="album" height={300} />}
        {gallery.length > 1 && (
          <div className="row" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, justifyContent: 'center', gap: 6 }}>
            {gallery.map((_, i) => <button key={i} aria-label={`${i + 1}번째 사진`} onClick={() => setIdx(i)} style={{ width: i === idx ? 18 : 7, height: 7, borderRadius: 4, border: 0, background: i === idx ? '#fff' : 'rgba(255,255,255,.6)' }} />)}
          </div>
        )}
        {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', left: 12, top: 12 }}>데모 기록</span>}
      </div>
      <h1 className="h-xl mt-16">{trip.title}</h1>
      <p className="t-sub mt-8">{formatKoreanDate(trip.startTime)}{sourceLabel ? ` · ${sourceLabel}` : ''}</p>

      <div className="mt-16">
        {driving ? (
          <p className="lock-note"><Lock size={15} />주행 중에는 일기를 편집할 수 없어요. 정차 후 이용해 주세요.</p>
        ) : draft != null ? (
          <textarea className="input" style={{ minHeight: 260 }} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} aria-label="여행 일기" />
        ) : trip.diaryText ? (
          <div className="card"><p className="t-body" style={{ whiteSpace: 'pre-line' }}>{trip.diaryText}</p></div>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="t-sub">이동 거리·주행 시간·휴식·방문 장소·메모를 바탕으로 일기를 만들어 드려요.</p>
            <button className="btn primary mt-16" disabled={busy} onClick={generate}><Sparkles size={18} />{busy ? '일기를 쓰는 중…' : 'AI 여행 일기 만들기'}</button>
            <p className="t-cap mt-12">{settings.apiBaseUrl ? 'AI 서버로 생성하고, 실패하면 기록 기반 템플릿으로 만들어요.' : 'AI 서버 미설정 · 기록 기반 템플릿으로 만들어요.'}</p>
          </div>
        )}
      </div>

      {!driving && (
        <div className="btn-row mt-16">
          <button className="btn ghost" onClick={addPhotos}><ImagePlus size={18} />사진 추가</button>
          {draft != null ? (
            <button className="btn primary" onClick={async () => { if (await save({ diaryText: draft.trim(), diarySource: 'user' })) { setDraft(null); toast('일기를 저장했어요.'); } }}><Save size={18} />저장</button>
          ) : trip.diaryText ? (
            <button className="btn secondary" disabled={busy} onClick={generate}><Sparkles size={18} />{busy ? '만드는 중…' : '다시 만들기'}</button>
          ) : null}
        </div>
      )}
      <div className="mt-16"><Hint>일기는 실제 기록만 사용해요. 기록에 없는 장소·행동을 만들거나 반려견의 감정·건강을 단정하지 않아요.</Hint></div>
    </div>
  );
}
