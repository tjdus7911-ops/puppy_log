// SCREEN 01 — 주행 중 메인 대시보드 (시안: 좌 반려견 카드 | 중앙 지도 | 우 휴식 장소 추천 + 음성 명령)
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BellRing, BookOpen, Camera, Car, Check, ChevronRight, CircleParking, Clock, Coffee, Flag, FlaskConical, Fuel, Lock, MapPin, MapPinned, Mic, Navigation, PawPrint, Route, Sparkles, Stethoscope,
  Satellite, Timer, TriangleAlert,
} from 'lucide-react';
import { TripController } from '../trip/TripController';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { useWide } from '../app/useWide';
import { formatClock, formatDuration, formatKm } from '../domain/format';
import { regionLabel } from '../domain/regions';
import { callName, josa, petNames as joinNames } from '../domain/tripText';
import { haversineKm } from '../domain/geo';
import { aheadOnRoute } from '../domain/autoReco';
import { mapJsKey, newId, PET_SIZE_LABEL, type GeoPoint, type PlaceCategory } from '../domain/models';
import { repo } from '../data/db';
import { DEMO_RETURN_ROUTE, DEMO_ROUTE, DEMO_ROUTES } from '../vehicle/demoRoute';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { openNavigation } from '../places/navigation';
import { getTrafficProvider, hazardsAhead, HAZARD_LABEL, HAZARD_VOICE, type Hazard, type HazardType } from '../traffic/TrafficInfoProvider';
import { routeSnapshot } from '../nav/NavigationProvider';
import { listenOnce, parseIntent, speechRecognitionSupported, type VoiceIntent } from '../trip/voice';
import { speak } from '../trip/speech';
import { completeTripWithDraft } from '../trip/completeTrip';
import { EmptyState, Hint, Loading, Sheet } from '../ui/components';
import { PetAvatar, PlaceThumb } from '../ui/Art';
import { JourneyBar, PhotoFallback } from '../ui/kit';
import { regionShort } from '../domain/regions';
import { RoadMap } from '../ui/RoadMap';
import type { MapMarker } from '../ui/MapView';
import { DEMO_SPEEDS } from './TripSetup';
import { AutoSuggest } from './AutoSuggest';
import { addPhotosToTrip } from '../app/photos';
import { RestIntervalPicker } from './PetForm';
import { openCarPreview } from '../CarPreview';

const STATUS = {
  driving: { label: '주행 중', icon: Car },
  stopped: { label: '일시 정차', icon: CircleParking },
  resting: { label: '휴식 중', icon: Coffee },
  ended: { label: '여행 종료', icon: Flag },
};

export const HAZARD_COLOR: Record<HazardType, string> = {
  accident: '#EF5350', construction: '#F5A623', debris: '#F2C230', congestion: '#8E6BD6', weather: '#5BA4D9', other: '#74849A',
};

const formatHM = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
const formatKmNum = (km: number) => (km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(/\.0$/, ''));
const shortDest = (name: string) => name.split(' ')[0];
/** 이번 여행에 함께하는 반려견 프로필(겹친 아바타). 3마리 넘으면 +N */
function PetStack({ pets, names, size }: { pets: { id: string; name: string; photoUri: string | null }[]; names: string[]; size: number }) {
  const list = pets.length ? pets : names.map((n) => ({ id: n, name: n, photoUri: null }));
  const shown = list.slice(0, 3);
  return (
    <span className="pet-stack" style={{ height: size }} aria-label={`함께하는 반려견: ${list.map((p) => p.name).join(', ')}`}>
      {shown.map((p, i) => <span key={p.id} className="ps" style={{ marginLeft: i ? -size * 0.36 : 0, zIndex: 10 - i }}><PetAvatar uri={p.photoUri} size={size} /></span>)}
      {list.length > 3 && <span className="ps more" style={{ width: size, height: size, marginLeft: -size * 0.36 }}>+{list.length - 3}</span>}
    </span>
  );
}

function regionShortLabel(p: GeoPoint | null, fallback: string) { const r = p ? regionShort(p) : ''; return r && r !== '알 수 없음' ? r : fallback; }

function withPets(names: string[]) {
  const w = joinNames(names.length ? names : ['우리 강아지']);
  return `${w}${josa(w, '과', '와')}`;
}

/** 휴식 장소 추천 순위: 경로에서 덜 벗어나고, 가깝고, 동반 가능이 확인된 곳, 산책·휴식 공간 우선 */
export interface RouteRec { place: Place; distanceKm: number; detourKm: number | null; extraMin: number | null; aheadKm: number | null }

/** 경로 기준 추천 순위. 계획 경로가 있으면 지나간 장소는 빼고 경로 이탈 거리·추가 시간(왕복, 평균 40km/h 추정)을 계산 */
function rankPlaces(places: Place[], current: GeoPoint, planned: GeoPoint[]): RouteRec[] {
  const seen = new Set<string>();
  return places
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => {
      const dist = haversineKm(current, p);
      const on = planned.length > 1 ? aheadOnRoute(planned, current, p) : null;
      if (planned.length > 1 && !on) return null; // 이미 지나간 쪽
      const detour = on ? on.detourKm : null;
      let score = (detour ?? dist) * 2 + dist;
      if (p.policy.smallDog === true || p.policy.largeDog === true) score -= 1.5;
      if (p.category === 'restArea' || p.category === 'park') score -= 1;
      return { place: p, distanceKm: dist, detourKm: detour, extraMin: detour != null ? Math.max(1, Math.round((detour * 2) / 40 * 60)) : null, aheadKm: on ? on.aheadKm : null, score };
    })
    .filter((x): x is RouteRec & { score: number } => !!x)
    .sort((a, b) => a.score - b.score);
}

export default function TripLive() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { pets, settings, toast, reload } = useStore();
  const wide = useWide();
  const [restSheet, setRestSheet] = useState<PlaceCategory[] | null>(null);
  const [endSheet, setEndSheet] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [hzSheet, setHzSheet] = useState(false);
  const [mapTab, setMapTab] = useState<'route' | 'near'>('route');
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [moreRecs, setMoreRecs] = useState(false);
  const [intervalSheet, setIntervalSheet] = useState(false);
  const [arrivePromptOff, setArrivePromptOff] = useState(false);
  const [hazards, setHazards] = useState<{ list: Hazard[]; error: string | null }>({ list: [], error: null });
  const [recs, setRecs] = useState<RouteRec[]>([]);
  const [voice, setVoice] = useState<{ listening: boolean; text: string | null }>({ listening: false, text: null });
  const spoken = useRef(new Set<string>());
  const [voiceReq, setVoiceReq] = useState<{ n: number; category: PlaceCategory | null }>({ n: 0, category: null });
  const recCenter = useRef<GeoPoint | null>(null);

  const isDemo = live.kind === 'demo';
  const traffic = useMemo(() => (live.active ? getTrafficProvider(isDemo, settings.apiBaseUrl) : null), [live.active, isDemo, settings.apiBaseUrl]);
  const placeProvider = useMemo(() => getPlaceProvider(settings.apiBaseUrl), [settings.apiBaseUrl]);

  useEffect(() => {
    if (live.lastError) { toast(live.lastError, 'error'); TripController.clearError(); }
  }, [live.lastError, toast]);

  // 도로 위험 정보: 시작 시 + 5분마다 (데이터가 없으면 아무것도 만들지 않음)
  const area = isDemo ? DEMO_ROUTE : [live.position, live.trip?.destination].filter(Boolean) as GeoPoint[];
  const areaKey = area.length ? `${area[0].latitude.toFixed(1)},${area[0].longitude.toFixed(1)}` : '';
  useEffect(() => {
    if (!traffic || !areaKey) return;
    const ac = new AbortController();
    const load = () => traffic.hazards(area, ac.signal).then((list) => setHazards({ list, error: null })).catch((e) => { if (e.name !== 'AbortError') setHazards((h) => ({ ...h, error: (e as Error).message })); });
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => { ac.abort(); clearInterval(t); };
  }, [traffic, areaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전방 3km 이내 위험 정보는 한 번만 간결하게 음성 안내(팝업 없음)
  const ahead = useMemo(() => hazardsAhead(hazards.list, live.position, live.route, 30), [hazards.list, live.position, live.route]);
  useEffect(() => {
    if (!settings.voiceGuidance || !live.position) return;
    // 안내 시점: 차속에 따라 약 90초 전(최소 1.5km, 최대 4km). 같은 위험 정보는 한 번만.
    const kmh = live.engine?.lastFix && live.route.length > 1 ? 90 : 60;
    const announceKm = Math.max(1.5, Math.min(4, (kmh * 90) / 3600));
    for (const h of ahead) {
      if (spoken.current.has(h.id) || haversineKm(live.position, h) > announceKm) continue;
      spoken.current.add(h.id);
      speak(`${h.provenance === 'demo' ? '데모 정보입니다. ' : ''}${HAZARD_VOICE[h.type]}`);
      break;
    }
  }, [ahead, live.position, settings.voiceGuidance]);

  // 근처 휴식 장소 추천: 위치가 5km 이상 바뀌면 갱신
  // (위치 샘플마다 검색을 취소하지 않도록, 진행 중인 검색이 있으면 건너뛰고 화면을 떠날 때만 무시)
  const recBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    const pos = live.position;
    if (!pos || recBusy.current) return;
    if (recCenter.current && haversineKm(recCenter.current, pos) < 5) return;
    recBusy.current = true;
    Promise.all((['restArea', 'cafe', 'park', 'restaurant'] as PlaceCategory[]).map((c) => placeProvider.search({ category: c, centers: [pos], radiusKm: 15 }).catch(() => [] as Place[])))
      .then((r) => {
        if (!mounted.current) return;
        recCenter.current = pos;
        const plannedNow = isDemo ? (live.legKind === 'return' ? DEMO_RETURN_ROUTE : live.legKind === 'extra' ? DEMO_ROUTES.local.points : DEMO_ROUTE) : [];
        setRecs(rankPlaces(r.flat(), pos, plannedNow).slice(0, 10));
      })
      .finally(() => { recBusy.current = false; });
  }, [live.position, placeProvider, isDemo]);

  if (live.active && !live.driving && live.phase === 'at-destination') {
    return (
      <div className="screen no-nav">
        <EmptyState title="여행지 활동 중이에요" desc="주행 기록은 멈춰 있어요. 여행지 활동 화면에서 사진·장소·메모를 남기거나 돌아가는 길 기록을 시작하세요." action={<button className="btn primary" onClick={() => navigate('/home', { replace: true })}>여행지 활동으로</button>} />
      </div>
    );
  }
  if (!live.active || !live.engine || !live.trip) {
    return (
      <div className="screen no-nav">
        <EmptyState title="진행 중인 여행이 없어요" desc="여행을 시작하면 이곳에 주행 대시보드가 나타나요." action={<button className="btn primary" onClick={() => navigate('/trip/setup', { replace: true })}>여행 시작하기</button>} />
      </div>
    );
  }

  const e = live.engine;
  const driving = e.status === 'driving';
  const resting = e.status === 'resting';
  const tripPets = pets.filter((p) => live.petNames.includes(p.name));
  const mainPet = callName(live.petNames[0] ?? '우리 강아지');
  const left = live.secondsUntilRest;
  const restElapsed = resting && e.restStartedAt ? (e.lastTick - e.restStartedAt) / 1000 : 0;
  const St = STATUS[e.status];
  const isReturn = live.legKind === 'return';
  const isExtra = live.legKind === 'extra';
  const route = isExtra
    ? { destinationName: '여행지 내 다음 장소', remainingKm: null, remainingKind: null, etaMinutes: null, etaEstimated: true, provenance: 'app' as const }
    : routeSnapshot({ isDemo, direction: isReturn ? 'return' : 'outbound', destinationName: live.trip.destinationName, destination: live.trip.destination, current: live.position, drivenKm: e.distanceKm, drivingSec: e.drivingSec });
  // 동반 불가로 확인된 곳은 추천하지 않음(정보 없음은 '확인 필요'로 표시)
  const petRecs = recs.filter((r) => !(r.place.policy.smallDog === false && r.place.policy.largeDog === false));
  const visibleRecs = driving ? petRecs.slice(0, 3) : petRecs;

  /** 가는 길: 목적지 도착(여행 계속) */
  const arrive = async () => {
    setEnding(true);
    const ok = await TripController.arrive();
    setEnding(false);
    setEndSheet(false);
    if (ok) { await reload(); toast('목적지에 도착했어요. 여행지에서의 순간도 기록해 보세요.'); navigate('/home', { replace: true }); }
  };
  /** 여행 완료(복귀 도착 또는 바로 마무리) */
  const finish = async () => {
    setEnding(true);
    const id = await completeTripWithDraft(settings.apiBaseUrl);
    setEnding(false);
    setEndSheet(false);
    if (id) { await reload(); navigate(`/album/${id}?new=1`, { replace: true }); }
  };

  const runIntent = (intent: VoiceIntent, heard: string | null) => {
    let answer = '';
    if (intent === 'rest-left') answer = resting ? '지금은 휴식 중이에요.' : `다음 휴식까지 ${formatDuration(Math.max(0, left))} 남았어요.`;
    // 주행 중에는 목록 대신 경로 앞쪽 한 곳을 추천 카드로, 정차 중에는 목록 시트로
    else if (intent === 'rest-area') { answer = '가까운 휴게소를 찾아볼게요.'; if (driving) setVoiceReq((v) => ({ n: v.n + 1, category: 'restArea' })); else setRestSheet(['restArea', 'park']); }
    else if (intent === 'cafe') { answer = `${mainPet}와 갈 수 있는 카페를 찾아볼게요. 동반 가능 여부는 방문 전 확인해 주세요.`; if (driving) setVoiceReq((v) => ({ n: v.n + 1, category: 'cafe' })); else setRestSheet(['cafe']); }
    else answer = '잘 알아듣지 못했어요. "가까운 휴게소 찾아줘"처럼 말해 주세요.';
    speak(answer);
    setVoice({ listening: false, text: `${heard ? `“${heard}” → ` : ''}${answer}` });
  };

  const onVoice = async () => {
    if (!speechRecognitionSupported()) { runIntent('rest-area', '가까운 휴게소 찾아줘 (데모)'); return; }
    setVoice({ listening: true, text: '듣고 있어요…' });
    try {
      const heard = await listenOnce();
      runIntent(parseIntent(heard), heard);
    } catch (err) {
      const m = (err as Error).message;
      setVoice({ listening: false, text: m === 'not-allowed' ? '마이크 권한이 없어요. 데모 명령으로 실행할게요.' : '음성을 인식하지 못했어요. 데모 명령으로 실행할게요.' });
      runIntent('rest-area', '가까운 휴게소 찾아줘 (데모)');
    }
  };

  const markers: MapMarker[] = [
    ...(!isReturn && !isExtra && live.trip.destination ? [{ id: 'dest', point: live.trip.destination, kind: 'dest' as const, label: '목적지' }] : []),
    ...(isReturn && isDemo ? [{ id: 'home', point: DEMO_ROUTE[0], kind: 'dest' as const, label: '집' }] : []),
    ...hazards.list.map((h) => ({ id: h.id, point: h, kind: 'hazard' as const, color: HAZARD_COLOR[h.type], label: HAZARD_LABEL[h.type] })),
    ...(!wide || mapTab === 'near' ? visibleRecs.slice(0, wide ? 6 : 3).map(({ place }) => ({ id: place.id, point: place, kind: 'rec' as const, label: place.name })) : []),
    ...recs.filter((r) => waypoints.includes(r.place.id)).map(({ place }) => ({ id: `wp-${place.id}`, point: place, kind: 'place' as const, label: `경유지 · ${place.name}` })),
    ...(live.position ? [{ id: 'cur', point: live.position, kind: 'current' as const }] : []),
  ];


  // ── 여정 진행: 이동 거리 + 남은 거리(데모: 경로 기준 추정, 실제: 직선) / 다음 휴식 예정 지점(평균 속도로 추정)
  const remain = route.remainingKm;
  const totalKm = remain != null ? e.distanceKm + remain : null;
  const progress = totalKm && totalKm > 0 ? e.distanceKm / totalKm : null;
  const avgKmh = e.drivingSec > 120 ? e.distanceKm / (e.drivingSec / 3600) : 60;
  const restAheadKm = !resting && left > 0 ? (left / 3600) * avgKmh : null;
  const restAt = totalKm && restAheadKm != null ? (e.distanceKm + restAheadKm) / totalKm : null;
  const fromLabel = isReturn ? (live.trip.destinationName ?? '여행지') : regionShortLabel(live.trip.startLocation, isDemo ? '서울' : '출발');
  const toLabel = isReturn ? (isDemo ? '서울' : '집') : isExtra ? '다음 장소' : (live.trip.destinationName ?? '목적지');
  const lastRest = e.restCount === 0
    ? `출발 후 아직 쉬지 않았어요 · 연속 주행 ${formatDuration(e.drivingSinceRestSec)}`
    : `휴식 ${e.restCount}회 (총 ${formatDuration(e.restTotalSec)}) · 마지막 휴식 후 ${formatDuration(e.drivingSinceRestSec)} 주행`;
  const headline = `${withPets(live.petNames)} ${isReturn ? '돌아가는 중' : isExtra ? '이동 중' : `${live.trip.destinationName ? `${shortDest(live.trip.destinationName)} ` : ''}가는 중`}`;
  const routeLine = [route.remainingKm != null ? `${route.destinationName ?? toLabel}까지 ${formatKm(route.remainingKm)}${route.remainingKind === 'straight' ? '(직선)' : ''}` : null,
    route.etaMinutes != null ? `약 ${formatDuration(route.etaMinutes * 60)} 남음${route.etaEstimated ? '(추정)' : ''}` : null].filter(Boolean).join(' · ') || (isReturn ? '돌아오는 길 기록 중' : '가는 길 기록 중');
  const firstHz = ahead[0] ?? null;
  const hzPill = !traffic ? (
    <span className="hz-pill"><span className="ic"><TriangleAlert size={16} /></span>도로 위험 정보 미연동</span>
  ) : (
    <button className="hz-pill" onClick={() => !driving && setHzSheet(true)} aria-label="도로 위험 정보">
      <span className="ic" style={firstHz ? { background: HAZARD_COLOR[firstHz.type] + '22', color: HAZARD_COLOR[firstHz.type] } : { background: 'var(--bg)', color: 'var(--text-3)' }}><TriangleAlert size={16} /></span>
      <span className="ellipsis">{firstHz && live.position ? `${formatKm(haversineKm(live.position, firstHz))} 앞 ${HAZARD_LABEL[firstHz.type]}${firstHz.lanes ? ` · ${firstHz.lanes}` : ''}` : '전방 위험 정보 없음'}</span>
      {traffic.provenance === 'demo' && <span className="badge sample">데모</span>}
      {hazards.error && <span className="badge warn" title={hazards.error}>오류</span>}
    </button>
  );
  const planned = isDemo ? (isReturn ? DEMO_RETURN_ROUTE : isExtra ? DEMO_ROUTES.local.points : DEMO_ROUTE) : [];
  const mapEl = live.kind === 'manual' ? (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
      <EmptyState kind="empty-place" title="위치 없이 기록 중이에요" desc="수동 기록 모드에서는 지도와 경로가 표시되지 않아요." />
    </div>
  ) : (
    <RoadMap jsKey={mapJsKey(settings)} route={live.route} plannedRoute={planned} markers={markers} height={wide ? 760 : 380} follow={live.position} allowTrafficLayer ariaLabel="실시간 이동 경로 지도" />
  );
  const restTile = resting
    ? { k: '휴식 시간', v: formatClock(restElapsed), u: '' }
    : left <= 0 ? { k: '다음 휴식', v: '지금', u: '' } : { k: '다음 휴식', v: String(Math.max(1, Math.round(left / 60))), u: '분' };
  const drivingTile = { k: '주행 시간', v: formatHM(e.drivingSec), u: '' };
  const distTile = { k: '이동 거리', v: live.kind === 'manual' ? '—' : formatKmNum(e.distanceKm), u: live.kind === 'manual' ? '' : 'km' };
  const tiles = (
    <>
      {[drivingTile, distTile].map((t) => <div key={t.k} className="tile3"><p className="k">{t.k}</p><p className="v">{t.v}{t.u && <small>{t.u}</small>}</p></div>)}
      <div className={`tile3 ${resting || left > 0 ? 'rest' : 'alert'}`}><p className="k">{restTile.k}</p><p className="v">{restTile.v}{restTile.u && <small>{restTile.u}</small>}</p></div>
    </>
  );
  const restAction = resting ? (
    <button className="action accent" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}><Timer size={20} />휴식 종료</button>
  ) : (
    <button className="action accent" disabled={driving && !isDemo} onClick={() => TripController.beginRest()} aria-describedby={driving ? 'drive-lock' : undefined}><Coffee size={20} />휴식 시작</button>
  );
  const arriveAction = <button className="action primary" onClick={() => setEndSheet(true)}><Flag size={20} />{isReturn ? '집 도착 · 여행 완료' : isExtra ? '도착 · 여행지 활동' : '목적지 도착'}</button>;
  const notices = (
    <>
      {live.gpsLost && <div className="hint red"><Satellite size={16} /><div>GPS 신호가 약해요. 신호가 돌아오면 경로를 이어서 기록해요. 끊긴 동안의 주행 시간·거리는 추정하지 않아요.</div></div>}
      {live.arrived && <Hint tone="green">{isReturn ? '집 근처에 도착했어요. ‘집 도착 · 여행 완료’를 누르면 여행이 완료돼요.' : '목적지 근처에 도착했어요. ‘목적지 도착’을 누르면 여행지 활동을 기록할 수 있어요(여행은 계속돼요).'}</Hint>}
      {live.kind === 'manual' && (
        <div className="seg" role="radiogroup" aria-label="이동 상태">
          <button className={live.manualMotion === 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('moving')} style={{ height: 52, fontSize: 16 }}>주행 중</button>
          <button className={live.manualMotion !== 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('stopped')} style={{ height: 52, fontSize: 16 }}>정차</button>
        </div>
      )}
    </>
  );
  const details = (
    <>
      <button className="link" onClick={() => setShowMore((v) => !v)} style={{ alignSelf: 'center', justifySelf: 'center', fontSize: 12.5 }}>
        <span className="live-dot" style={{ marginRight: 8, width: 8, height: 8 }} />여행 기록 상태 {showMore ? '접기' : '보기'}
      </button>
      {showMore && (
        <div className="card" style={{ fontSize: 14 }}>
          <ul className="t-sub" style={{ margin: 0, paddingLeft: 18 }}>
            <li>데이터 출처: {isDemo ? '데모 시뮬레이션' : live.kind === 'manual' ? '수동 기록' : '기기 위치(GPS)'}</li>
            <li>{live.recordRoute ? `경로 점 ${live.route.length}개 저장` : '경로 저장 안 함'}</li>
            <li>걸러낸 비정상 좌표 {e.rejectedFixes}개 (순간 이동·낮은 정확도·0,0 좌표)</li>
            <li>전체 여행 시간 {formatClock(e.elapsedSec)} · 휴식 {e.restCount}회 · 알림 간격 {e.restIntervalMin}분</li>
            <li>현재 위치 {live.position ? regionLabel(live.position) : '확인 중'}</li>
          </ul>
          {isDemo && (
            <>
              <p style={{ fontWeight: 600 }} className="mt-16">시뮬레이션 속도</p>
              <div className="chips mt-8">{DEMO_SPEEDS.map((sp) => <button key={sp} className={`chip ${live.demoSpeed === sp ? 'on' : ''}`} onClick={() => TripController.setDemoSpeed(sp)}>{sp}배속</button>)}</div>
            </>
          )}
        </div>
      )}
    </>
  );
  const voiceChips = (
    <div className="chips" style={{ justifyContent: 'center', gap: 6 }}>
      {(['rest-area', 'cafe', 'rest-left'] as VoiceIntent[]).map((it) => (
        <button key={it} className="chip" style={{ fontSize: 12.5, minHeight: 30, padding: '0 10px' }} onClick={() => runIntent(it, null)}>
          {it === 'rest-area' ? '가까운 휴게소' : it === 'cafe' ? `${mainPet}랑 갈 카페` : '다음 휴식까지?'}
        </button>
      ))}
    </div>
  );
  const suggest = <div className="reco-slot"><AutoSuggest live={live} settings={settings} planned={planned} voiceRequest={voiceReq} toast={toast} /></div>;
  const lockText = driving ? (isDemo ? '주행 중에는 사진·일기 편집이 잠겨요 (데모: 휴식 시작은 휴게소 진입으로 처리)' : '주행 중에는 휴식 시작·사진·일기 편집이 잠겨요') : '정차 중 · 장소 상세와 기록 편집을 이용할 수 있어요';

  // ── 공통: 다음 휴식지 추천 · 경유지 · 도착 감지 ──
  const petLabel = (p: Place) => (p.policy.smallDog === true || p.policy.largeDog === true ? { t: '동반 가능', c: 'ok' } : { t: '확인 필요', c: 'check' });
  const addWaypoint = (r: RouteRec) => {
    if (waypoints.includes(r.place.id)) { setWaypoints((w) => w.filter((x) => x !== r.place.id)); toast(`‘${r.place.name}’ 경유지를 뺐어요.`); return; }
    if (r.place.isSample || isDemo) {
      setWaypoints((w) => [...w, r.place.id]);
      toast(`‘${r.place.name}’을 경유지로 추가했어요 (데모 · 실제 차량에서는 Pleos 내비 경유지로 전달돼요)`);
      return;
    }
    const res = openNavigation(r.place.name, r.place.latitude, r.place.longitude, false);
    if (res.ok) { setWaypoints((w) => [...w, r.place.id]); toast('지도 앱에서 경유지 안내를 열었어요. 웹에서는 경유지 자동 추가가 지원되지 않아요.'); }
    else toast(res.message!, 'error');
  };
  const recCard = (r: RouteRec) => {
    const pl = petLabel(r.place);
    const on = waypoints.includes(r.place.id);
    return (
      <div key={r.place.id} className={`rr-card ${on ? 'on' : ''}`}>
        <span className="rr-ph">{r.place.imageUri ? <img src={r.place.imageUri} alt="" /> : <PlaceThumb category={r.place.category} size="100%" radius={12} />}</span>
        <div className="rr-tx">
          <p className="n ellipsis">{r.place.name}{r.place.isSample && <span className="badge sample" style={{ height: 16, fontSize: 10, marginLeft: 4, padding: '0 4px' }}>샘플</span>}</p>
          <p className="m num">{r.detourKm != null ? `경로 이탈 ${formatKm(r.detourKm)} · 약 ${r.extraMin}분 추가` : `${formatKm(r.distanceKm)} · 추가 시간 추정 불가`}</p>
          <span className={`pet-ok ${pl.c}`}>{pl.c === 'ok' ? '🐾 ' : ''}{pl.t}</span>
        </div>
        <button className={`rr-go ${on ? 'on' : ''}`} onClick={() => addWaypoint(r)} aria-label={`${r.place.name} ${on ? '경유지 빼기' : '경유지 추가'}`} title={on ? '경유지 빼기' : '경유지 추가'}>
          {on ? <Check size={18} /> : <Navigation size={18} />}
        </button>
      </div>
    );
  };
  const openMore = () => {
    if (driving && !isDemo) { toast('주행 중에는 추천 3곳만 보여드려요. 정차하거나 휴식 중에 전체 목록을 확인해 주세요.'); return; }
    setMoreRecs(true);
  };
  const recSection = (
    <section className="rr" aria-label="다음 휴식지 추천">
      <div className="rr-hd">
        <p className="t"><MapPin size={17} color="var(--primary)" />다음 휴식지 추천</p>
        <p className="s">경로 근처 반려견 동반 장소{placeProvider.isSample ? ' · 샘플 데이터' : ''}</p>
        <button className="rr-more" onClick={openMore}>더보기<ChevronRight size={15} /></button>
      </div>
      <div className="rr-list">
        {!live.position ? <p className="t-sub">위치를 확인하면 추천해 드려요.</p> : petRecs.length === 0 ? <p className="t-sub">경로 근처에서 추천할 장소를 찾는 중이에요.</p> : petRecs.slice(0, 3).map(recCard)}
      </div>
    </section>
  );
  const arrivePrompt = live.arrived && !arrivePromptOff && !endSheet && (
    <div className="arrive-prompt" role="alert">
      <span className="ic"><Flag size={20} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="t">{isReturn ? '집 근처에 도착했어요' : '목적지 근처에 도착했어요'}</p>
        <p className="s">GPS 위치 기준 감지 · 내비 도착 이벤트는 차량 연동 후 자동으로 받아요</p>
      </div>
      <button className="btn sm ghost" onClick={() => setArrivePromptOff(true)}>계속 주행</button>
      <button className="btn sm primary" onClick={() => { setArrivePromptOff(true); setEndSheet(true); }}>{isReturn ? '여행 완료' : '목적지 도착'}</button>
    </div>
  );

  if (wide) {
    // 휴식 알림 진행률(피로도 측정이 아니라 알림 시간 진행률)
    const intervalSec = e.restIntervalMin * 60;
    const gaugePct = resting ? 1 : Math.min(1, e.drivingSinceRestSec / Math.max(1, intervalSec));
    const gaugeTone = resting ? 'rest' : left <= 0 ? 'due' : left <= 10 * 60 ? 'soon' : '';
    const R = 18; const C = 2 * Math.PI * R;
    const pet = tripPets[0];
    const destTitle = isReturn ? '집으로' : isExtra ? '여행지 안 이동' : `${shortDest(live.trip.destinationName ?? '목적지')}${live.trip.destinationName ? '으로' : ''}`;
    const etaAt = route.etaMinutes != null ? new Date(e.lastTick + route.etaMinutes * 60_000) : null;
    const etaClock = etaAt ? etaAt.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : null;
    const restText = resting ? `휴식 중 · ${formatClock(restElapsed)}` : left <= 0 ? '지금 쉬어 갈 시간이에요' : `다음 휴식까지 ${Math.max(1, Math.round(left / 60))}분`;
    const stats: [string, string, string?][] = [
      ['이동 거리', live.kind === 'manual' ? '—' : formatKmNum(e.distanceKm), live.kind === 'manual' ? '' : 'km'],
      ['주행 시간', formatHM(e.drivingSec)],
      ['휴식 횟수', String(e.restCount), '회'],
      ['연속 주행', formatHM(e.drivingSinceRestSec)],
    ];
    const navAction = () => {
      const d = isReturn ? (isDemo ? DEMO_ROUTE[0] : null) : live.trip?.destination ?? null;
      if (!d) { toast('목적지 좌표가 없어 내비게이션을 열 수 없어요.', 'error'); return; }
      if (isDemo) { toast('데모 · 실제 차량에서는 Pleos 내비로 목적지 안내가 이어져요.'); return; }
      const r = openNavigation(toLabel, d.latitude, d.longitude, false); if (!r.ok) toast(r.message!, 'error');
    };
    const photoLocked = driving;
    const addPhoto = async () => {
      if (photoLocked) { toast('주행 중에는 사진 기록이 잠겨요. 휴식 중이나 정차 후에 추가해 주세요.'); return; }
      const added = await addPhotosToTrip(live.trip!.id, (m: string) => toast(m, 'error'));
      if (added?.length) toast(`사진 ${added.length}장을 여행 기록에 추가했어요.`);
    };
    const quick: { icon: typeof Coffee; t: string; go: () => void; note?: string }[] = [
      { icon: Coffee, t: '휴식 장소 찾기', go: () => setRestSheet(['restArea', 'park']) },
      { icon: PawPrint, t: '반려견 동반 장소', go: () => setRestSheet(['cafe', 'restaurant', 'park']) },
      { icon: Fuel, t: '주유소', note: '내비 연동 후', go: () => toast('주유소 검색은 차량 내비(Pleos) 연동 후 지원돼요.') },
      { icon: Stethoscope, t: '동물병원', go: () => setRestSheet(['vet']) },
    ];
    return (
      <div className="cd v3">
        <header className="cd-head">
          <PetStack pets={tripPets} names={live.petNames} size={52} />
          <div className="grow" style={{ minWidth: 0 }}>
            <p className="t ellipsis">{withPets(live.petNames)} {destTitle} {isReturn ? '돌아가는 중' : '이동 중'}</p>
            <p className="s ellipsis">{isReturn ? `${fromLabel} → ${toLabel}` : live.trip.destinationName ?? '목적지 미설정 · 가는 길 기록 중'}</p>
          </div>
          <div className="cd-eta num">
            {route.remainingKm != null && <span><Car size={22} color="var(--primary)" /><b>{formatKmNum(route.remainingKm)}</b>km{route.remainingKind === 'straight' ? ' (직선)' : ''}</span>}
            {route.etaMinutes != null && <span><Clock size={21} color="var(--primary)" /><b>{formatHM(route.etaMinutes * 60)}</b> 남음{route.etaEstimated ? ' (예상)' : ''}</span>}
            {route.remainingKm == null && route.etaMinutes == null && <span className="t-sub">{routeLine}</span>}
          </div>
          {etaClock && <div className="cd-arrive-at"><Flag size={22} /><div><p className="k">도착 예정</p><p className="v num">{etaClock}</p></div></div>}
          {isDemo && <span className="badge sample" title="차량·교통·장소 데이터가 모두 가상이며 실제 통계에 포함되지 않아요"><FlaskConical size={12} />데모</span>}
        </header>

        <div className="cd-body">
          <aside className="cd-left" aria-label="반려견과 여행 정보">
            <section className={`cd-dog ${pet?.photoUri ? '' : 'nophoto'}`}>
              {pet?.photoUri ? <img src={pet.photoUri} alt="" /> : <PhotoFallback size={44} />}
              {pet && <button className="cd-prof" disabled={driving} onClick={() => navigate(`/pet/${pet.id}`)} title={driving ? '주행 중에는 프로필 편집이 잠겨요' : undefined}><Camera size={14} />프로필 변경</button>}
              <div className="cap"><p className="t ellipsis">{joinNames(live.petNames) || '우리 강아지'} 🐾</p><p className="s">{tripPets.length > 1 ? `이번 여행 ${tripPets.length}마리 함께` : pet ? PET_SIZE_LABEL[pet.size] : '반려견 정보 없음'}</p></div>
            </section>
            <ul className="cd-stats">
              {stats.map(([k, v, u]) => <li key={k}><span>{k}</span><b className="num">{v}{u && <small>{u}</small>}</b></li>)}
            </ul>
            <div className="last-rest"><Timer size={18} color="var(--text-2)" /><span className="grow">{lastRest}</span></div>
            {notices}
            {voiceChips}
            {voice.text && <p className="voice-line">{voice.text}</p>}
            {details}
          </aside>

          <section className="cd-mid">
            <div className="car-map">
              {mapEl}
              <div className="map-tabs" role="tablist" aria-label="지도 보기">
                <button role="tab" aria-selected={mapTab === 'route'} className={mapTab === 'route' ? 'on' : ''} onClick={() => setMapTab('route')}><Route size={16} />경로 안내</button>
                <button role="tab" aria-selected={mapTab === 'near'} className={mapTab === 'near' ? 'on' : ''} onClick={() => setMapTab('near')}><MapPinned size={16} />주변 장소</button>
              </div>
              {hzPill}
              {arrivePrompt}
              {suggest}
              <button className={`rest-bar ${gaugeTone}`} onClick={() => setRestSheet(['restArea', 'park'])} aria-label={`휴식 안내: ${restText}. 휴식 장소 보기`}>
                <span className="ring" aria-hidden="true">
                  <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r={R} className="trk" /><circle cx="22" cy="22" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - gaugePct)} transform="rotate(-90 22 22)" /></svg>
                  <PawPrint size={16} />
                </span>
                <span className="lbl">휴식 안내</span>
                <span className="main">
                  <span className="row between"><span className="tx">{restText}{!resting && left > 0 && restAheadKm != null && <small> (약 {formatKm(restAheadKm)})</small>}</span><b className="num">{Math.round(gaugePct * 100)}%</b></span>
                  <span className="pbar"><i style={{ width: `${gaugePct * 100}%` }} /></span>
                  <span className="note">휴식 알림 시간 진행률 · 피로도를 측정한 값이 아니에요 · {Math.round(e.drivingSinceRestSec / 60)}분 / {e.restIntervalMin}분</span>
                </span>
                <ChevronRight size={20} />
              </button>
            </div>
            {recSection}
          </section>

          <aside className="cd-right" aria-label="여행 정보와 빠른 기능">
            <section className="cd-info">
              <p className="h"><BookOpen size={18} color="var(--primary)" />여행 정보</p>
              <div className="ir"><MapPin size={20} /><div className="grow"><p className="k">목적지</p><p className="v ellipsis">{toLabel}</p></div></div>
              <div className="ir"><Clock size={20} /><div className="grow"><p className="k">도착 예정</p><p className="v num">{etaClock ?? '—'}{route.etaMinutes != null && <small> · {formatDuration(route.etaMinutes * 60)}</small>}</p></div></div>
              <div className="ir"><Route size={20} /><div className="grow"><p className="k">남은 거리</p><p className="v num">{route.remainingKm != null ? `${formatKmNum(route.remainingKm)} km` : '—'}</p></div></div>
              {progress != null && (
                <div className="ir-prog">
                  <JourneyBar progress={progress} restAt={restAt} />
                  <div className="jbar-labels"><span>{fromLabel}</span><span className="num">{Math.round(progress * 100)}%</span></div>
                </div>
              )}
            </section>
            <section className="cd-quick">
              <p className="h"><Sparkles size={17} color="var(--primary)" />빠른 기능</p>
              <div className="qg">
                {quick.map((q) => (
                  <button key={q.t} onClick={q.go}><q.icon size={26} /><span>{q.t}</span>{q.note && <small>{q.note}</small>}</button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <footer className="cd-actions">
          <button className="ca primary" onClick={navAction}><Navigation size={22} />내비게이션</button>
          {resting ? (
            <button className="ca mint" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}><Timer size={22} />휴식 종료</button>
          ) : (
            <button className="ca mint" disabled={driving && !isDemo} onClick={() => TripController.beginRest()}><Coffee size={22} />휴식 시작</button>
          )}
          <button className="ca" onClick={() => setIntervalSheet(true)}><BellRing size={22} />휴식 알림 설정</button>
          <button className={`ca ${photoLocked ? 'locked' : ''}`} onClick={addPhoto} aria-disabled={photoLocked}><Camera size={22} />여행 사진 기록{photoLocked && <Lock size={14} className="lk" />}</button>
          <button className={`ca ${voice.listening ? 'listening' : ''}`} onClick={onVoice}><Mic size={22} />음성 명령</button>
          <button className="ca deep" onClick={() => setEndSheet(true)}><Flag size={22} />{isReturn ? '집 도착 · 여행 완료' : isExtra ? '도착 · 여행지 활동' : '목적지 도착'}</button>
        </footer>
        {sheets()}
      </div>
    );
  }

  return (
    <div className="drive-m">
      <div className="map-area">
        {mapEl}
        <div className="top">
          <div className="drive-head">
            <button style={{ all: 'unset', cursor: 'pointer' }} aria-label="홈으로 (기록은 계속돼요)" onClick={() => navigate('/home')}><PetStack pets={tripPets} names={live.petNames} size={40} /></button>
            <div className="grow" style={{ minWidth: 0 }}><p className="t ellipsis">{headline}</p><p className="s ellipsis num">{routeLine}</p></div>
            {isDemo ? <span className="badge sample">데모</span> : <span className={`status-pill ${e.status}`} role="status" style={{ height: 28, fontSize: 12.5, padding: '0 10px' }}><St.icon size={14} />{St.label}</span>}
          </div>
          {hzPill}
        </div>
      </div>
      <div className="drive-sheet">
        <span className="grab" aria-hidden="true" />
        {progress != null && (
          <div>
            <div className="jp-head"><span className="num">{fromLabel} → {toLabel} · {formatKmNum(e.distanceKm)} / {formatKmNum(totalKm!)}km</span><span>{e.restCount ? `휴식 ${e.restCount}회` : '휴식 아직 없음'} · 연속 {formatHM(e.drivingSinceRestSec)}</span></div>
            <JourneyBar progress={progress} restAt={restAt} />
          </div>
        )}
        {arrivePrompt}
        <div className="tiles3">{tiles}</div>
        {notices}
        {suggest}
        {recSection}
        <div className="drive-actions">
          {restAction}
          <button className={`mic-btn ${voice.listening ? 'listening' : ''}`} onClick={onVoice} aria-label="음성 명령"><Mic size={26} /></button>
          {arriveAction}
        </div>
        {voice.text && <p className="voice-line">{voice.text}</p>}
        {voiceChips}
        <p id="drive-lock" className="drive-lock"><Lock size={13} />{lockText}</p>
        <button className="link" style={{ justifySelf: 'center', fontSize: 12.5 }} onClick={openCarPreview}>차량 화면(1600×900)으로 보기</button>
        {details}
      </div>
      {sheets()}
    </div>
  );

  function sheets() {
    return (
      <>
      <Sheet open={moreRecs} onClose={() => setMoreRecs(false)} labelledBy="rr-all">
        <h2 id="rr-all" className="h-md">경로 근처 반려견 동반 장소</h2>
        <p className="t-cap mt-8">현재 경로 기준 · 경로 이탈 거리와 추가 시간은 평균 속도로 계산한 추정값이에요. 동반 여부는 방문 전 확인해 주세요.</p>
        {driving && <div className="hint mt-12"><Lock size={15} />데모라서 주행 중에도 열 수 있어요. 실제 주행 중에는 정차 후 이용할 수 있어요.</div>}
        <div className="rr-all mt-16">{petRecs.length ? petRecs.map(recCard) : <p className="t-sub">추천할 장소가 아직 없어요.</p>}</div>
      </Sheet>
      <Sheet open={intervalSheet} onClose={() => setIntervalSheet(false)} labelledBy="iv-title">
        <h2 id="iv-title" className="h-md">휴식 알림 설정</h2>
        <p className="t-cap mt-8">이번 여행에만 적용돼요. 반려견 프로필의 기본 간격은 바뀌지 않아요.</p>
        {driving && !isDemo ? (
          <div className="hint mt-16"><Lock size={15} />주행 중에는 간격을 바꿀 수 없어요. 휴식 중이나 정차 후에 바꿔 주세요. (현재 {e.restIntervalMin}분)</div>
        ) : (
          <div className="mt-16"><RestIntervalPicker value={e.restIntervalMin} onChange={(v: number) => TripController.setRestInterval(v)} /></div>
        )}
        <button className="btn primary block mt-24" onClick={() => { setIntervalSheet(false); toast(`휴식 알림을 ${e.restIntervalMin}분 간격으로 맞췄어요.`); }}>확인</button>
      </Sheet>
      <ReminderSheet
        open={!!live.reminder}
        kind={live.reminder?.kind ?? 'soon'}
        petName={mainPet}
        driven={live.reminder?.drivenMinutes ?? 0}
        minutesLeft={live.reminder?.minutesLeft ?? 0}
        onFind={() => { TripController.dismissReminder(); setRestSheet(['restArea', 'park']); }}
        onSnooze={() => { TripController.snoozeReminder(15); toast('15분 뒤에 다시 알려드릴게요.'); }}
        onRest={() => TripController.beginRest()}
        onClose={() => TripController.dismissReminder()}
        canStartRest={!driving || isDemo}
      />

      <NearbyRestSheet categories={restSheet} onClose={() => setRestSheet(null)} position={live.position} driving={driving} tripId={live.trip!.id} apiBase={settings.apiBaseUrl} />

      <Sheet open={hzSheet} onClose={() => setHzSheet(false)} labelledBy="hz-title">
        <div className="row between"><h2 id="hz-title" className="h-lg">도로 위험 정보</h2>{traffic?.provenance === 'demo' && <span className="badge sample">데모 데이터</span>}</div>
        <p className="t-cap mt-8">출처: {traffic?.label ?? '없음'} · 실제 도로 상황과 다를 수 있어요.</p>
        <div className="mt-16" style={{ display: 'grid', gap: 8 }}>
          {hazards.list.length === 0 ? <p className="t-sub">표시할 위험 정보가 없어요.</p> : hazards.list.map((h) => (
            <div key={h.id} className="row muted-box" style={{ gap: 12 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: HAZARD_COLOR[h.type], flex: 'none' }} />
              <div className="grow">
                <p style={{ fontWeight: 700 }}>{HAZARD_LABEL[h.type]} · {h.roadName ?? '도로 정보 없음'}</p>
                <p className="t-cap">{h.message ?? ''}{h.lanes ? ` · ${h.lanes}` : ''}{live.position ? ` · ${formatKm(haversineKm(live.position, h))}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={endSheet} onClose={() => !ending && setEndSheet(false)} center labelledBy="end-title">
        {isReturn ? (
          <>
            <h2 id="end-title" className="h-lg">집에 도착했나요?</h2>
            <p className="t-sub mt-8">돌아오는 길 {formatKm(e.distanceKm)} · 주행 {formatDuration(e.drivingSec)}을 저장하고 여행을 완료해요. 완료 후에도 사진·일기는 계속 추가할 수 있어요.</p>
            <div className="btn-row mt-24">
              <button className="btn ghost" disabled={ending} onClick={() => setEndSheet(false)}>계속 기록</button>
              <button className="btn primary" disabled={ending} onClick={finish}>{ending ? '저장 중…' : '여행 완료'}</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="end-title" className="h-lg">{isExtra ? '다음 장소에 도착했나요?' : '목적지에 도착했나요?'}</h2>
            <p className="t-sub mt-8">{isExtra ? '이번 이동' : '가는 길'} {formatKm(e.distanceKm)} · 주행 {formatDuration(e.drivingSec)}을 저장해요. <b>여행은 끝나지 않고</b> 여행지 활동(사진·장소·메모)으로 이어져요.</p>
            <div style={{ display: 'grid', gap: 10 }} className="mt-24">
              <button className="btn primary block" disabled={ending} onClick={arrive}>{ending ? '저장 중…' : '목적지 도착 · 여행지 활동 시작'}</button>
              <div className="btn-row">
                <button className="btn ghost" disabled={ending} onClick={() => setEndSheet(false)}>계속 주행</button>
                <button className="btn secondary" disabled={ending} onClick={finish} title="돌아가는 길을 기록하지 않고 전체 여행을 마무리해요">여행 마무리(복귀 기록 없이)</button>
              </div>
            </div>
          </>
        )}
        <button className="link mt-16" style={{ width: '100%', justifyContent: 'center' }} disabled={ending} onClick={async () => { await TripController.discard(); setEndSheet(false); toast('여행을 저장하지 않고 취소했어요.'); navigate('/home', { replace: true }); }}>
          여행 기록하지 않고 취소하기
        </button>
      </Sheet>
      </>
    );
  }
}

function ReminderSheet(p: { open: boolean; kind: 'soon' | 'due'; petName: string; driven: number; minutesLeft: number; onFind: () => void; onSnooze: () => void; onRest: () => void; onClose: () => void; canStartRest: boolean }) {
  return (
    <Sheet open={p.open} onClose={p.onClose} center labelledBy="rem-title">
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--mint)', color: 'var(--mint-text)', display: 'grid', placeItems: 'center' }}><BellRing size={28} /></div>
      {p.kind === 'soon' ? (
        <>
          <h2 id="rem-title" className="h-lg mt-16">{p.petName}와 곧 쉬어갈 시간이에요.</h2>
          <p className="t-sub mt-8">약 {p.minutesLeft}분 뒤 설정한 휴식 시간이에요. 가까운 휴식 장소를 미리 살펴볼까요?</p>
          <div className="btn-row mt-24">
            <button className="btn ghost" onClick={p.onClose}>확인</button>
            <button className="btn primary" onClick={p.onFind}>휴식 장소 보기</button>
          </div>
        </>
      ) : (
        <>
          <h2 id="rem-title" className="h-lg mt-16">{p.petName}와 {p.driven}분 동안 이동했어요.<br />잠깐 쉬어갈까요?</h2>
          <p className="t-cap mt-8">휴식 알림은 보호자가 정한 간격에 따른 안내이며, 반려견의 피로도를 측정·진단하지 않아요.</p>
          <div style={{ display: 'grid', gap: 10 }} className="mt-24">
            <button className="btn primary block" onClick={p.onFind}><Navigation size={18} />주변 휴식 장소 보기</button>
            <div className="btn-row">
              <button className="btn ghost" onClick={p.onSnooze}>나중에 알림</button>
              <button className="btn accent" disabled={!p.canStartRest} onClick={p.onRest}>휴식 시작</button>
            </div>
            {!p.canStartRest && <p className="t-cap" style={{ textAlign: 'center' }}>차를 세운 뒤 휴식을 시작할 수 있어요.</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}

function NearbyRestSheet({ categories, onClose, position, driving, tripId, apiBase }: { categories: PlaceCategory[] | null; onClose: () => void; position: GeoPoint | null; driving: boolean; tripId: string; apiBase: string }) {
  const { toast } = useStore();
  const [state, setState] = useState<{ loading: boolean; error: string | null; places: { place: Place; distanceKm: number | null }[] }>({ loading: false, error: null, places: [] });
  const provider = useMemo(() => getPlaceProvider(apiBase), [apiBase]);
  const [nonce, setNonce] = useState(0);
  const open = !!categories;
  const catKey = categories?.join(',') ?? '';

  useEffect(() => {
    if (!open || !position) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all(categories!.map((c) => provider.search({ category: c, centers: [position], radiusKm: c === 'restArea' ? 15 : 8 }, ac.signal)))
      .then((r) => setState({ loading: false, error: null, places: sortByDistance(r.flat(), position).slice(0, driving ? 3 : 10) }))
      .catch((e) => { if (e.name !== 'AbortError') setState({ loading: false, error: (e as Error).message, places: [] }); });
    return () => ac.abort();
  }, [open, catKey, position?.latitude.toFixed(2), position?.longitude.toFixed(2), driving, provider, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const addVisit = async (p: Place) => {
    try {
      await repo.addVisitedPlace({ id: newId(), tripId, placeName: p.name, category: p.category, latitude: p.latitude, longitude: p.longitude, visitedAt: Date.now(), isSample: p.isSample });
      toast(`${p.name}을(를) 방문 장소로 기록했어요.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="near-title">
      <div className="row between">
        <h2 id="near-title" className="h-lg">주변 휴식 장소</h2>
        {provider.isSample && <span className="badge sample">샘플 데이터</span>}
      </div>
      {driving && <p className="lock-note mt-8"><Lock size={15} />주행 중이라 가까운 3곳만 크게 보여드려요.</p>}
      {!position ? (
        <EmptyState kind="empty-place" title="현재 위치를 알 수 없어요" desc="위치 신호가 잡히면 주변 장소를 찾아드려요." />
      ) : state.loading ? (
        <Loading label="주변 장소를 찾고 있어요" />
      ) : state.error ? (
        <EmptyState kind="error" title="장소를 불러오지 못했어요" desc={state.error} action={<button className="btn ghost sm" onClick={() => setNonce((n) => n + 1)}>다시 시도</button>} />
      ) : state.places.length === 0 ? (
        <EmptyState kind="empty-place" title="주변에 찾은 장소가 없어요" desc="조금 더 이동한 뒤 다시 찾아볼게요." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }} className="mt-16">
          {state.places.map(({ place, distanceKm }) => (
            <div key={place.id} className="card row" style={{ gap: 14, padding: 14, boxShadow: 'none', border: '1px solid var(--line)' }}>
              <PlaceThumb category={place.category} size={driving ? 60 : 52} />
              <div className="grow">
                <p style={{ fontWeight: 700, fontSize: driving ? 17 : 15 }} className="ellipsis">{place.name}</p>
                <p className="t-cap mt-8">{distanceKm != null ? formatKm(distanceKm) : ''} · {place.policy.smallDog || place.policy.largeDog ? '동반 가능' : '동반 확인 필요'} · {place.isSample ? '샘플 데이터' : place.sourceLabel}</p>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <button className="btn primary sm" style={{ minHeight: driving ? 52 : 40 }} onClick={() => { const r = openNavigation(place.name, place.latitude, place.longitude, place.isSample); if (!r.ok) toast(r.message!, 'error'); }}>안내</button>
                {!driving && <button className="btn ghost sm" onClick={() => addVisit(place)}>들렀어요</button>}
              </div>
            </div>
          ))}
          <p className="t-cap"><TriangleAlert size={12} style={{ verticalAlign: -2 }} /> 반려동물 동반 정책은 바뀔 수 있어요. 방문 전 매장에 확인해 주세요.</p>
        </div>
      )}
    </Sheet>
  );
}
