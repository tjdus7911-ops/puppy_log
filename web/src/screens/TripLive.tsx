import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  BellRing, Car, ChevronDown, CircleParking, Coffee, Flag, FlaskConical, Lock, MapPin, Navigation, Satellite, Square, Timer, TriangleAlert,
} from 'lucide-react';
import { TripController } from '../trip/TripController';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { formatClock, formatDuration, formatKm } from '../domain/format';
import { regionLabel } from '../domain/regions';
import { callName, josa, petNames as joinNames } from '../domain/tripText';
import { newId } from '../domain/models';
import { repo } from '../data/db';
import { DEMO_ROUTE } from '../vehicle/demoRoute';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import type { Place } from '../places/PlaceSearchProvider';
import { openNavigation } from '../places/navigation';
import { EmptyState, Hint, Loading, Sheet } from '../ui/components';
import { PetAvatar, PlaceThumb } from '../ui/Art';
import { MapView } from '../ui/MapView';
import { DEMO_SPEEDS } from './TripSetup';

function withPets(names: string[]) {
  const w = joinNames(names.length ? names : ['우리 강아지']);
  return `${w}${josa(w, '과', '와')}`;
}

const STATUS = {
  driving: { label: '주행 중', icon: Car },
  stopped: { label: '일시 정차', icon: CircleParking },
  resting: { label: '휴식 중', icon: Coffee },
  ended: { label: '여행 종료', icon: Flag },
};

export default function TripLive() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const { pets, settings, toast, reload } = useStore();
  const [restSheet, setRestSheet] = useState(false);
  const [endSheet, setEndSheet] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (live.lastError) {
      toast(live.lastError, 'error');
      TripController.clearError();
    }
  }, [live.lastError, toast]);

  if (!live.active || !live.engine || !live.trip) {
    return (
      <div className="screen no-nav">
        <EmptyState title="진행 중인 여행이 없어요" desc="홈에서 새 여행을 시작해 보세요." action={<button className="btn primary" onClick={() => navigate('/home', { replace: true })}>홈으로</button>} />
      </div>
    );
  }

  const e = live.engine;
  const driving = e.status === 'driving';
  const resting = e.status === 'resting';
  const tripPets = pets.filter((p) => live.petNames.includes(p.name));
  const mainPet = callName(live.petNames[0] ?? '우리 강아지');
  const interval = e.restIntervalMin * 60;
  const left = live.secondsUntilRest;
  const progress = Math.min(1, Math.max(0, e.drivingSinceRestSec / Math.max(1, interval)));
  const restElapsed = resting && e.restStartedAt ? (e.lastTick - e.restStartedAt) / 1000 : 0;
  const St = STATUS[e.status];
  const isDemo = live.kind === 'demo';

  const finish = async () => {
    setEnding(true);
    const id = await TripController.end();
    setEnding(false);
    setEndSheet(false);
    if (id) {
      await reload();
      navigate(`/album/${id}?new=1`, { replace: true });
    }
  };

  return (
    <div className="live wide-layout">
      <div className="live-head">
        <header className="row" style={{ height: 60, gap: 6 }}>
          <button className="icon-btn" aria-label="홈으로 (기록은 계속돼요)" onClick={() => navigate('/home')}><ChevronDown size={26} /></button>
          <div className="row grow" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 0 }}>
              {tripPets.slice(0, 3).map((p, i) => <div key={p.id} style={{ marginLeft: i ? -10 : 0 }}><PetAvatar uri={p.photoUri} size={34} ring /></div>)}
            </div>
            <span style={{ fontWeight: 700 }} className="ellipsis">{withPets(live.petNames)} 이동 중</span>
          </div>
          <span className={`status-pill ${e.status}`} role="status"><St.icon size={18} />{St.label}</span>
        </header>
        {live.kind === 'demo' && <div className="demo-ribbon"><FlaskConical size={14} /> 데모 시뮬레이션 · 이 기록은 실제 통계에 포함되지 않아요</div>}
        {live.kind === 'manual' && <div className="demo-ribbon" style={{ background: '#f0efeb', color: 'var(--text-2)' }}>수동 기록 모드 · 위치 없이 시간만 기록해요</div>}
        {live.gpsLost && (
          <div className="hint red mt-8"><Satellite size={16} /><div>GPS 신호가 약해요. 신호가 돌아오면 경로를 이어서 기록해요. 끊긴 동안의 주행 시간은 추정하지 않아요.</div></div>
        )}
      </div>

      <div className="live-grid" style={{ marginTop: 14 }}>
        {/* 휴식 타이머 */}
        <div className="card row" style={{ gap: 18, alignItems: 'center' }}>
          <Ring progress={resting ? 1 : progress} tone={resting ? 'accent' : left <= 0 ? 'error' : left <= 600 ? 'accent' : 'primary'}>
            {resting ? (
              <>
                <span className="t-cap">휴식 시간</span>
                <span className="num" style={{ fontSize: 28, fontWeight: 800 }}>{formatClock(restElapsed)}</span>
              </>
            ) : (
              <>
                <span className="t-cap">다음 휴식까지</span>
                <span className="num" style={{ fontSize: 28, fontWeight: 800, color: left <= 0 ? 'var(--error)' : undefined }}>
                  {left <= 0 ? '지금' : formatClock(left)}
                </span>
              </>
            )}
          </Ring>
          <div className="grow">
            <p className="t-cap">실제 주행 시간</p>
            <p className="big-stat" style={{ fontSize: 30 }}>{formatClock(e.drivingSec)}</p>
            <p className="t-cap mt-12">전체 여행 시간</p>
            <p className="num" style={{ fontSize: 20, fontWeight: 700 }}>{formatClock(e.elapsedSec)}</p>
          </div>
        </div>

        <div className="grid-2">
          <div className="stat"><span className="k"><Navigation size={14} />누적 이동 거리</span><p className="v">{live.kind === 'manual' ? '—' : formatKm(e.distanceKm)}</p></div>
          <div className="stat"><span className="k"><MapPin size={14} />현재 위치</span><p className="v ellipsis" style={{ fontSize: 17 }}>{live.position ? regionLabel(live.position) : live.kind === 'manual' ? '위치 미사용' : '찾는 중…'}</p></div>
        </div>

        {live.kind !== 'manual' && (
          <MapView
            height={driving ? 190 : 230}
            route={live.route}
            plannedRoute={live.kind === 'demo' ? DEMO_ROUTE : []}
            markers={[
              ...(live.trip.destination ? [{ id: 'dest', point: live.trip.destination, kind: 'dest' as const, label: '목적지' }] : []),
              ...(live.position ? [{ id: 'cur', point: live.position, kind: 'current' as const }] : []),
            ]}
            ariaLabel="실시간 이동 경로"
          />
        )}

        {live.kind === 'manual' && (
          <div className="card">
            <p style={{ fontWeight: 700 }}>지금 이동 상태</p>
            <div className="seg mt-12" role="radiogroup" aria-label="이동 상태">
              <button className={live.manualMotion === 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('moving')} style={{ height: 60, fontSize: 17 }}>주행 중</button>
              <button className={live.manualMotion !== 'moving' && !resting ? 'on' : ''} disabled={resting} onClick={() => TripController.setManualMotion('stopped')} style={{ height: 60, fontSize: 17 }}>정차</button>
            </div>
          </div>
        )}

        {/* 메인 기능 버튼: 차량 화면을 고려해 큰 터치 영역 */}
        <div className="action-grid">
          {resting ? (
            <button className="action accent" onClick={async () => { const d = await TripController.finishRest(); toast(`휴식을 마쳤어요 · ${formatDuration(d)}`); }}>
              <Timer size={26} />휴식 종료
            </button>
          ) : (
            <button className="action accent" disabled={driving && !isDemo} onClick={() => TripController.beginRest()} aria-describedby={driving ? 'drive-lock' : undefined}>
              <Coffee size={26} />휴식 시작
              {driving && isDemo && <span className="t-cap" style={{ fontWeight: 500, color: '#5e4512' }}>데모: 휴게소 진입으로 처리</span>}
            </button>
          )}
          <button className="action" onClick={() => setRestSheet(true)}><Navigation size={26} color="var(--primary)" />주변 휴식 장소</button>
          <button className="action" onClick={() => setShowMore((v) => !v)}>
            <span className="row" style={{ gap: 6 }}><span className="live-dot" />여행 기록</span>
            <span className="t-cap" style={{ fontWeight: 500 }}>{live.recordRoute ? `경로 점 ${live.route.length}개` : '경로 저장 안 함'}</span>
          </button>
          <button className="action danger" onClick={() => setEndSheet(true)}><Square size={24} fill="#b8453d" />여행 종료</button>
        </div>
        {driving && (
          <p id="drive-lock" className="lock-note"><Lock size={15} />{isDemo ? '주행 중에는 장소 상세·일기 편집이 잠겨요. (데모에서는 휴식 시작 시 휴게소에 들어간 것으로 처리해요)' : '주행 중에는 휴식 시작·장소 상세·일기 편집이 잠겨요. 정차 후 이용해 주세요.'}</p>
        )}

        {showMore && (
          <div className="card" style={{ fontSize: 14 }}>
            <p style={{ fontWeight: 700 }}>기록 상태</p>
            <ul className="t-sub mt-8" style={{ margin: 0, paddingLeft: 18 }}>
              <li>데이터 출처: {live.kind === 'demo' ? '데모 시뮬레이션' : live.kind === 'manual' ? '수동 기록' : '기기 위치(GPS)'}</li>
              <li>휴식 {e.restCount}회 · 휴식 시간 {formatDuration(e.restTotalSec)}</li>
              <li>걸러낸 비정상 좌표 {e.rejectedFixes}개 (순간 이동·낮은 정확도·0,0 좌표)</li>
              <li>휴식 알림 간격 {e.restIntervalMin}분</li>
            </ul>
            {live.kind === 'demo' && (
              <>
                <p style={{ fontWeight: 700 }} className="mt-16">시뮬레이션 속도</p>
                <div className="chips mt-8">
                  {DEMO_SPEEDS.map((s) => (
                    <button key={s} className={`chip ${live.demoSpeed === s ? 'on' : ''}`} onClick={() => TripController.setDemoSpeed(s)}>{s}배속</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {live.arrived && <Hint tone="green">목적지 근처에 도착했어요. 여행을 마치려면 ‘여행 종료’를 눌러 주세요.</Hint>}
      </div>

      <ReminderSheet
        open={!!live.reminder}
        kind={live.reminder?.kind ?? 'soon'}
        petName={mainPet}
        driven={live.reminder?.drivenMinutes ?? 0}
        minutesLeft={live.reminder?.minutesLeft ?? 0}
        onFind={() => { TripController.dismissReminder(); setRestSheet(true); }}
        onSnooze={() => { TripController.snoozeReminder(15); toast('15분 뒤에 다시 알려드릴게요.'); }}
        onRest={() => TripController.beginRest()}
        onClose={() => TripController.dismissReminder()}
        canStartRest={!driving || isDemo}
      />

      <NearbyRestSheet open={restSheet} onClose={() => setRestSheet(false)} position={live.position} driving={driving} tripId={live.trip.id} apiBase={settings.apiBaseUrl} />

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

function Ring({ progress, tone, children }: { progress: number; tone: 'primary' | 'accent' | 'error'; children: React.ReactNode }) {
  const r = 66;
  const c = 2 * Math.PI * r;
  const color = { primary: '#5B8C72', accent: '#F4B860', error: '#E66A61' }[tone];
  return (
    <div className="ring" role="img" aria-label="휴식 타이머">
      <svg width="156" height="156" viewBox="0 0 156 156">
        <circle cx="78" cy="78" r={r} fill="none" stroke="#F0EEE8" strokeWidth="12" />
        <circle cx="78" cy="78" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: 'stroke-dashoffset .5s' }} />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

function ReminderSheet(p: { open: boolean; kind: 'soon' | 'due'; petName: string; driven: number; minutesLeft: number; onFind: () => void; onSnooze: () => void; onRest: () => void; onClose: () => void; canStartRest: boolean }) {
  return (
    <Sheet open={p.open} onClose={p.onClose} center labelledBy="rem-title">
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: '#a26c12', display: 'grid', placeItems: 'center' }}><BellRing size={28} /></div>
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
            <button className="btn primary block" onClick={p.onFind}><Navigation size={18} />주변 휴식 장소 찾기</button>
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

function NearbyRestSheet({ open, onClose, position, driving, tripId, apiBase }: { open: boolean; onClose: () => void; position: { latitude: number; longitude: number } | null; driving: boolean; tripId: string; apiBase: string }) {
  const { toast } = useStore();
  const [state, setState] = useState<{ loading: boolean; error: string | null; places: { place: Place; distanceKm: number | null }[] }>({ loading: false, error: null, places: [] });
  const provider = useMemo(() => getPlaceProvider(apiBase), [apiBase]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open || !position) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([
      provider.search({ category: 'restArea', centers: [position], radiusKm: 15 }, ac.signal),
      provider.search({ category: 'park', centers: [position], radiusKm: 8 }, ac.signal),
    ])
      .then(([a, b]) => setState({ loading: false, error: null, places: sortByDistance([...a, ...b], position).slice(0, driving ? 3 : 8) }))
      .catch((e) => { if (e.name !== 'AbortError') setState({ loading: false, error: (e as Error).message, places: [] }); });
    return () => ac.abort();
  }, [open, position?.latitude.toFixed(2), position?.longitude.toFixed(2), driving, provider, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <p className="t-cap mt-8">{distanceKm != null ? formatKm(distanceKm) : ''} · {place.isSample ? '샘플 데이터' : place.sourceLabel}</p>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <button className="btn primary sm" style={{ minHeight: driving ? 52 : 40 }} onClick={() => { const r = openNavigation(place.name, place.latitude, place.longitude, place.isSample); if (!r.ok) toast(r.message!, 'error'); }}>
                  안내
                </button>
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
