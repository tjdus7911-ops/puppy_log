import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, FlaskConical, MapPin, Plus, Route, ShieldCheck, X } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam, useRoute } from '../app/router';
import { planRests, SAFETY_ITEMS } from '../domain/plan';
import { formatDuration } from '../domain/format';
import { openNavigation } from '../places/navigation';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { REGIONS } from '../domain/regions';
import type { GeoPoint } from '../domain/models';
import { TripController, type StartKind } from '../trip/TripController';
import { DEMO_DESTINATION, DEMO_TOTAL_KM, pointAtKm } from '../vehicle/demoRoute';
import { ASSUMED_AVG_KMH } from '../domain/plan';
import { Hint, Sheet, Switch, TopBar } from '../ui/components';
import { PetAvatar, PlaceThumb } from '../ui/Art';
import { PlaceRow, Stat } from '../ui/kit';
import { callName } from '../domain/tripText';
import { SafetyCheck } from './SafetyCheck';
import { RestIntervalPicker } from './PetForm';

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
  const [interval, setIntervalMin] = useState(pets[0]?.restIntervalMinutes ?? settings.defaultRestIntervalMinutes);
  const [recordRoute, setRecordRoute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permSheet, setPermSheet] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = destText.trim();
    if (!q || dest) return [];
    return REGIONS.filter((r) => r.name.includes(q) || r.province.includes(q)).slice(0, 6);
  }, [destText, dest]);

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

  const togglePet = (id: string) => {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      const first = pets.find((p) => p.id === next[0]);
      if (first) setIntervalMin(first.restIntervalMinutes);
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

  const mainPet = pets.find((p) => p.id === selected[0]);
  const step = (n: number, title: string, aside?: React.ReactNode) => (
    <div className="step-h"><span className="step-n">{n}</span><h2 className="h-md">{title}</h2>{aside}</div>
  );

  return (
    <div className="screen no-nav" style={{ paddingBottom: 0 }}>
      <TopBar title="새 여행" right={settings.demoMode ? <span className="badge sample" style={{ marginRight: 8 }}><FlaskConical size={12} />데모 모드</span> : undefined} />
      {fromCommunity && <div className="hint green" style={{ marginBottom: 12 }}><MapPin size={16} /><div>커뮤니티 게시글의 장소를 목적지로 불러왔어요. 내비게이션 연결은 차량 내비 지원 범위(웹: 카카오맵 링크)를 따라요.</div></div>}
      {fromNavi && <div className="hint" style={{ marginBottom: 12 }}><span className="badge sample" style={{ height: 20 }}>데모</span>차량 내비에 설정된 목적지를 불러왔어요(실제 차량에서는 Pleos NaviHelper 연동 예정).</div>}

      <div className="stack" style={{ marginTop: 8 }}>
        {/* 1. 목적지 */}
        <section>
          {step(1, '목적지', <span className="t-cap">선택</span>)}
          <div className="dest-box" style={!destText ? { borderColor: 'var(--line)' } : undefined}>
            <MapPin size={22} color="var(--primary)" />
            <input className="input" placeholder="목적지 없이도 출발할 수 있어요" value={destText} onChange={(e) => { setDestText(e.target.value); setDest(null); }} aria-label="목적지" />
            {destText && <button className="icon-btn" aria-label="목적지 지우기" onClick={() => { setDestText(''); setDest(null); }}><X size={18} /></button>}
          </div>
          {suggestions.length > 0 && (
            <div className="list-card mt-8">
              {suggestions.map((r) => (
                <button key={r.id} className="row-btn" onClick={() => { setDestText(r.name); setDest(r); }}>
                  <MapPin size={16} color="var(--text-2)" />
                  <span className="grow">{r.name} <span className="t-cap">{r.province}</span></span>
                </button>
              ))}
            </div>
          )}
          {destText && !dest && suggestions.length === 0 && <p className="t-cap mt-8">목록에 없는 곳은 이름만 기록하고 위치는 여행 경로로 정리해요.</p>}
        </section>

        {/* 2. 반려견 */}
        <section>
          {step(2, '함께 이동할 반려견')}
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {pets.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button key={p.id} className={`pet-pick ${on ? 'on' : ''}`} onClick={() => togglePet(p.id)} aria-pressed={on}>
                  <PetAvatar uri={p.photoUri} size={64} />
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="t-cap" style={{ fontSize: 12 }}>{p.restIntervalMinutes}분 간격</span>
                  {on && <span className="chk"><Check size={14} strokeWidth={3} /></span>}
                </button>
              );
            })}
            <button className="pet-pick" style={{ borderStyle: 'dashed', justifyContent: 'center' }} onClick={() => navigate('/pet/new')}>
              <span className="icon-tile" style={{ width: 48, height: 48, borderRadius: 24 }}><Plus size={22} /></span>
              <span className="t-cap">반려견 추가</span>
            </button>
          </div>
        </section>

        {/* 3. 예상 이동 시간 · 경로 */}
        <section>
          {step(3, '예상 이동 시간 · 경로', plan ? <span className="badge est">추정</span> : undefined)}
          <div className="card" style={{ display: 'grid', gap: 16 }}>
            <div className="route-pts">
              <div className="route-rail"><i /><b /><i className="to" /></div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div><p style={{ fontWeight: 600 }}>{settings.demoMode ? '서울 (데모 출발지)' : '현재 위치'}</p><p className="t-cap">출발</p></div>
                <div><p style={{ fontWeight: 600 }}>{destText || '목적지 미정'}</p><p className="t-cap">도착</p></div>
              </div>
            </div>
            {plan ? (
              <>
                <div className="divider" style={{ margin: 0 }} />
                <div className="row" style={{ gap: 28 }}>
                  <Stat value={String(Math.round(DEMO_TOTAL_KM))} unit="km" label="이동 거리" />
                  <Stat value={formatHM(plan.drivingMinutes)} label="예상 주행 시간" />
                </div>
                <p className="t-cap">데모 모드: 평균 {ASSUMED_AVG_KMH}km/h로 계산한 추정값이에요. 차량 내비가 연동되면 실제 예상 시간으로 바뀌어요(Android NaviHelper 예정).</p>
              </>
            ) : (
              <p className="t-cap">{dest ? '출발 위치를 아직 알 수 없어 예상 시간은 출발 후 계산해요.' : '목적지를 고르면 예상 주행 시간과 휴식 횟수를 알려드려요.'}</p>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="muted-box row" style={{ gap: 10, padding: '10px 12px' }}>
                <Route size={18} color="var(--text-2)" /><span className="grow t-cap">경로 옵션은 차량 내비 설정을 따라요</span>
              </div>
              <div className="row between" style={{ gap: 8 }}>
                <span className="t-cap">목적지를 내비게이션으로 보내기 <span style={{ color: 'var(--text-3)' }}>(웹: 카카오맵 링크)</span></span>
                <button className="btn ghost sm" disabled={!dest} onClick={() => {
                  if (!dest) return;
                  const r = openNavigation(destText || '목적지', dest.latitude, dest.longitude, false);
                  if (!r.ok) toast(r.message!, 'error');
                }}>보내기</button>
              </div>
              <div className="row between"><span className="t-cap">내비 + 멍로드 분할 화면</span><span className="badge gray">미지원 · 차량 확인 필요</span></div>
            </div>
          </div>
        </section>

        {/* 4. 휴식 계획 */}
        <section>
          {step(4, `${mainPet ? callName(mainPet.name) : '우리 강아지'} 맞춤 휴식 계획`)}
          <RestIntervalPicker value={interval} onChange={setIntervalMin} />
          <p className="t-cap mt-8">실제 주행 시간이 이 간격에 이르면 알려드려요. 신호 대기·정체는 휴식으로 세지 않아요.</p>
          {plan && (
            <div className="card mt-12" style={{ display: 'grid', gap: 18 }}>
              <div className="row between" style={{ alignItems: 'flex-end' }}>
                <div><p className="t-cap">예상 휴식</p><p className="big-num num">{plan.minRests === plan.maxRests ? plan.minRests : `${plan.minRests}~${plan.maxRests}`}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 4 }}>회</span></p></div>
                <p className="t-cap">{interval}분마다 · {formatDuration(plan.drivingMinutes * 60)} 주행</p>
              </div>
              <div>
                <div className="jbar big" role="img" aria-label="휴식 예정 지점">
                  <span className="track" style={{ background: 'var(--primary)' }} />
                  <span className="end start" /><span className="end goal" style={{ background: 'var(--primary)' }} />
                  {plan.dueAtMinutes.map((m) => <span key={m} className="rest" style={{ left: `${(m / plan.drivingMinutes) * 100}%` }} />)}
                </div>
                <div className="jbar-labels"><span>출발</span>{plan.dueAtMinutes.slice(0, 1).map((m) => <span key={m} className="rest">휴식 1 · {formatHM(m)}</span>)}<span>도착 {formatHM(plan.drivingMinutes)}</span></div>
              </div>
              {restStops.length > 0 && (
                <div>
                  <p className="t-cap" style={{ marginBottom: 4 }}>추천 휴식 장소 · 휴식 예정 지점 근처</p>
                  {restStops.map((r, i) => (
                    <PlaceRow key={r.atMin}
                      thumb={<PlaceThumb category={r.place?.category ?? 'restArea'} size={56} radius={14} />}
                      title={r.place?.name ?? '추천할 장소를 찾지 못했어요'}
                      meta={`휴식 ${i + 1} · 출발 후 약 ${Math.round(r.atKm)}km · ${r.place ? (r.place.policy.smallDog || r.place.policy.largeDog ? '동반 가능(샘플)' : '동반 확인 필요') : ''}`}
                      status={r.place?.isSample !== false ? { tone: 'sample', label: '샘플' } : undefined} />
                  ))}
                  <p className="t-cap mt-8">출발 후 휴식 알림 때 이 장소를 다시 추천하고 들를지 물어봐요. 경유지는 직접 동의한 경우에만 요청해요.</p>
                </div>
              )}
              <label className="row" style={{ gap: 12, fontSize: 14.5 }}>
                <span className="grow">도착 20분 전 휴식은 건너뛰기</span>
                <Switch checked={settings.skipRestNearArrival} onChange={(v) => updateSettings({ skipRestNearArrival: v })} label="도착 직전 휴식 제외" />
              </label>
            </div>
          )}
        </section>

        {/* 기록 설정 */}
        <section className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="row">
            <div className="grow">
              <p style={{ fontWeight: 600 }}>이동 경로 기록</p>
              <p className="t-cap mt-8" style={{ marginTop: 2 }}>허용한 위치 범위에서만 경로를 저장해요. 끄면 시간·거리만 기록해요.</p>
            </div>
            <Switch checked={recordRoute} onChange={setRecordRoute} label="이동 경로 기록" />
          </div>
          {settings.demoMode && (
            <div>
              <p style={{ fontWeight: 600 }}>시뮬레이션 속도</p>
              <div className="chips mt-8">
                {DEMO_SPEEDS.map((sp) => (
                  <button key={sp} className={`chip ${settings.demoSpeed === sp ? 'on' : ''}`} onClick={() => updateSettings({ demoSpeed: sp })}>{sp}배속</button>
                ))}
              </div>
            </div>
          )}
        </section>

        <button className="card row" style={{ gap: 12, textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => setSafetyOpen(true)}>
          <span className="icon-tile rest"><ShieldCheck size={20} /></span>
          <span className="grow"><b style={{ fontWeight: 600 }}>출발 전 안전 체크 {settings.safetyChecks.length}/{SAFETY_ITEMS.length}</b><br /><span className="t-cap">하네스 · 물 · 배변봉투 등 보호자 확인 목록</span></span>
          <ChevronRight size={18} color="var(--text-3)" />
        </button>

        {!settings.demoMode && <Hint tone="green">여행을 시작하면 위치 권한을 요청해요. 허용하지 않아도 수동 기록 모드로 여행을 기록할 수 있어요.</Hint>}
      </div>

      <div className="bottom-cta">
        <button className="btn primary block xl" disabled={busy || selected.length === 0} onClick={() => start(kind)}>
          {busy ? '준비 중…' : `${mainPet ? callName(mainPet.name) : '우리 강아지'}와 출발하기`}
        </button>
        <span className="t-cap" style={{ fontSize: 12 }}>출발하면 휴식 알림과 이동 기록이 시작돼요</span>
      </div>

      <Sheet open={safetyOpen} onClose={() => setSafetyOpen(false)} labelledBy="safety-title"><SafetyCheck /></Sheet>
      <Sheet open={!!permSheet} onClose={() => setPermSheet(null)} labelledBy="perm-title">
        <h2 id="perm-title" className="h-lg">위치 없이 기록할까요?</h2>
        <p className="t-sub mt-8">{permSheet}</p>
        <div className="muted-box mt-16 t-body" style={{ fontSize: 14 }}>
          <b>수동 기록 모드</b>에서는 여행 시간과 주행·정차 상태를 직접 기록해요. 이동 거리는 여행을 마친 뒤 입력할 수 있어요.
          위치 권한은 브라우저(또는 기기) 설정에서 언제든 다시 허용할 수 있어요.
        </div>
        <div className="btn-row mt-24">
          <button className="btn ghost" onClick={() => setPermSheet(null)}>취소</button>
          <button className="btn primary" onClick={() => { setPermSheet(null); void start('manual'); }}>수동으로 시작</button>
        </div>
      </Sheet>
    </div>
  );
}
