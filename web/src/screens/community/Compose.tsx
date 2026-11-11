// 화면 6. 게시글 작성: 사진 미리보기 · 제목 · 내용 · 여행 장소 연결(위치 공개 동의) · 해시태그 · 공개 범위 · 게시
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ChevronLeft, Globe, MapPin, Plus, Route, Search, X } from 'lucide-react';
import { navigate } from '../../app/router';
import { useStore } from '../../app/store';
import { Draft, publishDraft, useDraft } from '../../app/community';
import { repo } from '../../data/db';
import { MAX_MEDIA, VISIBILITY_LABEL, type PostPlace, type Visibility } from '../../domain/community';
import { CATEGORY_LABEL, type VisitedPlace } from '../../domain/models';
import { REGIONS, regionLabel } from '../../domain/regions';
import { formatDuration, formatKm } from '../../domain/format';
import { TripController } from '../../trip/TripController';
import { drivingLocked } from '../../trip/driveLock';
import { Sheet, Switch } from '../../ui/components';
import { DriveLock, MediaView } from './parts';

export default function Compose() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { pets, settings, toast } = useStore();
  const d = useDraft();
  const [placeSheet, setPlaceSheet] = useState(false);
  const [visSheet, setVisSheet] = useState(false);
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tripPlaces, setTripPlaces] = useState<PostPlace[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => { if (d.media.length === 0) navigate('/community/new', { replace: true }); }, [d.media.length]);
  useEffect(() => {
    if (!d.tripId) { setTripPlaces([]); return; }
    repo.placesOf(d.tripId).then((ps: VisitedPlace[]) => setTripPlaces(ps.filter((p) => !p.isSample).map((p) => ({
      name: p.placeName, address: regionLabel(p), latitude: Math.round(p.latitude * 1000) / 1000, longitude: Math.round(p.longitude * 1000) / 1000,
      category: p.category, petStatus: 'check', source: 'trip',
    })))).catch(() => setTripPlaces([]));
  }, [d.tripId]);
  const regionHits = useMemo(() => (q.trim() ? REGIONS.filter((r) => r.name.includes(q.trim()) || r.province.includes(q.trim())).slice(0, 8) : []), [q]);

  if (drivingLocked(live)) return <DriveLock title="게시물 작성" />;

  const pet = pets[0];
  const addTag = () => {
    const t = tagText.replace(/^#/, '').trim();
    if (!t) return;
    if (d.hashtags.length >= 10) { toast('해시태그는 10개까지 넣을 수 있어요.', 'error'); return; }
    Draft.set((s) => ({ hashtags: [...new Set([...s.hashtags, t])] }));
    setTagText('');
  };
  const choosePlace = (p: PostPlace) => { Draft.set({ place: p }); setPlaceSheet(false); setQ(''); };
  const submit = async () => {
    setBusy(true);
    const r = await publishDraft({ name: settings.userName || (pet ? `${pet.name} 보호자` : '나'), petName: pet?.name ?? null, photo: pet?.photoUri ?? null });
    setBusy(false);
    if (r.ok) navigate(`/community/new/done?id=${r.id}`, { replace: true });
    else if (/저장하지 못했어요/.test(r.message)) navigate('/community/new/done?fail=1');
    else toast(r.message, 'error');
  };

  return (
    <div className="screen no-nav" style={{ background: '#fff', paddingBottom: 24 }}>
      <header className="topbar back" style={{ background: '#fff' }}>
        <button className="icon-btn" aria-label="편집으로" onClick={() => navigate('/community/new/edit')}><ChevronLeft size={24} /></button>
        <h1 style={{ textAlign: 'center' }}>게시글 작성</h1>
        <button className="btn sm" style={{ background: 'none', color: 'var(--primary)', fontSize: 16 }} disabled={busy} onClick={submit}>{busy ? '게시 중…' : '게시'}</button>
      </header>

      {d.lastError && <div className="hint red" style={{ marginBottom: 12 }}><X size={16} /><div>{d.lastError}</div></div>}

      <div className="cp-media">
        <button className="cp-thumb" style={{ border: 0, padding: 0 }} onClick={() => navigate('/community/new/edit')} aria-label="사진 편집">
          {d.media[0] ? <MediaView m={d.media[0]} /> : <span className="media" />}
          {d.media.length > 1 && <span className="more">+{d.media.length - 1}</span>}
        </button>
        <div className="grow" style={{ display: 'grid', gap: 4 }}>
          <input className="cp-title" maxLength={60} placeholder="제목을 입력하세요" value={d.title} onChange={(e) => Draft.set({ title: e.target.value })} aria-label="게시글 제목" />
          <span className="t-cap">사진·동영상 {d.media.length}/{MAX_MEDIA} · 눌러서 편집</span>
        </div>
      </div>
      <div className="divider" />
      <textarea className="cp-body" maxLength={2000} placeholder={`${pet ? `${pet.name}와` : '반려견과'} 함께한 여행 이야기를 들려주세요. #해시태그도 쓸 수 있어요`} value={d.body} onChange={(e) => Draft.set({ body: e.target.value })} aria-label="게시글 내용" />

      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {d.place ? (
          <div className="cp-place">
            <MapPin size={20} color="var(--primary)" />
            <div className="grow" style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }} className="ellipsis">{d.place.name}</b><p className="t-cap">{[d.place.address, d.place.category ? CATEGORY_LABEL[d.place.category] : null, d.place.petStatus === 'ok' ? '동반 가능' : '동반 확인 필요'].filter(Boolean).join(' · ')}</p></div>
            <button className="icon-btn" aria-label="장소 연결 해제" onClick={() => Draft.set({ place: null, locationConsent: false })}><X size={18} /></button>
          </div>
        ) : (
          <button className="cp-place" style={{ background: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--text-2)' }} onClick={() => setPlaceSheet(true)}><MapPin size={20} />여행 장소 연결 (선택)<Plus size={18} style={{ marginLeft: 'auto' }} /></button>
        )}
        {d.place && (
          <label className="row" style={{ gap: 12, background: 'var(--bg)', borderRadius: 14, padding: '12px 14px', fontSize: 13.5 }}>
            <span className="grow"><b style={{ fontWeight: 600 }}>장소 정보 공개에 동의해요</b><br /><span className="t-cap">장소 이름과 시·군 지역만 공개돼요. 이동 경로 전체와 집 주소는 공개하지 않아요.</span></span>
            <Switch checked={d.locationConsent} onChange={(v) => Draft.set({ locationConsent: v })} label="위치 정보 공개 동의" />
          </label>
        )}

        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {d.hashtags.map((t) => <button key={t} className="tag-edit" onClick={() => Draft.set((s) => ({ hashtags: s.hashtags.filter((x) => x !== t) }))} aria-label={`#${t} 빼기`}>#{t}<X size={13} /></button>)}
          <input className="input" style={{ height: 34, width: 140, borderRadius: 999, fontSize: 13.5, padding: '0 12px' }} placeholder="#해시태그 추가" value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} aria-label="해시태그 입력" />
        </div>

        {d.tripSummary && (
          <div className="cp-row" style={{ borderTop: 0, background: 'var(--primary-soft)', borderRadius: 14, padding: '12px 14px' }}>
            <Route size={18} color="var(--primary)" />
            <span className="grow" style={{ fontSize: 13.5 }}>여행 기록 요약 함께 공유 · {formatKm(d.tripSummary.distanceKm)} · 주행 {formatDuration(d.tripSummary.drivingSec)}<br /><span className="t-cap">이동 경로와 출발 위치는 공개하지 않아요</span></span>
            <button className="icon-btn" aria-label="여행 요약 빼기" onClick={() => Draft.set({ tripSummary: null })}><X size={18} /></button>
          </div>
        )}
      </div>

      <button className="cp-row" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--line)', marginTop: 16, cursor: 'pointer', font: 'inherit' }} onClick={() => setVisSheet(true)} aria-label="공개 범위 설정">
        <Globe size={20} color="var(--text-2)" /><span className="grow" style={{ textAlign: 'left' }}>공개 범위</span><span style={{ color: 'var(--text-2)' }}>{VISIBILITY_LABEL[d.visibility]}</span><ChevronDown size={18} color="var(--text-3)" />
      </button>
      <p className="t-cap" style={{ fontSize: 12 }}>서버 연동 전이라 게시물은 이 기기에만 저장돼요(데모). 공개 범위는 서버 연동 후 적용돼요.</p>

      <Sheet open={placeSheet} onClose={() => setPlaceSheet(false)} labelledBy="pl-t">
        <h2 id="pl-t" className="h-md">여행 장소 연결</h2>
        {tripPlaces.length > 0 && (
          <div className="mt-12">
            <p className="t-cap" style={{ marginBottom: 6 }}>이 여행에서 기록한 장소</p>
            <div className="list-card">{tripPlaces.map((p) => <button key={p.name + p.latitude} className="row-btn" onClick={() => choosePlace(p)}><MapPin size={16} color="var(--primary)" /><span className="grow">{p.name} <span className="t-cap">{p.address}</span></span></button>)}</div>
          </div>
        )}
        <div className="field-soft mt-16"><Search size={20} /><input className="input" placeholder="지역 검색 (예: 강릉, 양평)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="장소 검색" /></div>
        {regionHits.length > 0 && (
          <div className="list-card mt-8">
            {regionHits.map((r) => <button key={r.id} className="row-btn" onClick={() => choosePlace({ name: r.name, address: `${r.province} ${r.name}`, latitude: r.latitude, longitude: r.longitude, category: null, petStatus: 'check', source: 'region' })}><MapPin size={16} color="var(--text-2)" /><span className="grow">{r.name} <span className="t-cap">{r.province}</span></span></button>)}
          </div>
        )}
        <p className="t-cap mt-12">동반 여부가 확인되지 않은 장소는 ‘확인 필요’로 표시돼요.</p>
      </Sheet>

      <Sheet open={visSheet} onClose={() => setVisSheet(false)} labelledBy="vs-t">
        <h2 id="vs-t" className="h-md">공개 범위</h2>
        <div className="list-card mt-12">
          {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
            <button key={v} className="row-btn" onClick={() => { Draft.set({ visibility: v }); setVisSheet(false); }} aria-pressed={d.visibility === v}>
              <span className="grow">{VISIBILITY_LABEL[v]}</span>{d.visibility === v && <Check size={18} color="var(--primary)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
