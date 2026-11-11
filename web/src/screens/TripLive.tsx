// SCREEN 01 — 주행 중 메인 대시보드 (시안: 좌 반려견 카드 | 중앙 지도 | 우 휴식 장소 추천 + 음성 명령)
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BellRing, Car, ChevronDown, ChevronRight, CircleParking, Clock3, Coffee, Flag, FlaskConical, Lock, MapPin, Mic, Navigation,
  Satellite, Square, Timer, TriangleAlert,
} from 'lucide-react';
import { TripController } from '../trip/TripController';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { useWide } from '../app/useWide';
import { formatClock, formatDuration, formatKm } from '../domain/format';
import { regionLabel } from '../domain/regions';
import { callName, josa, petNames as joinNames } from '../domain/tripText';
import { haversineKm } from '../domain/geo';
import { mapJsKey, newId, type GeoPoint, type PlaceCategory } from '../domain/models';
import { repo } from '../data/db';
import { DEMO_ROUTE } from '../vehicle/demoRoute';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { openNavigation } from '../places/navigation';
import { getTrafficProvider, hazardsAhead, HAZARD_LABEL, HAZARD_VOICE, type Hazard, type HazardType } from '../traffic/TrafficInfoProvider';
import { routeSnapshot } from '../nav/NavigationProvider';
import { listenOnce, parseIntent, speechRecognitionSupported, type VoiceIntent } from '../trip/voice';
import { speak } from '../trip/speech';
import { EmptyState, Hint, Loading, Sheet } from '../ui/components';
import { PetAvatar, PlaceThumb } from '../ui/Art';
import { RoadMap } from '../ui/RoadMap';
import type { MapMarker } from '../ui/MapView';
import { DEMO_SPEEDS } from './TripSetup';

const STATUS = {
  driving: { label: '주행 중', icon: Car },
  stopped: { label: '일시 정차', icon: CircleParking },
  resting: { label: '휴식 중', icon: Coffee },
  ended: { label: '여행 종료', icon: Flag },
};

export const HAZARD_COLOR: Record<HazardType, string> = {
  accident: '#EF5350', construction: '#F5A623', debris: '#F2C230', congestion: '#8E6BD6', weather: '#5BA4D9', other: '#74849A',
};

function withPets(names: string[]) {
  const w = joinNames(names.length ? names : ['우리 강아지']);
  return `${w}${josa(w, '과', '와')}`;
}

/** 휴식 장소 추천 순위: 경로에서 덜 벗어나고, 가깝고, 동반 가능이 확인된 곳, 산책·휴식 공간 우선 */
function rankPlaces(places: Place[], current: GeoPoint, routeAhead: GeoPoint[]) {
  return places
    .map((p) => {
      const dist = haversineKm(current, p);
      const detour = routeAhead.length ? Math.min(...routeAhead.map((q) => haversineKm(q, p))) : dist;
      let score = detour * 2 + dist;
      if (p.policy.smallDog === true || p.policy.largeDog === true) score -= 1.5;
      if (p.category === 'restArea' || p.category === 'park') score -= 1;
      return { place: p, distanceKm: dist, score };
    })
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
  const [hazards, setHazards] = useState<{ list: Hazard[]; error: string | null }>({ list: [], error: null });
  const [recs, setRecs] = useState<{ place: Place; distanceKm: number }[]>([]);
  const [voice, setVoice] = useState<{ listening: boolean; text: string | null }>({ listening: false, text: null });
  const spoken = useRef(new Set<string>());
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
    for (const h of ahead) {
      if (spoken.current.has(h.id) || haversineKm(live.position, h) > 3) continue;
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
    Promise.all((['restArea', 'cafe', 'park', 'restaurant'] as PlaceCategory[]).map((c) => placeProvider.search({ category: c, centers: [pos], radiusKm: 10 }).catch(() => [] as Place[])))
      .then((r) => {
        if (!mounted.current) return;
        recCenter.current = pos;
        const routeAhead = isDemo ? DEMO_ROUTE.filter((q) => haversineKm(q, pos) < 40) : [pos];
        setRecs(rankPlaces(r.flat(), pos, routeAhead).slice(0, 6));
      })
      .finally(() => { recBusy.current = false; });
  }, [live.position, placeProvider, isDemo]);

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
  const route = routeSnapshot({ isDemo, destinationName: live.trip.destinationName, destination: live.trip.destination, current: live.position, drivenKm: e.distanceKm, drivingSec: e.drivingSec });
  const visibleRecs = driving ? recs.slice(0, 3) : recs;

  const finish = async () => {
    setEnding(true);
    const id = await TripController.end();
    setEnding(false);
    setEndSheet(false);
    if (id) { await reload(); navigate(`/album/${id}?new=1`, { replace: true }); }
  };

  const runIntent = (intent: VoiceIntent, heard: string | null) => {
    let answer = '';
    if (intent === 'rest-left') answer = resting ? '지금은 휴식 중이에요.' : `다음 휴식까지 ${formatDuration(Math.max(0, left))} 남았어요.`;
    else if (intent === 'rest-area') { answer = '가까운 휴게소를 찾아볼게요.'; setRestSheet(['restArea', 'park']); }
    else if (intent === 'cafe') { answer = `${mainPet}와 갈 수 있는 카페를 찾아볼게요. 동반 가능 여부는 방문 전 확인해 주세요.`; setRestSheet(['cafe']); }
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
    ...(live.trip.destination ? [{ id: 'dest', point: live.trip.destination, kind: 'dest' as const, label: '목적지' }] : []),
    ...hazards.list.map((h) => ({ id: h.id, point: h, kind: 'hazard' as const, color: HAZARD_COLOR[h.type], label: HAZARD_LABEL[h.type] })),
    ...visibleRecs.slice(0, 3).map(({ place }) => ({ id: place.id, point: place, kind: 'rec' as const, label: place.name })),
    ...(live.position ? [{ id: 'cur', point: live.position, kind: 'current' as const }] : []),
  ];

  const hzCounts = (['accident', 'construction', 'debris', 'congestion'] as HazardType[]).map((t) => ({ t, n: ahead.filter((h) => h.type === t).length }));

  return (
    <div className={wide ? '' : 'screen no-nav'} style={wide ? undefined : { paddingTop: 0 }}>
      {!wide && (
        <header className="row" style={{ height: 60, gap: 6 }}>
          <button className="icon-btn" aria-label="홈으로 (기록은 계속돼요)" onClick={() => navigate('/home')}><ChevronDown size={26} /></button>
          <span style={{ fontWeight: 700 }} className="grow ellipsis">{withPets(live.petNames)} 이동 중</span>
          <span className={`status-pill ${e.status}`} role="status"><St.icon size={18} />{St.label}</span>
        </header>
      )}
      {isDemo && <div className="demo-ribbon" style={wide ? { margin: '12px 0 0', borderRadius: 14 } : undefined}><FlaskConical size={14} /> 데모 시뮬레이션 · 차량·교통·장소 데이터가 모두 가상이며 실제 통계에 포함되지 않아요</div>}
      {live.kind === 'manual' && <div className="demo-ribbon" style={{ background: '#EEF2F8', color: 'var(--text-2)', ...(wide ? { margin: '12px 0 0', borderRadius: 14 } : {}) }}>수동 기록 모드 · 위치 없이 시간만 기록해요</div>}
      {live.gpsLost && (
        <div className="hint red mt-8"><Satellite size={16} /><div>GPS 신호가 약해요. 신호가 돌아오면 경로를 이어서 기록해요. 끊긴 동안의 주행 시간·거리는 추정하지 않아요.</div></div>
      )}

      <div className="dash">
        {/* ── 좌측: 반려견 여행 카드 + 휴식 안내 + 주요 버튼 ── */}
        <div className="dash-col">
          <section className="pet-card" aria-label="반려견 여행 정보">
            <div className="row" style={{ gap: 16 }}>
              <div className="row" style={{ gap: 0 }}>
                {tripPets.slice(0, 2).map((p, i) => <div key={p.id} style={{ marginLeft: i ? -18 : 0 }}><PetAvatar uri={p.photoUri} size={wide ? 84 : 64} ring /></div>)}
                {tripPets.length === 0 && <PetAvatar uri={null} size={wide ? 84 : 64} ring />}
              </div>
              <div className="grow">
                <p className="h-lg ellipsis">{withPets(live.petNames)} 여행 중</p>
                <span className="badge mt-8" style={{ background: driving ? 'var(--primary)' : resting ? 'var(--accent-soft)' : 'var(--primary-soft)', color: driving ? '#fff' : resting ? '#9A6411' : 'var(--primary)', height: 28, padding: '0 12px', fontSize: 13 }}>
                  <St.icon size={14} />{St.label}
                </span>
              </div>
            </div>
            <div className="stat3">
              <div><Clock3 size={22} /><p className="k">주행 시간</p><p className="v">{formatDuration(e.drivingSec)}</p></div>
              <div><MapPin size={22} /><p className="k">이동 거리</p><p className="v">{live.kind === 'manual' ? '—' : formatKm(e.distanceKm)}</p></div>
              <div><Coffee size={22} /><p className="k">{resting ? '휴식 시간' : '휴식까지'}</p><p className="v" style={{ color: !resting && left <= 0 ? 'var(--error)' : undefined }}>{resting ? formatClock(restElapsed) : left <= 0 ? '지금' : formatDuration(left)}</p></div>
            </div>
            <p className="t-cap mt-12">전체 여행 시간 {formatClock(e.elapsedSec)} · 휴식 {e.restCount}회{isDemo ? ` · ${live.demoSpeed}배속` : ''}</p>
          </section>

          <button className="mint-card" onClick={() => setRestSheet(['restArea', 'park'])}>
            <Coffee size={34} color="var(--mint-text)" />
            <div className="grow">
              <p className="t">{resting ? '휴식 중이에요' : left <= 600 ? '곧 쉬어갈 시간이에요!' : `다음 휴식까지 ${formatDuration(left)}`}</p>
              <p className="d">{mainPet}와 가까운 휴식 장소를 추천해 드릴게요.</p>
            </div>
            <ChevronRight size={20} color="var(--mint-text)" />
          </button>

          {live.kind === 'manual' && (
            <div className="card">
              <p style={{ fontWeight: 700 }}>지금 이동 상태</p>
              <div className="seg mt-12" role="radiogroup" aria-label="이동 상태">
                <button className={live.manualMotion === 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('moving')} style={{ height: 56, fontSize: 17 }}>주행 중</button>
                <button className={live.manualMotion !== 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('stopped')} style={{ height: 56, fontSize: 17 }}>정차</button>
              </div>
            </div>
          )}

          <div className="action-grid">
            {resting ? (
              <button className="action accent" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}><Timer size={26} />휴식 종료</button>
            ) : (
              <button className="action accent" disabled={driving && !isDemo} onClick={() => TripController.beginRest()} aria-describedby={driving ? 'drive-lock' : undefined}>
                <Coffee size={26} />휴식 시작
                {driving && isDemo && <span className="t-cap" style={{ fontWeight: 500, color: '#5e4512' }}>데모: 휴게소 진입으로 처리</span>}
              </button>
            )}
            <button className="action danger" onClick={() => setEndSheet(true)}><Square size={22} fill="#D93F3C" />여행 종료</button>
          </div>
          {driving && (
            <p id="drive-lock" className="lock-note"><Lock size={15} />{isDemo ? '주행 중에는 장소 상세·일기 편집이 잠겨요. (데모에서는 휴식 시작 시 휴게소에 들어간 것으로 처리)' : '주행 중에는 휴식 시작·장소 상세·일기 편집이 잠겨요. 정차 후 이용해 주세요.'}</p>
          )}
          <button className="link" onClick={() => setShowMore((v) => !v)} style={{ alignSelf: 'flex-start' }}>
            <span className="live-dot" style={{ marginRight: 8 }} />여행 기록 상태 {showMore ? '접기' : '보기'}
          </button>
          {showMore && (
            <div className="card" style={{ fontSize: 14 }}>
              <ul className="t-sub" style={{ margin: 0, paddingLeft: 18 }}>
                <li>데이터 출처: {isDemo ? '데모 시뮬레이션' : live.kind === 'manual' ? '수동 기록' : '기기 위치(GPS)'}</li>
                <li>{live.recordRoute ? `경로 점 ${live.route.length}개 저장` : '경로 저장 안 함'}</li>
                <li>걸러낸 비정상 좌표 {e.rejectedFixes}개 (순간 이동·낮은 정확도·0,0 좌표)</li>
                <li>휴식 {e.restCount}회 · 휴식 시간 {formatDuration(e.restTotalSec)} · 알림 간격 {e.restIntervalMin}분</li>
                <li>현재 위치 {live.position ? regionLabel(live.position) : '확인 중'}</li>
              </ul>
              {isDemo && (
                <>
                  <p style={{ fontWeight: 700 }} className="mt-16">시뮬레이션 속도</p>
                  <div className="chips mt-8">
                    {DEMO_SPEEDS.map((s) => <button key={s} className={`chip ${live.demoSpeed === s ? 'on' : ''}`} onClick={() => TripController.setDemoSpeed(s)}>{s}배속</button>)}
                  </div>
                </>
              )}
            </div>
          )}
          {live.arrived && <Hint tone="green">목적지 근처에 도착했어요. 여행을 마치려면 ‘여행 종료’를 눌러 주세요.</Hint>}
        </div>

        {/* ── 중앙: 지도 ── */}
        <div className="dash-map">
          {live.kind === 'manual' ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
              <EmptyState kind="empty-place" title="위치 없이 기록 중이에요" desc="수동 기록 모드에서는 지도와 경로가 표시되지 않아요." />
            </div>
          ) : (
            <RoadMap
              jsKey={mapJsKey(settings)}
              route={live.route}
              plannedRoute={isDemo ? DEMO_ROUTE : []}
              markers={markers}
              height={wide ? 600 : 320}
              follow={live.position}
              allowTrafficLayer
              ariaLabel="실시간 이동 경로 지도"
            />
          )}
          {route.destinationName && (
            <div className="nav-banner">
              <Navigation size={24} color="var(--primary)" />
              <div>
                <p style={{ fontWeight: 750 }}>{route.destinationName}까지</p>
                <p className="t-cap num">
                  {[route.etaMinutes != null ? `약 ${formatDuration(route.etaMinutes * 60)}${route.etaEstimated ? '(추정)' : ''}` : null,
                    route.remainingKm != null ? `${formatKm(route.remainingKm)}${route.remainingKind === 'straight' ? '(직선)' : ''}` : null].filter(Boolean).join(' · ') || '경로 정보 없음'}
                </p>
              </div>
            </div>
          )}
          <div className="hazard-bar" role="group" aria-label="도로 위험 정보">
            {!traffic ? (
              <span className="t-cap" style={{ fontWeight: 600 }}><TriangleAlert size={14} style={{ verticalAlign: -2 }} /> 도로 위험 정보 미연동 (서버 설정 필요)</span>
            ) : (
              <>
                {hzCounts.map(({ t, n }) => (
                  <button key={t} className={`hz ${n ? 'on' : ''}`} onClick={() => !driving && setHzSheet(true)} aria-label={`${HAZARD_LABEL[t]} ${n}건`}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: n ? HAZARD_COLOR[t] : '#D5DDEA' }} />
                    {HAZARD_LABEL[t]}{n ? ` ${n}` : ''}
                  </button>
                ))}
                {traffic.provenance === 'demo' && <span className="badge sample">데모</span>}
                {hazards.error && <span className="badge warn" title={hazards.error}>오류</span>}
              </>
            )}
          </div>
        </div>

        {/* ── 우측: 근처 휴식 장소 추천 + 음성 명령 ── */}
        <div className="dash-col right">
          <section className="rec-card" aria-label="근처 휴식 장소 추천">
            <div className="row between" style={{ marginBottom: 8 }}>
              <p className="h-md row" style={{ gap: 6 }}><Coffee size={18} color="var(--primary)" />근처 휴식 장소 추천</p>
              {placeProvider.isSample && <span className="badge sample">샘플</span>}
            </div>
            {!live.position ? <p className="t-sub">위치를 확인하면 추천해 드려요.</p> : visibleRecs.length === 0 ? <p className="t-sub">추천할 장소를 찾는 중이에요.</p> : (
              visibleRecs.map(({ place, distanceKm }) => (
                <button key={place.id} className="rec-item" onClick={() => { const r = openNavigation(place.name, place.latitude, place.longitude, place.isSample); if (!r.ok) toast(r.message!, 'error'); }} aria-label={`${place.name} 길 안내`}>
                  <PlaceThumb category={place.category} size={56} radius={14} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700 }} className="ellipsis">{place.name}</p>
                    <p className="t-cap" style={{ color: place.policy.smallDog || place.policy.largeDog ? 'var(--mint-text)' : undefined }}>
                      {place.policy.smallDog || place.policy.largeDog ? '반려견 동반 가능' : '반려견 동반 확인 필요'}
                    </p>
                  </div>
                  <span className="t-cap num">{formatKm(distanceKm)}</span>
                </button>
              ))
            )}
            <button className="btn ghost sm block mt-8" onClick={() => setRestSheet(['restArea', 'park', 'cafe'])}>전체보기 <ChevronRight size={16} /></button>
          </section>
          <button className="voice-card" onClick={onVoice} aria-label="음성 명령">
            <span className={`mic ${voice.listening ? 'listening' : ''}`}><Mic size={22} /></span>
            <span className="grow">
              <span style={{ fontWeight: 700, display: 'block' }}>“가까운 휴게소 찾아줘”</span>
              <span className="t-cap">{voice.text ?? (speechRecognitionSupported() ? '눌러서 말하기 · 예: 다음 휴식까지 얼마나 남았어?' : '데모 · 이 브라우저는 음성 인식 미지원')}</span>
            </span>
          </button>
          <div className="chips">
            {(['rest-area', 'cafe', 'rest-left'] as VoiceIntent[]).map((it) => (
              <button key={it} className="chip" style={{ fontSize: 12.5, minHeight: 32 }} onClick={() => runIntent(it, null)}>
                {it === 'rest-area' ? '가까운 휴게소' : it === 'cafe' ? `${mainPet}랑 갈 카페` : '다음 휴식까지?'}
              </button>
            ))}
          </div>
        </div>
      </div>

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

      <NearbyRestSheet categories={restSheet} onClose={() => setRestSheet(null)} position={live.position} driving={driving} tripId={live.trip.id} apiBase={settings.apiBaseUrl} />

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
        <h2 id="end-title" className="h-lg">여행을 마칠까요?</h2>
        <p className="t-sub mt-8">{formatKm(e.distanceKm)} · 주행 {formatDuration(e.drivingSec)}의 기록이 여행 앨범에 저장돼요.</p>
        <div className="btn-row mt-24">
          <button className="btn ghost" disabled={ending} onClick={() => setEndSheet(false)}>계속 기록</button>
          <button className="btn primary" disabled={ending} onClick={finish}>{ending ? '저장 중…' : '여행 종료'}</button>
        </div>
        <button className="link mt-16" style={{ width: '100%', justifyContent: 'center' }} disabled={ending} onClick={async () => { await TripController.discard(); setEndSheet(false); toast('기록을 저장하지 않고 취소했어요.'); navigate('/home', { replace: true }); }}>
          기록하지 않고 취소하기
        </button>
      </Sheet>
    </div>
  );
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
