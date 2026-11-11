import { useEffect, useMemo, useState } from 'react';
import { Check, FlaskConical, MapPin, Play, X } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam, useRoute } from '../app/router';
import { planRests } from '../domain/plan';
import { formatDuration, formatKm } from '../domain/format';
import { openNavigation } from '../places/navigation';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { REGIONS } from '../domain/regions';
import type { GeoPoint } from '../domain/models';
import { TripController, type StartKind } from '../trip/TripController';
import { DEMO_DESTINATION, DEMO_TOTAL_KM, pointAtKm } from '../vehicle/demoRoute';
import { ASSUMED_AVG_KMH } from '../domain/plan';
import { Hint, Sheet, Switch, TopBar } from '../ui/components';
import { PetAvatar, Scene } from '../ui/Art';
import { RestIntervalPicker } from './PetForm';

export const DEMO_SPEEDS = [1, 10, 30, 60, 120, 300];

export default function TripSetup() {
  const { pets, settings, updateSettings, toast } = useStore();
  const [selected, setSelected] = useState<string[]>(pets[0] ? [pets[0].id] : []);
  const route = useRoute();
  const qDest = queryParam(route, 'dest');
  const fromNavi = queryParam(route, 'from') === 'navi';
  // 데모 모드에서 '강릉'을 고르면 데모 경로 목적지(경포해변)로 맞춤
  const initial = (() => {
    if (qDest) {
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

  return (
    <div className="screen no-nav">
      <TopBar title="여행 시작" />
      {fromNavi && <div className="hint" style={{ marginBottom: 8 }}><span className="badge sample" style={{ height: 20 }}>데모</span>차량 내비에 설정된 목적지를 불러왔어요(실제 차량에서는 Pleos NaviHelper 연동 예정).</div>}
      {settings.demoMode && (
        <div className="demo-ribbon"><FlaskConical size={14} /> 데모 모드 · 실제 차량·위치 대신 가상 주행 데이터를 사용해요</div>
      )}

      <div className="setup-hero">
        <div>
          <p className="h-xl">여행 시작하기</p>
          <p className="t-body mt-8" style={{ color: 'var(--text-2)' }}>{pets.find((p) => p.id === selected[0])?.name ?? '우리 강아지'}와<br />새로운 여행을 시작할까요?</p>
        </div>
        <div style={{ width: 170, flex: 'none' }}><Scene kind="drive" height={120} /></div>
      </div>
      <section className="section" style={{ marginTop: 18 }}>
        <h2 className="h-md">함께 이동할 반려견</h2>
        <div className="row mt-12" style={{ flexWrap: 'wrap', gap: 14 }}>
          {pets.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} onClick={() => togglePet(p.id)} aria-pressed={on} style={{ border: 0, background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', padding: 0 }}>
                <div style={{ borderRadius: '50%', boxShadow: on ? '0 0 0 3px var(--primary)' : '0 0 0 1px var(--line)', opacity: on ? 1 : 0.6 }}>
                  <PetAvatar uri={p.photoUri} size={64} />
                </div>
                {on && <span style={{ position: 'absolute', top: 0, right: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center' }}><Check size={14} strokeWidth={3} /></span>}
                <span style={{ fontSize: 13.5, fontWeight: on ? 700 : 500 }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2 className="h-md">목적지 <span className="t-cap" style={{ fontWeight: 500 }}>(선택)</span></h2>
        <div style={{ position: 'relative' }} className="mt-12">
          <MapPin size={18} style={{ position: 'absolute', left: 14, top: 17, color: 'var(--text-2)' }} />
          <input
            className="input"
            style={{ paddingLeft: 40, paddingRight: 44 }}
            placeholder="목적지 없이도 출발할 수 있어요"
            value={destText}
            onChange={(e) => { setDestText(e.target.value); setDest(null); }}
            aria-label="목적지"
          />
          {destText && (
            <button className="icon-btn" aria-label="목적지 지우기" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => { setDestText(''); setDest(null); }}>
              <X size={18} />
            </button>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="card mt-8" style={{ padding: '4px 16px' }}>
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

      <section className="section">
        <h2 className="h-md">휴식 알림 간격</h2>
        <div className="mt-12"><RestIntervalPicker value={interval} onChange={setIntervalMin} /></div>
        <p className="t-cap mt-8">실제 주행 시간이 이 간격에 이르면 알려드려요. 신호 대기·정체는 휴식으로 세지 않아요.</p>
      </section>

      <section className="section">
        <h2 className="h-md">반려견 맞춤 휴식 계획</h2>
        {!plan ? (
          <p className="t-sub mt-8">{dest ? '출발 위치를 아직 알 수 없어 예상 시간은 출발 후 계산해요.' : '목적지를 고르면 예상 주행 시간과 휴식 횟수를 알려드려요.'}</p>
        ) : (
          <div className="card mt-12">
            <div className="grid-3">
              <div><p className="k">예상 주행</p><p className="v">{formatDuration(plan.drivingMinutes * 60)}</p></div>
              <div><p className="k">휴식 간격</p><p className="v">{interval}분</p></div>
              <div><p className="k">예상 휴식</p><p className="v">{plan.minRests === plan.maxRests ? `${plan.minRests}회` : `${plan.minRests}~${plan.maxRests}회`}</p></div>
            </div>
            <p className="t-cap mt-12">{formatKm(DEMO_TOTAL_KM)} 경로 · 평균 {ASSUMED_AVG_KMH}km/h 가정 <b>(추정)</b> — 정체로 길어지면 휴식이 늘 수 있어요. 차량 내비 예상 시간 연동은 Android(NaviHelper)에서 진행 예정이에요.</p>
            <label className="row mt-8" style={{ gap: 8, fontSize: 14 }}>
              <Switch checked={settings.skipRestNearArrival} onChange={(v) => updateSettings({ skipRestNearArrival: v })} label="도착 직전 휴식 제외" />
              도착 20분 전 이내의 휴식은 세지 않기
            </label>
            {restStops.length > 0 && (
              <div className="mt-12">
                <p style={{ fontWeight: 700, fontSize: 14 }}>경로 주변 휴식 장소 추천 <span className="badge sample" style={{ height: 20 }}>샘플 데이터</span></p>
                {restStops.map((r) => (
                  <div key={r.atMin} className="row-item" style={{ padding: '10px 0' }}>
                    <span className="badge">{formatDuration(r.atMin * 60)} 후</span>
                    <div className="grow">
                      <p style={{ fontWeight: 650 }} className="ellipsis">{r.place?.name ?? '추천할 장소를 찾지 못했어요'}</p>
                      <p className="t-cap">출발 후 약 {Math.round(r.atKm)}km 지점 · {r.place ? (r.place.policy.smallDog || r.place.policy.largeDog ? '동반 가능(샘플)' : '동반 여부 확인 필요') : ''}</p>
                    </div>
                  </div>
                ))}
                <p className="t-cap">출발 후 휴식 알림 때 이 장소를 다시 추천하고, 들를지 물어봐요. 경유지 추가는 직접 동의한 경우에만 요청해요.</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h-md">내비게이션 연동</h2>
        <div className="card mt-12" style={{ display: 'grid', gap: 10 }}>
          <div className="row between">
            <span style={{ fontSize: 14.5 }}>목적지를 내비게이션으로 보내기</span>
            <button className="btn ghost sm" disabled={!dest} onClick={() => {
              if (!dest) return;
              const r = openNavigation(destText || '목적지', dest.latitude, dest.longitude, false);
              if (!r.ok) toast(r.message!, 'error');
            }}>보내기</button>
          </div>
          <p className="t-cap">웹: 카카오맵 길찾기 링크 · 차량: Pleos NaviHelper 목적지 설정(연동 예정, 미검증)</p>
          <div className="divider" style={{ margin: 0 }} />
          <div className="row between"><span style={{ fontSize: 14.5 }}>경로 옵션</span><span className="badge gray">차량 내비 설정을 따름</span></div>
          <p className="t-cap">멍로드는 자체 ‘편한 길’ 알고리즘이나 급커브·급제동 회피 경로를 제공하지 않아요. 내비 SDK가 지원하는 경로 옵션만 연동할 예정이에요.</p>
          <div className="row between"><span style={{ fontSize: 14.5 }}>내비 + 멍로드 분할 화면</span><span className="badge gray">미지원 · 차량 확인 필요</span></div>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="row">
            <div className="grow">
              <p style={{ fontWeight: 700 }}>이동 경로 기록</p>
              <p className="t-cap mt-8">허용한 위치 범위에서만 경로를 저장해요. 끄면 시간·거리만 기록해요.</p>
            </div>
            <Switch checked={recordRoute} onChange={setRecordRoute} label="이동 경로 기록" />
          </div>
          {settings.demoMode && (
            <>
              <div className="divider" />
              <p style={{ fontWeight: 700 }}>시뮬레이션 속도</p>
              <div className="chips mt-8">
                {DEMO_SPEEDS.map((s) => (
                  <button key={s} className={`chip ${settings.demoSpeed === s ? 'on' : ''}`} onClick={() => updateSettings({ demoSpeed: s })}>{s}배속</button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {!settings.demoMode && (
        <div className="mt-16"><Hint tone="green">여행을 시작하면 위치 권한을 요청해요. 허용하지 않아도 수동 기록 모드로 여행을 기록할 수 있어요.</Hint></div>
      )}

      <button className="btn primary block xl mt-24" disabled={busy || selected.length === 0} onClick={() => start(kind)}>
        <Play size={22} fill="#fff" /> {busy ? '준비 중…' : '여행 시작'}
      </button>

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
