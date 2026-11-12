import { useEffect, useState } from 'react';
import { Car, Check, ChevronRight, Clock3, FlaskConical, MapPin, PawPrint, Plus, Route, Search, ShieldCheck, X } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam, useRoute } from '../app/router';
import { planRests, SAFETY_ITEMS } from '../domain/plan';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { REGIONS } from '../domain/regions';
import type { GeoPoint } from '../domain/models';
import { TripController, type StartKind } from '../trip/TripController';
import { DEMO_DESTINATION, DEMO_ROUTE, DEMO_TOTAL_KM, pointAtKm } from '../vehicle/demoRoute';
import { useWide } from '../app/useWide';
import { RoadMap } from '../ui/RoadMap';
import { mapJsKey } from '../domain/models';
import { TripScene, type SceneId } from '../ui/scenes';
import { petLine } from './home/CarHome';
import { ASSUMED_AVG_KMH } from '../domain/plan';
import { Sheet, Switch, TopBar } from '../ui/components';
import { PetAvatar } from '../ui/Art';
import { SafetyCheck } from './SafetyCheck';
import { BASIS_LABEL, GUIDELINE_NOTE, resolveRestPolicy } from '../domain/restCare';
import { openCarPreview } from '../CarPreview';

export const DEMO_SPEEDS = [1, 10, 30, 60, 120, 300];

const formatHM = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

export default function TripSetup() {
  const { pets, settings, updateSettings, toast } = useStore();
  const [selected, setSelected] = useState<string[]>(pets[0] ? [pets[0].id] : []);
  const route = useRoute();
  const qDest = queryParam(route, 'dest');
  const fromNavi = queryParam(route, 'from') === 'navi';
  const fromCommunity = queryParam(route, 'from') === 'community';
  const qLat = Number(queryParam(route, 'lat')), qLng = Number(queryParam(route, 'lng'));
  // 데모 모드에서 '강릉'을 고르면 데모 경로 목적지(경포해변)로 맞춤
  const initial = (() => {
    if (qDest) {
      // 커뮤니티 게시글의 장소: 이름과 좌표를 그대로 목적지로(데모 경로 근처면 데모 목적지로 맞춤)
      if (Number.isFinite(qLat) && Number.isFinite(qLng) && qLat && qLng) {
        const pt = { latitude: qLat, longitude: qLng };
        if (settings.demoMode && Math.abs(qLat - DEMO_DESTINATION.point.latitude) < 0.06 && Math.abs(qLng - DEMO_DESTINATION.point.longitude) < 0.06) return { text: DEMO_DESTINATION.name, point: DEMO_DESTINATION.point };
        return { text: qDest, point: pt };
      }
      if (settings.demoMode && qDest === '강릉') return { text: DEMO_DESTINATION.name, point: DEMO_DESTINATION.point };
      const r = REGIONS.find((x) => x.name === qDest);
      if (r) return { text: r.name, point: r as GeoPoint };
    }
    return settings.demoMode ? { text: DEMO_DESTINATION.name, point: DEMO_DESTINATION.point } : { text: '', point: null };
  })();
  const [destText, setDestText] = useState(initial.text);
  const [dest, setDest] = useState<GeoPoint | null>(initial.point);
  const [restStops, setRestStops] = useState<{ atMin: number; atKm: number; place: Place | null }[]>([]);
  const [interval, setIntervalMin] = useState(() => (pets[0] ? resolveRestPolicy([pets[0]]).intervalMinutes : settings.defaultRestIntervalMinutes));
  const recordRoute = true;
  const [busy, setBusy] = useState(false);
  const [permSheet, setPermSheet] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const wide = useWide();
  // ?step=plan: '여행 계획'(출발 전 목적지·경로·휴식 계획)에서 진입 → 목적지 단계부터
  const [carStep, setCarStep] = useState<1 | 2 | 3>(queryParam(route, 'step') === 'plan' || pets.length <= 1 ? 2 : 1);
  const [carQ, setCarQ] = useState('');
  useEffect(() => { if (wide && pets.length === 0) navigate('/pet/new?first=1', { replace: true }); }, [wide, pets.length]);

  // 예상 휴식 계획: 데모 경로(서울→강릉)는 경로 거리로 추정, 그 외는 출발 위치를 알 수 없어 출발 후 계산
  const isDemoDest = settings.demoMode && dest && Math.abs(dest.latitude - DEMO_DESTINATION.point.latitude) < 0.05 && Math.abs(dest.longitude - DEMO_DESTINATION.point.longitude) < 0.05;
  const plan = isDemoDest ? planRests(DEMO_TOTAL_KM, interval, settings.skipRestNearArrival) : null;
  const dueKey = plan?.dueAtMinutes.join(',') ?? '';
  useEffect(() => {
    if (!plan) { setRestStops([]); return; }
    const provider = getPlaceProvider(settings.apiBaseUrl);
    let cancel = false;
    Promise.all(plan.dueAtMinutes.map(async (m) => {
      const km = (m / 60) * ASSUMED_AVG_KMH;
      const pt = pointAtKm(km);
      const found = await provider.search({ category: 'restArea', centers: [pt], radiusKm: 8 }).catch(() => [] as Place[]);
      const ranked = sortByDistance(found, pt).sort((a, b) => Number(!!(b.place.policy.smallDog || b.place.policy.largeDog)) - Number(!!(a.place.policy.smallDog || a.place.policy.largeDog)));
      return { atMin: m, atKm: km, place: ranked[0]?.place ?? null };
    })).then((r) => { if (!cancel) setRestStops(r); });
    return () => { cancel = true; };
  }, [dueKey, settings.apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const restPolicy = resolveRestPolicy(pets.filter((p) => selected.includes(p.id)));
  const basisNow = interval === restPolicy.intervalMinutes ? BASIS_LABEL[restPolicy.basis] : '보호자 조정';
  const restBasisBox = (
    <div className="rest-basis">
      <p className="b"><b>{interval}분</b> 간격 · {basisNow}{restPolicy.basis === 'vet' && interval !== restPolicy.intervalMinutes && <span className="warn"> (수의사 안내 {restPolicy.intervalMinutes}분과 달라요)</span>}</p>
      {restPolicy.reasons.slice(1).map((r) => <p key={r} className="t-cap">{r}</p>)}
      {restPolicy.basis === 'guideline' && interval === restPolicy.intervalMinutes && <p className="t-cap">{GUIDELINE_NOTE}</p>}
      {restPolicy.prompts.length > 0 && (
        <ul className="care-prompts">{restPolicy.prompts.map((pr) => <li key={pr.petId + pr.ruleId}>{pr.text}</li>)}</ul>
      )}
      <p className="t-cap">실제 피로도나 건강 상태를 측정한 값이 아니에요. 주행 시간 기준으로만 알려 드려요 · {settings.demoMode ? '데모 시뮬레이션 주행 시간' : '차량 연동 전이라 휴대폰 위치로 주행 시간을 계산해요'}</p>
    </div>
  );
  const togglePet = (id: string) => {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      // 선택한 반려견들의 적용 간격(수의사 안내 → 보호자 설정, 여러 마리면 가장 짧은 간격)
      const sel = pets.filter((p) => next.includes(p.id));
      if (sel.length) setIntervalMin(resolveRestPolicy(sel).intervalMinutes);
      return next;
    });
  };

  const start = async (kind: StartKind) => {
    if (selected.length === 0) {
      toast('함께 이동할 반려견을 선택해 주세요.', 'error');
      return;
    }
    setBusy(true);
    const res = await TripController.start({
      pets: pets.filter((p) => selected.includes(p.id)),
      destinationName: destText.trim() || null,
      destination: dest,
      restIntervalMinutes: interval,
      restPolicy: interval === restPolicy.intervalMinutes ? restPolicy
        : { ...restPolicy, intervalMinutes: interval, basis: 'guardian', reasons: [...restPolicy.reasons, `출발 전 보호자가 ${interval}분으로 조정`] },
      recordRoute,
      kind,
      demoSpeed: settings.demoSpeed,
      voice: settings.voiceGuidance,
    });
    setBusy(false);
    if (res.ok) {
      void updateSettings({ safetyChecks: [] }); // 다음 여행을 위해 안전 체크 초기화
      navigate('/trip/live', { replace: true });
      return;
    }
    if (res.reason === 'already-active') {
      toast(res.message);
      navigate('/trip/live', { replace: true });
    } else if (res.reason === 'permission-denied' || res.reason === 'unavailable' || res.reason === 'unsupported') {
      setPermSheet(res.message); // 오류 대신 수동 기록 모드 안내
    } else {
      toast(res.message, 'error');
    }
  };

  const kind: StartKind = settings.demoMode ? 'demo' : 'device-location';


  // ═══ 차량 화면: 시안 1 하단의 3단계(반려견 선택 → 목적지 설정 → 여행 준비 확인) ═══
  if (wide) {
    const COASTAL = ['강릉', '속초', '양양', '동해', '삼척', '부산', '제주', '서귀포', '여수', '태안', '포항', '통영', '경포'];
    const sceneOf = (name: string): SceneId => (COASTAL.some((c) => name.includes(c)) ? 'sea' : 'forest');
    type Cand = { key: string; name: string; sub: string; point: GeoPoint; demo?: boolean };
    const demoCand: Cand = { key: 'demo', name: DEMO_DESTINATION.name, sub: '강원 강릉시 · 데모 경로', point: DEMO_DESTINATION.point, demo: true };
    const q = carQ.trim();
    const regionCands: Cand[] = REGIONS.filter((r) => (q ? r.name.includes(q) || r.province.includes(q) : ['sokcho', 'yangpyeong', 'gapyeong', 'jeju'].includes(r.id))).slice(0, 6)
      .map((r) => ({ key: r.id, name: r.name, sub: r.province, point: r as GeoPoint }));
    const cands: Cand[] = [...(settings.demoMode && (!q || demoCand.name.includes(q) || '강릉'.includes(q)) ? [demoCand] : []), ...regionCands];
    const picked = (c: Cand) => !!dest && Math.abs(dest.latitude - c.point.latitude) < 0.01 && Math.abs(dest.longitude - c.point.longitude) < 0.01;
    const selPets = pets.filter((p) => selected.includes(p.id));
    const planned = isDemoDest ? DEMO_ROUTE : [];
    const mapMarkers = dest ? [{ id: 'dest', point: dest, kind: 'dest' as const, label: destText || '목적지' }] : [];
    const head = (
      <div className="cs-steps" aria-label="여행 준비 단계">
        {(['반려견 선택', '목적지 설정', '여행 준비 확인'] as const).map((t, i) => (
          <button key={t} className={`cs-step ${carStep === i + 1 ? 'on' : carStep > i + 1 ? 'done' : ''}`} onClick={() => (i + 1 < carStep) && setCarStep((i + 1) as 1 | 2 | 3)} disabled={i + 1 > carStep}>
            <span className="n">{carStep > i + 1 ? <Check size={14} strokeWidth={3} /> : i + 1}</span>{t}
          </button>
        ))}
        {settings.demoMode && <span className="badge sample" style={{ marginLeft: 'auto' }}><FlaskConical size={12} />데모 모드</span>}
      </div>
    );
    return (
      <div className="cs">
        {head}
        {carStep === 1 && (
          <section className="cs-panel">
            <h1 className="cs-title">이번 여행에 함께할 반려견을 선택해주세요</h1>
            <p className="cs-sub">여러 마리를 함께 선택할 수 있어요 · 선택한 반려견만 이번 여행 기록에 연결돼요</p>
            <div className="cs-pets">
              {pets.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} className={`cs-pet ${on ? 'on' : ''}`} onClick={() => togglePet(p.id)} aria-pressed={on}>
                    <PetAvatar uri={p.photoUri} size={104} />
                    <b>{p.name}</b><span>{petLine(p)}</span>
                    {on && <span className="chk"><Check size={18} strokeWidth={3} /></span>}
                  </button>
                );
              })}
              <button className="cs-pet add" onClick={() => navigate('/pet/new')}><span className="plus"><Plus size={30} /></span><span>반려견 추가</span></button>
            </div>
            <div className="cs-foot"><button className="cs-next" disabled={selected.length === 0} onClick={() => setCarStep(2)}>다음 <ChevronRight size={22} /></button></div>
          </section>
        )}
        {carStep === 2 && (
          <section className="cs-panel cs-dest">
            <div className="cs-col">
              <h1 className="cs-title">어디로 여행할까요?</h1>
              <div className="cs-search"><Search size={22} /><input value={carQ} onChange={(e) => setCarQ(e.target.value)} placeholder="목적지 검색 (지역)" aria-label="목적지 검색" />{carQ && <button className="icon-btn" aria-label="검색어 지우기" onClick={() => setCarQ('')}><X size={18} /></button>}</div>
              <p className="cs-note">장소 검색 API는 서버 연동 전이라 지역 단위로 검색해요{settings.demoMode ? ' · 강릉 경포해변은 데모 경로' : ''}</p>
              <div className="cs-list">
                {cands.length === 0 ? <p className="t-sub">검색 결과가 없어요. 다른 지역 이름으로 찾아보세요.</p> : cands.map((c) => (
                  <button key={c.key} className={`cs-item ${picked(c) ? 'on' : ''}`} onClick={() => { setDest(c.point); setDestText(c.name); }}>
                    <span className="th"><TripScene id={sceneOf(c.name)} thumb /></span>
                    <span className="grow"><b>{c.name}</b><small>{c.sub}</small></span>
                    <span className={`radio ${picked(c) ? 'on' : ''}`}>{picked(c) && <Check size={16} strokeWidth={3} />}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="cs-map">
              <RoadMap jsKey={mapJsKey(settings)} route={[]} plannedRoute={planned} markers={mapMarkers} height={460} ariaLabel="경로 미리보기" />
              <div className="cs-map-cap">{dest ? (plan ? <><b>{Math.round(DEMO_TOTAL_KM)}km</b> · 약 {formatHM(plan.drivingMinutes)} <span className="badge est">추정</span></> : <>예상 거리·시간은 출발 후 계산해요 <span className="badge gray">경로 미리보기 없음</span></>) : '목적지를 선택하면 경로를 보여드려요'}</div>
            </div>
            <div className="cs-foot wide"><button className="cs-back" onClick={() => setCarStep(1)}>이전</button><button className="cs-next" disabled={!dest} onClick={() => setCarStep(3)}>경로 확인하기 <ChevronRight size={22} /></button></div>
          </section>
        )}
        {carStep === 3 && (
          <section className="cs-panel cs-confirm">
            <h1 className="cs-title" style={{ textAlign: 'center' }}>여행 정보를 확인해주세요</h1>
            <div className="cf-top">
              <span className="cf-img"><TripScene id={sceneOf(destText)} /></span>
              <div className="grow">
                <p className="cf-name">{destText || '목적지 미정'} 여행</p>
                <p className="cf-meta">{plan ? <><Car size={18} />약 {Math.round(DEMO_TOTAL_KM)} km<Clock3 size={18} style={{ marginLeft: 14 }} />약 {formatHM(plan.drivingMinutes)} <span className="badge est">추정</span></> : '출발 후 실제 경로로 거리·시간을 계산해요'}</p>
                <div className="cf-pets">{selPets.map((p) => <span key={p.id}><PetAvatar uri={p.photoUri} size={34} />{p.name}</span>)}</div>
                {plan && <p className="cf-plan" data-testid="rest-plan"><PawPrint size={16} />예상 휴식 {plan.minRests === plan.maxRests ? plan.minRests : `${plan.minRests}~${plan.maxRests}`}회 <span className="badge est">추정</span>{restStops[0]?.place ? ` · 추천 휴식지 ${restStops[0].place.name}${restStops[0].place.isSample ? '(샘플)' : ''}` : ''}</p>}
              </div>
            </div>
            <div className="cf-rows">
              <div className="cf-row">
                <PawPrint size={22} color="var(--primary)" /><b>휴식 알림</b>
                <div className="grow cf-iv">
                  {[60, 90, 120].map((m) => <button key={m} className={`chip ${interval === m ? 'on' : ''}`} onClick={() => setIntervalMin(m)}>{m}분{m === 90 ? ' (기본)' : ''}</button>)}
                  <span className="cf-custom"><button className="icon-btn" aria-label="5분 줄이기" onClick={() => setIntervalMin(Math.max(30, interval - 5))}>−</button><b className="num">{interval}분</b><button className="icon-btn" aria-label="5분 늘리기" onClick={() => setIntervalMin(Math.min(240, interval + 5))}>+</button></span>
                </div>
              </div>
              {restBasisBox}
              <div className="cf-row">
                <Route size={22} color="var(--primary)" /><b>경유지 추천</b>
                <span className="grow t-cap">경로 근처 반려견 동반 장소를 지도 아래에 추천해요</span>
                <Switch checked={settings.autoRecommend} onChange={(v) => updateSettings({ autoRecommend: v })} label="경유지 추천" />
              </div>
              {settings.demoMode && (
                <div className="cf-row">
                  <FlaskConical size={22} color="var(--primary)" /><b>데모 배속</b>
                  <div className="grow cf-iv">{DEMO_SPEEDS.map((sp) => <button key={sp} className={`chip ${settings.demoSpeed === sp ? 'on' : ''}`} onClick={() => updateSettings({ demoSpeed: sp })}>{sp}배속</button>)}</div>
                </div>
              )}
              <div className="cf-row">
                <ShieldCheck size={22} color="var(--primary)" /><b>출발 전 안전 체크</b>
                <span className="grow t-cap">{settings.safetyChecks.length}/{SAFETY_ITEMS.length} 확인</span>
                <button className="btn ghost sm" onClick={() => setSafetyOpen(true)}>확인하기</button>
              </div>
            </div>
            <div className="cs-foot wide"><button className="cs-back" onClick={() => setCarStep(2)}>이전</button><button className="cs-next" disabled={busy || selected.length === 0} onClick={() => start(kind)}>{busy ? '준비 중…' : '여행 시작하기'} <ChevronRight size={22} /></button></div>
          </section>
        )}
        <Sheet open={safetyOpen} onClose={() => setSafetyOpen(false)} labelledBy="safety-title"><SafetyCheck /></Sheet>
        <Sheet open={!!permSheet} onClose={() => setPermSheet(null)} labelledBy="perm-title">
          <h2 id="perm-title" className="h-md">위치를 사용할 수 없어요</h2>
          <p className="t-sub mt-8">{permSheet}</p>
          <button className="btn primary block mt-16" onClick={() => { setPermSheet(null); void start('manual'); }}>수동 기록으로 시작</button>
        </Sheet>
      </div>
    );
  }

  // ═══ 휴대폰 화면: 여행 시작·주행 기록은 차량 앱에서만(휴대폰은 여행지 기록·커뮤니티·기록 보기) ═══
  const openInCar = () => { openCarPreview(); };
  return (
    <div className="screen no-nav">
      <TopBar title="새 여행" right={settings.demoMode ? <span className="badge sample" style={{ marginRight: 8 }}><FlaskConical size={12} />데모 모드</span> : undefined} />
      <section className="car-only" data-testid="car-only-setup">
        <span className="ic"><Car size={34} /></span>
        <h1 className="h-lg">여행은 차량에서 시작해요</h1>
        <p className="t-sub">Pleos Connect 차량의 멍로드에서 함께 탈 반려견과 목적지를 고르면 주행 기록, 맞춤 휴식 알림, 동반 장소 제안이 시작돼요.</p>
        {destText && (
          <div className="car-only-dest">
            <MapPin size={18} color="var(--primary)" />
            <span className="grow"><b>{destText}</b><small>{fromCommunity ? '커뮤니티에서 고른 목적지' : fromNavi ? '차량 내비 목적지(데모)' : '목적지'} · 차량 앱에서 이어서 고를 수 있어요</small></span>
          </div>
        )}
        <ul className="car-only-list">
          <li><b>차량에서</b> 출발 · 주행 기록 · 휴식 알림 · 집으로 오는 길</li>
          <li><b>휴대폰에서</b> 여행지 사진·메모·방문 장소 · 여행 기록 보기 · 커뮤니티</li>
        </ul>
        {settings.demoMode && <button className="btn primary block xl" onClick={openInCar}><Car size={20} />차량 화면에서 시작하기 (데모)</button>}
        <button className="btn ghost block" onClick={() => navigate('/home')}>홈으로</button>
        {settings.demoMode && <p className="t-cap" style={{ textAlign: 'center' }}>데모: 같은 앱을 차량 화면(1600×900)으로 열어요. 실제로는 차량 앱과 휴대폰 앱이 계정으로 연결돼요.</p>}
      </section>
    </div>
  );
}
