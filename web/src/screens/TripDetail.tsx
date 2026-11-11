import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Camera, Car, Check, ChevronRight, Clock3, Coffee, Download, FlaskConical, ImagePlus, Lock, MapPin, Pencil, PenLine, Share2, Sparkles, Star, Trash2, X } from 'lucide-react';
import { useStore } from '../app/store';
import { back, navigate, queryParam } from '../app/router';
import { fileToDataUrl, pickImages } from '../app/image';
import { renderShareCard } from '../app/shareCard';
import { repo } from '../data/db';
import { CATEGORY_LABEL, newId, SOURCE_LABEL, type RestSession, type Trip, type TripLocation, type TripPhoto, type VisitedPlace } from '../domain/models';
import { formatDuration, formatKm, formatKoreanDate, formatShortDate, formatTime } from '../domain/format';
import { regionLabel, regionShort } from '../domain/regions';
import { petNames as joinPetNames } from '../domain/tripText';
import { generateDiary } from '../diary/diaryGenerator';
import { TripController } from '../trip/TripController';
import { ErrorState, Hint, Loading, Sheet, TopBar } from '../ui/components';
import { PlaceThumb, Scene } from '../ui/Art';
import { MapView, type MapMarker } from '../ui/MapView';

interface Data {
  trip: Trip;
  locs: TripLocation[];
  rests: RestSession[];
  places: VisitedPlace[];
  photos: TripPhoto[];
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
  const isNew = queryParam(route, 'new') === '1';
  const driving = live.active && live.engine?.status === 'driving';

  const load = useCallback(async () => {
    try {
      const trip = await repo.getTrip(id);
      if (!trip) { setError('여행 기록을 찾을 수 없어요.'); return; }
      const [locs, rests, places, photos] = await Promise.all([repo.locationsOf(id), repo.restsOf(id), repo.placesOf(id), repo.photosOf(id)]);
      setData({ trip, locs, rests, places, photos });
      setMemo(trip.memo);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="screen no-nav"><TopBar title="여행 상세" /><ErrorState desc={error} onRetry={load} extra={<button className="btn ghost sm" onClick={() => navigate('/album', { replace: true })}>앨범으로</button>} /></div>;
  if (!data) return <div className="screen no-nav"><TopBar title="여행 상세" /><Loading /></div>;

  const { trip, locs, rests, places, photos } = data;
  const pets = petsOfTrip(trip.id);
  const names = pets.map((p) => p.name);
  const restTotal = rests.reduce((a, r) => a + (r.endTime ? (r.endTime - r.startTime) / 1000 : 0), 0);
  const route2 = locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));

  const save = async (patch: Partial<Trip>) => {
    const next = { ...trip, ...patch };
    try {
      await repo.saveTrip(next);
      setData({ ...data, trip: next });
      await onChanged();
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  };

  const diaryInput = () => ({
    petNames: names.length ? names : ['우리 강아지'],
    startTime: trip.startTime,
    startRegion: trip.startLocation ? regionShort(trip.startLocation) : null,
    endRegion: trip.endLocation ? regionShort(trip.endLocation) : trip.destinationName,
    distanceKm: trip.totalDistanceKm,
    drivingSec: trip.drivingDurationSeconds,
    elapsedSec: trip.elapsedDurationSeconds,
    restCount: rests.filter((r) => r.endTime).length,
    places: places.map((p) => ({ name: p.placeName, category: p.category, isSample: p.isSample })),
    photoCount: photos.length,
    memo,
  });

  const genDiary = async () => {
    setGenBusy(true);
    const r = await generateDiary(diaryInput(), settings.apiBaseUrl).catch(() => null);
    setGenBusy(false);
    if (!r) return;
    if (await save({ diaryText: r.text, diarySource: r.source, memo })) {
      setDiaryDraft(null);
      toast(r.source === 'ai' ? 'AI 여행 일기를 만들었어요.' : r.fallbackReason ? `${r.fallbackReason} · 기본 일기로 만들었어요.` : '기록을 바탕으로 기본 여행 일기를 만들었어요.');
    }
  };

  const addPhotos = async () => {
    const files = await pickImages(true);
    if (!files) return; // 선택 취소
    let added = 0;
    const list = [...photos];
    for (const f of files.slice(0, 20)) {
      try {
        const uri = await fileToDataUrl(f);
        const p: TripPhoto = { id: newId(), tripId: trip.id, photoUri: uri, createdAt: Date.now() };
        await repo.addPhoto(p);
        list.push(p);
        added++;
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
    if (added) {
      setData({ ...data, photos: list });
      if (!trip.coverPhotoUri) await save({ coverPhotoUri: list[0].photoUri });
      toast(`사진 ${added}장을 추가했어요.`);
    }
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

  return (
    <div className="screen no-nav">
      <TopBar title="여행 상세" onBack={() => (isNew ? navigate('/album', { replace: true }) : back())} right={<button className="icon-btn" aria-label="공유 이미지 만들기" onClick={makeShare}><Share2 size={21} /></button>} />

      {isNew && (
        <div className="hint green" style={{ marginBottom: 14 }}>
          <Check size={16} />
          <div>여행이 저장됐어요! 제목을 다듬고 사진과 메모를 남긴 뒤 여행 일기를 만들어 보세요.</div>
        </div>
      )}

      <div className="cover">
        {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="여행 대표 사진" /> : <Scene kind="drive" height={260} />}
        {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', left: 12, top: 12 }}><FlaskConical size={12} />데모 기록 · 통계 제외</span>}
      </div>

      <div className="mt-16">
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
            <h1 className="h-xl grow">{trip.title}</h1>
            <button className="icon-btn" aria-label="제목 수정" onClick={() => { setTitleDraft(trip.title); setEditingTitle(true); }}><Pencil size={18} /></button>
          </div>
        )}
        <p className="t-sub mt-8">{formatKoreanDate(trip.startTime)} · {formatTime(trip.startTime)} ~ {trip.endTime ? formatTime(trip.endTime) : '진행 중'}</p>
        <p className="t-sub row" style={{ gap: 4 }}><MapPin size={14} />{regionLabel(trip.startLocation)} → {trip.endLocation ? regionLabel(trip.endLocation) : trip.destinationName ?? '알 수 없는 지역'}</p>
        <p className="t-cap mt-8">함께한 친구: {names.join(', ') || '정보 없음'} · 기록 방식: {SOURCE_LABEL[trip.source]}</p>
      </div>

      {/* 시안: 정차 중 여행 기록 — 핵심 통계 + 여행 일기 보기 + 사진 추가 · 일기 편집 · 공유하기 */}
      <div className="card mt-16" style={{ padding: '16px 18px' }}>
        <div className="grid-3">
          <div><Car size={20} color="var(--primary)" /><p className="v">{formatKm(trip.totalDistanceKm)}</p><p className="k">총 이동 거리</p></div>
          <div><Clock3 size={20} color="var(--primary)" /><p className="v">{formatDuration(trip.drivingDurationSeconds)}</p><p className="k">주행 시간</p></div>
          <div><Coffee size={20} color="var(--primary)" /><p className="v">휴식 {rests.filter((r) => r.endTime).length}회</p><p className="k">휴식 횟수</p></div>
        </div>
        <button className="btn primary block mt-16" onClick={() => navigate(`/album/${trip.id}/diary`)}>여행 일기 보기 <ChevronRight size={18} /></button>
      </div>
      <div className="tile-row mt-12">
        <button className="tile" disabled={driving} onClick={addPhotos}><Camera size={26} />사진 추가</button>
        <button className="tile" disabled={driving} onClick={() => navigate(`/album/${trip.id}/diary`)}><PenLine size={26} />일기 편집</button>
        <button className="tile" onClick={makeShare}><Share2 size={26} />공유하기</button>
      </div>
      {driving && <p className="lock-note mt-8"><Lock size={15} />주행 중에는 상세 편집이 잠겨요. 정차 후 이용해 주세요.</p>}

      {route2.length > 1 ? (
        <div className="mt-16"><MapView route={route2} markers={markers} height={240} ariaLabel="이동 경로 지도" /></div>
      ) : (
        <div className="muted-box mt-16 t-sub">{trip.source === 'manual' ? '수동 기록 모드라 이동 경로가 없어요.' : '저장된 이동 경로가 없어요.'}</div>
      )}

      <div className="grid-2 mt-16">
        <div className="stat"><span className="k">이동 거리</span><p className="v">{formatKm(trip.totalDistanceKm)}</p></div>
        <div className="stat"><span className="k">실제 주행 시간</span><p className="v">{formatDuration(trip.drivingDurationSeconds)}</p></div>
        <div className="stat"><span className="k">총 여행 시간</span><p className="v">{formatDuration(trip.elapsedDurationSeconds)}</p></div>
        <div className="stat"><span className="k">휴식</span><p className="v">{rests.filter((r) => r.endTime).length}회 · {formatDuration(restTotal)}</p></div>
      </div>
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
                  <p className="t-cap">{CATEGORY_LABEL[p.category]} · {formatTime(p.visitedAt)}</p>
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
        <div className="section-head"><h2 className="h-md">사진</h2><span className="t-cap">{photos.length}장</span></div>
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id}>
              <img src={p.photoUri} alt="여행 사진" />
              <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 4 }}>
                <button className="icon-btn" style={{ width: 30, height: 30, background: trip.coverPhotoUri === p.photoUri ? 'var(--accent)' : 'rgba(0,0,0,.4)', color: '#fff' }} aria-label="대표 사진으로 지정" onClick={() => save({ coverPhotoUri: p.photoUri })}><Star size={15} /></button>
                <button className="icon-btn" style={{ width: 30, height: 30, background: 'rgba(0,0,0,.4)', color: '#fff' }} aria-label="사진 삭제" onClick={async () => {
                  try {
                    await repo.deletePhoto(p.id);
                    const rest = photos.filter((x) => x.id !== p.id);
                    setData({ ...data, photos: rest });
                    if (trip.coverPhotoUri === p.photoUri) await save({ coverPhotoUri: rest[0]?.photoUri ?? null });
                  } catch (e) { toast((e as Error).message, 'error'); }
                }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <button className="photo-add" onClick={addPhotos} aria-label="사진 추가"><span style={{ display: 'grid', placeItems: 'center', gap: 4 }}><ImagePlus size={22} />사진 추가</span></button>
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
