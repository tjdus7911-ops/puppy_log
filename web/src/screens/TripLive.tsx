// SCREEN 01 — 주행 중 메인 대시보드 (시안: 좌 반려견 카드 | 중앙 지도 | 우 휴식 장소 추천 + 음성 명령)
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BellRing, Camera, Car, Check, ChevronRight, CircleParking, Clock3, Coffee, Flag, FlaskConical, Fuel, Lock, MapPin, Mic, Navigation, PawPrint, Plus, Stethoscope,
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
import { mapJsKey, newId, type GeoPoint, type PlaceCategory } from '../domain/models';
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
import { EmptyState, Loading, Sheet } from '../ui/components';
import { PetAvatar, PlaceThumb } from '../ui/Art';
import { JourneyBar, PhotoFallback } from '../ui/kit';
import { regionShort } from '../domain/regions';
import { RoadMap } from '../ui/RoadMap';
import type { MapMarker } from '../ui/MapView';
import { DEMO_SPEEDS } from './TripSetup';
import { addPhotosToTrip } from '../app/photos';
import { TripScene, type SceneId } from '../ui/scenes';
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
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [moreRecs, setMoreRecs] = useState(false);
  const [intervalSheet, setIntervalSheet] = useState(false);
  const [stateSheet, setStateSheet] = useState(false);
  const [placeDetail, setPlaceDetail] = useState<RouteRec | null>(null);
  const [hazards, setHazards] = useState<{ list: Hazard[]; error: string | null }>({ list: [], error: null });
  const [recs, setRecs] = useState<RouteRec[]>([]);
  const [voice, setVoice] = useState<{ listening: boolean; text: string | null }>({ listening: false, text: null });
  const spoken = useRef(new Set<string>());
  /** 음성으로 찾은 장소 종류: 추천 카드에서 해당 장소만 강조(팝업 없음) */
  const [voiceFocus, setVoiceFocus] = useState<PlaceCategory | null>(null);
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
        <EmptyState title="여행지 활동 중이에요" desc="주행 기록은 멈춰 있어요. 여행지 활동 화면에서 사진·장소·메모를 남기거나 돌아가는 길 기록을 시작하세요." action={<button className="btn primary" onClick={() => navigate(wide ? '/trip/destination' : '/home', { replace: true })}>여행지 활동으로</button>} />
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
    if (ok) { await reload(); toast('목적지에 도착했어요. 여행지에서의 순간도 기록해 보세요.'); navigate(wide ? '/trip/destination' : '/home', { replace: true }); }
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
    // 주행 중: 팝업 없이 '다음 휴식지 추천' 카드에서 해당 장소만 강조 / 정차 중: 목록 시트
    else if (intent === 'rest-area' || intent === 'cafe') {
      const cats: PlaceCategory[] = intent === 'cafe' ? ['cafe'] : ['restArea', 'park'];
      const hit = petRecs.find((r) => cats.includes(r.place.category));
      if (driving) {
        setVoiceFocus(cats[0]);
        answer = hit ? `${hit.place.name}, ${hit.detourKm != null ? `경로에서 ${formatKm(hit.detourKm)} 떨어져 있어요` : `${formatKm(hit.distanceKm)} 거리예요`}. 추천 카드에 표시했어요.` : '경로 근처에서 찾지 못했어요. 조금 더 가면 다시 찾아볼게요.';
      } else { setRestSheet(cats); answer = intent === 'cafe' ? `${mainPet}와 갈 수 있는 카페를 찾아볼게요. 동반 여부는 방문 전 확인해 주세요.` : '가까운 휴식 장소를 찾아볼게요.'; }
    }
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
    ...(!live.arrived ? visibleRecs.slice(0, 3).map(({ place }) => ({ id: place.id, point: place, kind: 'rec' as const, label: place.name })) : []),
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
      {live.arrived
        ? <div className="tile3"><p className="k">휴식 횟수</p><p className="v">{e.restCount}<small>회</small></p></div>
        : <div className={`tile3 ${resting || left > 0 ? 'rest' : 'due'}`}><p className="k">{restTile.k}</p><p className="v">{restTile.v}{restTile.u && <small>{restTile.u}</small>}</p></div>}
    </>
  );
  const notices = (
    <>
      {live.gpsLost && <div className="hint red"><Satellite size={16} /><div>GPS 신호가 약해요. 신호가 돌아오면 경로를 이어서 기록해요. 끊긴 동안의 주행 시간·거리는 추정하지 않아요.</div></div>}
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
              <button className="btn secondary block mt-12" onClick={() => setStateSheet(true)}>상태별 화면 테스트</button>
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
  const lockText = driving ? (isDemo ? '주행 중에는 사진·일기 편집이 잠겨요 (데모: 휴식 시작은 휴게소 진입으로 처리)' : '주행 중에는 휴식 시작·사진·일기 편집이 잠겨요') : '정차 중 · 장소 상세와 기록 편집을 이용할 수 있어요';

  // ═══ 대시보드 상태: 상태마다 보이는 정보·버튼·알림을 분리 ═══
  //  driving(주행) → soon(휴식 10분 전) → due(휴식 시점) → resting(휴식 중) / arrived(목적지 근처 도착)
  //  여행지 활동 중(at-destination)은 Home에서 Destination 화면으로 전환됩니다.
  type Dash = 'driving' | 'soon' | 'due' | 'resting' | 'arrived';
  const dash: Dash = live.arrived ? 'arrived' : resting ? 'resting' : left <= 0 ? 'due' : left <= 10 * 60 ? 'soon' : 'driving';
  const restMin = Math.max(1, Math.round(left / 60));
  const naviMode: 'demo' | 'link' | 'none' = isDemo ? 'demo' : (!isReturn && live.trip.destination) ? 'link' : 'none';

  // ── 다음 휴식지 추천(장소 추천은 이곳에서만) ──
  const petLabel = (p: Place) => (p.policy.smallDog === true || p.policy.largeDog === true ? { t: '동반 가능', c: 'ok' } : { t: '확인 필요', c: 'check' });
  const focusCats: PlaceCategory[] | null = voiceFocus ? (voiceFocus === 'cafe' ? ['cafe'] : ['restArea', 'park']) : (dash === 'soon' || dash === 'due') ? ['restArea', 'park'] : null;
  const focusId = focusCats ? (petRecs.slice(0, 3).find((r) => focusCats.includes(r.place.category)) ?? petRecs[0])?.place.id : undefined;
  const addWaypoint = (r: RouteRec) => {
    if (waypoints.includes(r.place.id)) { setWaypoints((w) => w.filter((x) => x !== r.place.id)); toast(`‘${r.place.name}’ 경유지를 뺐어요.`); return; }
    if (r.place.isSample || isDemo) {
      setWaypoints((w) => [...w, r.place.id]);
      toast(`‘${r.place.name}’을 경유지로 표시했어요 · 데모(실제 내비 경로는 바뀌지 않아요)`);
      return;
    }
    const res = openNavigation(r.place.name, r.place.latitude, r.place.longitude, false);
    if (res.ok) { setWaypoints((w) => [...w, r.place.id]); toast('지도 앱에서 이 장소 길 안내를 열었어요. 웹에서는 내장 내비 경유지 추가가 지원되지 않아요.'); }
    else toast(res.message!, 'error');
  };
  const recCard = (r: RouteRec) => {
    const pl = petLabel(r.place);
    const on = waypoints.includes(r.place.id);
    const hl = r.place.id === focusId;
    return (
      <div key={r.place.id} className={`rr-card ${on ? 'on' : ''} ${hl ? 'hl' : ''}`} role="button" tabIndex={0} onClick={() => setPlaceDetail(r)} onKeyDown={(ev) => ev.key === 'Enter' && setPlaceDetail(r)} aria-label={`${r.place.name} 상세`}>
        <span className="rr-ph">{r.place.imageUri ? <img src={r.place.imageUri} alt="" /> : <PlaceThumb category={r.place.category} size="100%" radius={10} />}</span>
        <div className="rr-tx">
          <p className="n ellipsis">{r.place.name}</p>
          <p className="m num">{r.detourKm != null ? `경로 이탈 ${formatKm(r.detourKm)} · 약 ${r.extraMin}분` : `${formatKm(r.distanceKm)} · 추가 시간 미확인`}</p>
          <span className={`pet-ok ${pl.c}`}>{pl.t}</span>
        </div>
        <button className={`rr-go ${on ? 'on' : ''}`} onClick={(ev) => { ev.stopPropagation(); addWaypoint(r); }} aria-label={`${r.place.name} ${on ? '경유지 빼기' : '경유지 추가'}`} title={on ? '경유지 빼기' : '경유지 추가'}>
          {on ? <Check size={18} /> : <Plus size={18} />}
        </button>
      </div>
    );
  };
  const openMore = () => {
    if (driving && !isDemo) { toast('주행 중에는 추천 3곳만 보여드려요. 정차하거나 휴식 중에 전체 목록을 확인해 주세요.'); return; }
    setMoreRecs(true);
  };
  const recSection = !settings.autoRecommend && dash !== 'arrived' ? (
    <section className="rr" aria-label="다음 휴식지 추천">
      <div className="rr-hd"><p className="t"><MapPin size={16} color="var(--primary)" />경유지 추천 꺼짐</p><p className="s">여행 준비 화면이나 설정에서 켤 수 있어요</p><button className="rr-more" onClick={() => setRestSheet(['restArea', 'park'])}>휴식 장소 찾기<ChevronRight size={15} /></button></div>
    </section>
  ) : dash === 'arrived' ? (
    <section className="rr arrived-next" aria-label="도착 후 할 일">
      <div className="rr-hd"><p className="t"><Flag size={16} color="var(--primary)" />{isReturn ? '집에 도착했어요' : '여행지에서 할 수 있는 일'}</p></div>
      <div className="an-list">
        {(isReturn ? ['여행 완료 후 AI 일기 초안 생성', '사진·메모는 완료 후에도 추가', '발도장 지도에 기록'] : ['사진 추가', '방문 장소 기록', '여행 메모', '돌아가는 길 기록']).map((t) => <span key={t}>{t}</span>)}
      </div>
    </section>
  ) : (
    <section className="rr" aria-label="다음 휴식지 추천">
      <div className="rr-hd">
        <p className="t"><MapPin size={16} color="var(--primary)" />다음 휴식지 추천</p>
        <p className="s">{dash === 'soon' || dash === 'due' ? '곧 휴식 시간이에요 · 강조된 곳을 추천해요' : '경로 근처 반려견 동반 장소'}{placeProvider.isSample ? ' · 샘플' : ''}</p>
        <button className="rr-more" onClick={openMore}>더보기<ChevronRight size={15} /></button>
      </div>
      <div className="rr-list">
        {!live.position ? <p className="t-sub">위치를 확인하면 추천해 드려요.</p> : petRecs.length === 0 ? <p className="t-sub">경로 근처에서 추천할 장소를 찾는 중이에요.</p> : petRecs.slice(0, 3).map(recCard)}
      </div>
    </section>
  );

  // ── 얇은 휴식 상태 카드(지도 하단). 빨간색은 쓰지 않음 ──
  const restCard = dash === 'arrived' ? null : (
    <div className={`rest-line ${dash}`} role="status" aria-live="polite">
      <span className="ic">{dash === 'resting' ? <Timer size={18} /> : <PawPrint size={18} />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="t num">{dash === 'resting' ? `휴식 중 · ${Math.max(0, Math.floor(restElapsed / 60))}분` : dash === 'due' ? '휴식할 시간이에요' : `다음 휴식까지 ${restMin}분`}
          {(dash === 'driving' || dash === 'soon') && restAheadKm != null && <small> 약 {formatKm(restAheadKm)} 앞</small>}</p>
        <p className="s">{dash === 'resting' ? '충분히 쉬고 출발해요 · 물과 산책을 챙겨 주세요' : dash === 'due' ? `${Math.round(e.drivingSinceRestSec / 60)}분 이동했어요 · 아래 추천 장소를 확인해 보세요` : `${e.restIntervalMin}분 간격 알림 · 마지막 휴식 후 ${Math.round(e.drivingSinceRestSec / 60)}분`}</p>
      </div>
      {dash === 'due' && <button className="btn sm ghost" onClick={() => { TripController.snoozeReminder(15); toast('15분 뒤에 다시 알려드릴게요.'); }}>15분 뒤</button>}
      {(dash === 'driving' || dash === 'soon') && <span className="thin" aria-hidden="true"><i style={{ width: `${Math.min(100, (e.drivingSinceRestSec / Math.max(1, e.restIntervalMin * 60)) * 100)}%` }} /></span>}
    </div>
  );

  // ── 하단 주요 액션: 상태별 4개, 같은 크기 ──
  const navCell = naviMode === 'demo' ? (
    <div className="ca status" role="status"><Navigation size={20} /><span>길 안내 중<small>데모 내비</small></span></div>
  ) : naviMode === 'link' ? (
    <button className="ca" onClick={() => { const d = live.trip!.destination!; const r = openNavigation(toLabel, d.latitude, d.longitude, false); if (!r.ok) toast(r.message!, 'error'); }}><Navigation size={20} /><span>지도 앱 길 안내<small>내장 내비 미연동</small></span></button>
  ) : (
    <div className="ca status off" role="status"><Navigation size={20} /><span>내비 미연동<small>목적지 좌표 없음</small></span></div>
  );
  const restStartBtn = (primary: boolean) => (
    <button className={`ca ${primary ? 'primary' : 'mint'}`} disabled={driving && !isDemo} onClick={() => TripController.beginRest()} title={driving && !isDemo ? '정차 후 휴식을 시작할 수 있어요' : undefined}><Coffee size={20} /><span>휴식 시작{driving && isDemo && <small>데모: 휴게소 진입</small>}</span></button>
  );
  const voiceBtn = <button className={`ca ${voice.listening ? 'listening' : ''}`} onClick={onVoice}><Mic size={20} /><span>음성 명령</span></button>;
  const arriveBtn = <button className="ca deep" onClick={() => setEndSheet(true)}><Flag size={20} /><span>{isReturn ? '집 도착' : isExtra ? '도착' : '목적지 도착'}</span></button>;
  const photoBtn = (
    <button className="ca" disabled={driving} onClick={async () => { const added = await addPhotosToTrip(live.trip!.id, (m: string) => toast(m, 'error')); if (added?.length) toast(`사진 ${added.length}장을 여행 기록에 추가했어요.`); }}><Camera size={20} /><span>여행 사진 기록{driving && <small>주행 중 잠김</small>}</span></button>
  );
  const actions = dash === 'arrived' ? [
    <button key="go" className="ca deep" disabled={ending} onClick={isReturn ? finish : arrive}><Flag size={20} /><span>{isReturn ? '여행 완료' : '여행지 활동 시작'}</span></button>,
    <button key="cont" className="ca" onClick={() => toast(isReturn ? '집에 도착하면 여행 완료를 눌러 주세요.' : '목적지 근처예요. 주차 후 여행지 활동을 시작해 주세요.')}><Car size={20} /><span>계속 주행</span></button>,
    photoBtn,
    voiceBtn,
  ] : dash === 'resting' ? [
    <button key="end" className="ca primary" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}><Timer size={20} /><span>휴식 종료</span></button>,
    photoBtn,
    <button key="iv" className="ca" onClick={() => setIntervalSheet(true)}><BellRing size={20} /><span>휴식 알림 설정</span></button>,
    arriveBtn,
  ] : dash === 'due' ? [
    <span key="r" style={{ display: 'contents' }}>{restStartBtn(true)}</span>, navCell, voiceBtn, arriveBtn,
  ] : [
    navCell, <span key="r" style={{ display: 'contents' }}>{restStartBtn(false)}</span>, voiceBtn, arriveBtn,
  ];

  // ── 상단 여행 상태(도착 안내 통합) ──
  const etaAt = route.etaMinutes != null ? new Date(e.lastTick + route.etaMinutes * 60_000) : null;
  const etaClock = etaAt ? etaAt.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : null;
  const destTitle = isReturn ? '집으로' : isExtra ? '여행지 안 이동' : `${shortDest(live.trip.destinationName ?? '목적지')}${live.trip.destinationName ? '으로' : ''}`;
  const headTitle = dash === 'arrived'
    ? (isReturn ? `${withPets(live.petNames)} 집 근처에 도착했어요` : `${shortDest(live.trip.destinationName ?? '목적지')} 근처에 도착했어요`)
    : `${withPets(live.petNames)} ${destTitle} ${isReturn ? '돌아가는 중' : '이동 중'}`;
  const headSub = dash === 'arrived'
    ? (isDemo ? '데모 시뮬레이션 도착 · 실제 차량에서는 내비 도착 신호로 전환돼요' : 'GPS 위치 기준 도착 · 휴식 알림과 휴식지 추천을 멈췄어요')
    : isReturn ? `${fromLabel} → ${toLabel}` : live.trip.destinationName ?? '목적지 미설정 · 가는 길 기록 중';

  if (wide) {
    const pet = tripPets[0];
    const stats: [string, string, string?][] = [
      ['주행 시간', formatHM(e.drivingSec)],
      ['이동 거리', live.kind === 'manual' ? '—' : formatKmNum(e.distanceKm), live.kind === 'manual' ? '' : 'km'],
      ['휴식 횟수', String(e.restCount), '회'],
      ...(etaClock && dash !== 'arrived' ? [['도착 예정', etaClock] as [string, string]] : []),
    ];
    const restSoonCount = petRecs.slice(0, 3).length;
    const continueTrip = async () => {
      // 계속 여행하기: 이번 구간을 저장하고(여행지 도착 기록) 여행지 안 다음 장소로 이동 기록을 이어감
      setEnding(true);
      const ok = await TripController.arrive();
      if (ok) { const r = await TripController.startExtraDrive({ demoSpeed: settings.demoSpeed, kind: live.kind ?? undefined }); if (!r.ok) toast(r.message, 'error'); }
      setEnding(false);
      await reload();
    };
    const sceneId: SceneId = /강릉|속초|양양|동해|부산|제주|해변|바다/.test(live.trip.destinationName ?? '') ? 'sea' : 'forest';
    return (
      <div className={`cd v5 st-${dash}`}>
        <div className="cd-body">
          <aside className="cd-left" aria-label="반려견과 주행 기록">
            <section className={`cd-dog ${pet?.photoUri ? '' : 'nophoto'}`}>
              {pet?.photoUri ? <img src={pet.photoUri} alt="" /> : <PhotoFallback size={44} />}
              {isDemo && <button className="demo-tag on-photo" onClick={() => setStateSheet(true)} title="데모 상태별 화면 테스트"><FlaskConical size={12} />데모</button>}
              <div className="cap">
                {tripPets.length > 1 && <span className="mini-stack">{tripPets.slice(0, 3).map((p) => <PetAvatar key={p.id} uri={p.photoUri} size={26} />)}</span>}
                <p className="t">{headTitle}</p>
                <p className="s ellipsis">{headSub}</p>
              </div>
            </section>
            <ul className="cd-stats">
              {stats.map(([k, v, u]) => <li key={k}><span>{k}</span><b className="num">{v}{u && <small>{u}</small>}</b></li>)}
            </ul>
            <button className={`cd-voice ${voice.listening ? 'listening' : ''}`} onClick={onVoice}><Mic size={20} />음성 명령<span>“가까운 휴게소 찾아줘”</span></button>
            {voice.text && <p className="voice-line">{voice.text}</p>}
            {notices}
            {details}
          </aside>

          {dash === 'arrived' ? (
            <section className="arr" aria-label="목적지 도착">
              <div className="arr-hero">
                <TripScene id={sceneId} />
                <div className="arr-title"><MapPin size={28} /><h1>{shortDest(isReturn ? '집' : live.trip.destinationName ?? '목적지')}{isReturn ? '에 돌아왔어요!' : '에 도착했어요!'}</h1></div>
                <span className="arr-src">{isDemo ? '데모 시뮬레이션 도착 · 실제 차량에서는 내비 도착 신호로 전환' : 'GPS 위치 기준 도착 확인'}</span>
              </div>
              <div className="arr-body">
                <div className="arr-stats">
                  <div><span><Car size={16} />이동 거리</span><b className="num">{formatKmNum(e.distanceKm)}<small>km</small></b></div>
                  <div><span><Clock3 size={16} />이동 시간</span><b className="num">{formatHM(e.drivingSec)}</b></div>
                  <div><span><Coffee size={16} />휴식 횟수</span><b className="num">{e.restCount}<small>회</small></b></div>
                  <div><span><PawPrint size={16} />함께한 반려견</span><b className="arr-pets">{tripPets.length ? tripPets.map((p) => <PetAvatar key={p.id} uri={p.photoUri} size={30} />) : null}<em>{joinNames(live.petNames)}</em></b></div>
                </div>
                <p className="arr-note">{isReturn ? '여행 완료를 누르면 기록이 확정되고 AI 여행 일기 초안이 만들어져요.' : '여행은 끝나지 않아요 · 여행지 활동(사진·방문 장소·메모)으로 이어져요. 전체 종료는 ‘여행 마무리’에서 해요.'}</p>
                <div className="arr-acts">
                  {isReturn ? (
                    <button className="ca deep" disabled={ending} onClick={finish}><Flag size={20} /><span>여행 완료</span></button>
                  ) : (
                    <>
                      <button className="ca deep" disabled={ending} onClick={arrive}><Camera size={20} /><span>여행지 활동 기록</span></button>
                      <button className="ca" disabled={ending} onClick={continueTrip}><ChevronRight size={20} /><span>계속 여행하기<small>여행지 안 다음 장소로</small></span></button>
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="cd-mid">
              <div className="car-map">
                {mapEl}
                {dash === 'soon' && (
                  <button className="soon-banner" onClick={() => setRestSheet(['restArea', 'park'])}>
                    <PawPrint size={22} /><span className="grow"><b>곧 휴식할 시간이에요!</b><small>약 {restMin}분 후{restSoonCount ? ` · 휴식지 ${restSoonCount}곳 추천` : ''}</small></span><ChevronRight size={20} />
                  </button>
                )}
                {dash !== 'soon' && hzPill}
                <div className={`rest-line ${dash}`} role="status" aria-live="polite">
                  <span className="ic">{dash === 'resting' ? <Timer size={18} /> : <PawPrint size={18} />}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <p className="t num">{dash === 'resting' ? `휴식 중 · ${Math.max(0, Math.floor(restElapsed / 60))}분` : dash === 'due' ? '휴식할 시간이에요' : `다음 휴식까지 ${restMin}분`}
                      {(dash === 'driving' || dash === 'soon') && restAheadKm != null && <small> (약 {formatKm(restAheadKm)})</small>}</p>
                    <p className="s">{dash === 'resting' ? '충분히 쉬고 출발해요' : dash === 'due' ? `${Math.round(e.drivingSinceRestSec / 60)}분 이동했어요 · 신호 대기·일시 정차는 휴식으로 세지 않아요` : `${e.restIntervalMin}분 간격 · 마지막 휴식 후 ${Math.round(e.drivingSinceRestSec / 60)}분`}</p>
                  </div>
                  {dash === 'due' && <><button className="btn sm ghost" onClick={() => { TripController.snoozeReminder(15); toast('15분 뒤에 다시 알려드릴게요.'); }}>나중에</button>{(!driving || isDemo) && <button className="btn sm primary" onClick={() => TripController.beginRest()}>휴식 시작{driving ? ' (데모)' : ''}</button>}</>}
                  {dash === 'resting' && <><button className="btn sm ghost" onClick={async () => { const added = await addPhotosToTrip(live.trip!.id, (m: string) => toast(m, 'error')); if (added?.length) toast(`사진 ${added.length}장을 추가했어요.`); }}><Camera size={15} />사진</button><button className="btn sm ghost" onClick={() => setIntervalSheet(true)}><BellRing size={15} />알림 간격</button><button className="btn sm primary" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}>휴식 종료</button></>}
                  {(dash === 'driving' || dash === 'soon') && !driving && <button className="btn sm ghost" onClick={() => TripController.beginRest()}>휴식 시작</button>}
                  {(dash === 'driving' || dash === 'soon') && <span className="thin" aria-hidden="true"><i style={{ width: `${Math.min(100, (e.drivingSinceRestSec / Math.max(1, e.restIntervalMin * 60)) * 100)}%` }} /></span>}
                </div>
              </div>
              {recSection}
            </section>
          )}
        </div>

        <footer className="cd-actions five">
          {naviMode === 'demo' ? (
            <div className="ca primary status-nav" role="status"><Navigation size={20} /><span>경로 안내 중<small>데모 내비</small></span></div>
          ) : naviMode === 'link' ? (
            <button className="ca primary" onClick={() => { const d = live.trip!.destination!; const r = openNavigation(toLabel, d.latitude, d.longitude, false); if (!r.ok) toast(r.message!, 'error'); }}><Navigation size={20} /><span>경로 안내<small>지도 앱 · 내장 내비 미연동</small></span></button>
          ) : (
            <div className="ca status off" role="status"><Navigation size={20} /><span>경로 안내<small>목적지 좌표 없음</small></span></div>
          )}
          <button className="ca" onClick={() => setRestSheet(['restArea', 'park', 'cafe'])}><PawPrint size={20} /><span>휴식지 추천</span></button>
          <button className="ca" onClick={() => toast('주유소 검색은 차량 내비(Pleos) 연동 후 지원돼요.')}><Fuel size={20} /><span>주유소<small>내비 연동 후</small></span></button>
          <button className="ca" onClick={() => setRestSheet(['vet'])}><Stethoscope size={20} /><span>동물병원</span></button>
          {dash === 'arrived' ? (
            <div className="ca status" role="status"><Flag size={20} /><span>{isReturn ? '집 도착' : '도착 완료'}<small>{isDemo ? '데모' : 'GPS 기준'}</small></span></div>
          ) : (
            <button className="ca deep" onClick={() => setEndSheet(true)}><Flag size={20} /><span>{isReturn ? '집 도착' : '목적지 도착'}<small>{isDemo ? '데모 · 수동 확인' : '내비 미연동 · 수동 확인'}</small></span></button>
          )}
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
            <div className="grow" style={{ minWidth: 0 }}><p className="t ellipsis">{dash === 'arrived' ? headTitle : headline}</p><p className="s ellipsis num">{dash === 'arrived' ? headSub : routeLine}</p></div>
            {isDemo ? <button className="demo-tag" onClick={() => setStateSheet(true)}><FlaskConical size={12} />데모</button> : <span className={`status-pill ${e.status}`} role="status" style={{ height: 28, fontSize: 12.5, padding: '0 10px' }}><St.icon size={14} />{St.label}</span>}
          </div>
          {dash !== 'arrived' && hzPill}
        </div>
      </div>
      <div className="drive-sheet">
        <span className="grab" aria-hidden="true" />
        {restCard}
        {progress != null && dash !== 'arrived' && (
          <div>
            <div className="jp-head"><span className="num">{fromLabel} → {toLabel} · {formatKmNum(e.distanceKm)} / {formatKmNum(totalKm!)}km</span><span>{e.restCount ? `휴식 ${e.restCount}회` : '휴식 아직 없음'}</span></div>
            <JourneyBar progress={progress} restAt={restAt} />
          </div>
        )}
        <div className="tiles3">{tiles}</div>
        {notices}
        {recSection}
        <div className="m-actions">{actions}</div>
        {voice.text && <p className="voice-line">{voice.text}</p>}
        {dash !== 'arrived' && voiceChips}
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
      <Sheet open={!!placeDetail} onClose={() => setPlaceDetail(null)} labelledBy="pd-title">
        {placeDetail && (() => {
          const r = placeDetail; const pl = petLabel(r.place); const on = waypoints.includes(r.place.id);
          return (
            <div className="pdx">
              <div className="pdx-img">{r.place.imageUri ? <img src={r.place.imageUri} alt="" /> : <PlaceThumb category={r.place.category} size="100%" radius={0} />}{!r.place.imageUri && <span className="badge photo">사진 정보 없음</span>}</div>
              <h2 id="pd-title" className="h-md mt-12">{r.place.name}{r.place.isSample && <span className="badge sample" style={{ marginLeft: 6 }}>샘플</span>}</h2>
              <p className="t-sub mt-4">{r.place.address}</p>
              <div className="pdx-meta">
                <span><Car size={16} />{r.detourKm != null ? `경로 +${r.extraMin}분 · ${formatKm(r.detourKm)}` : `${formatKm(r.distanceKm)} · 추가 시간 미확인`}</span>
                <span className={`pet-ok ${pl.c}`}>{pl.t}</span>
              </div>
              <p className="t-cap mt-8">추가 거리·시간은 평균 속도로 계산한 추정값이에요. 동반 여부·운영 시간은 방문 전 확인해 주세요.</p>
              <button className={`btn ${on ? 'ghost' : 'primary'} block xl mt-16`} onClick={() => { addWaypoint(r); setPlaceDetail(null); }}>{on ? '경유지에서 빼기' : '경유지로 추가'}</button>
              <p className="t-cap mt-8" style={{ textAlign: 'center' }}>{isDemo || r.place.isSample ? '데모: 지도에 경유지로 표시해요 · 실제 차량은 Pleos 내비 경유지 연동 후 지원' : '웹: 지도 앱으로 이 장소 길 안내를 열어요(내장 내비 경유지 미연동)'}</p>
            </div>
          );
        })()}
      </Sheet>
      <Sheet open={stateSheet} onClose={() => setStateSheet(false)} labelledBy="st-title">
        <h2 id="st-title" className="h-md">상태별 화면 테스트 <span className="badge sample">데모</span></h2>
        <p className="t-cap mt-8">데모 주행에서만 쓸 수 있어요. 실제 차량 이벤트가 아니라 시뮬레이션 상태를 바로 바꿔요. ‘목적지 도착’ 이동 구간의 거리는 기록하지 않아요.</p>
        <div className="st-grid mt-16">
          {([['driving', '주행 중', '다음 휴식까지 표시'], ['restSoon', '휴식 10분 전', '지도 상단 간결한 안내'], ['restDue', '휴식 시점', '휴식할 시간 · 추천 강조'], ['resting', '휴식 중', '휴식 종료·사진 기록'], ['arrived', '목적지 도착', '상단 도착 안내 · 알림 중지']] as const).map(([k, t, d]) => (
            <button key={k} className={`st-opt ${(k === 'driving' && dash === 'driving') || (k === 'restSoon' && dash === 'soon') || (k === 'restDue' && dash === 'due') || (k === 'resting' && dash === 'resting') || (k === 'arrived' && dash === 'arrived') ? 'on' : ''}`} disabled={!isDemo || (k !== 'arrived' && dash === 'arrived')}
              onClick={async () => { const ok = await TripController.demoJump(k); setStateSheet(false); if (!ok) toast('데모 주행에서만 사용할 수 있어요.', 'error'); }}>
              <b>{t}</b><span>{d}</span>
            </button>
          ))}
          <button className="st-opt" disabled={!isDemo || isReturn || ending} onClick={async () => { setStateSheet(false); if (!live.arrived) await TripController.demoJump('arrived'); await arrive(); }}>
            <b>여행지 활동 중</b><span>도착 처리 후 사진·장소·메모 기록 화면</span>
          </button>
        </div>
      </Sheet>

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
