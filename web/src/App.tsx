import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bluetooth, BookOpen, CloudSun, House, MapPin, Navigation, Settings, Signal, Users, Volume2, Wifi, WifiOff } from 'lucide-react';
import { AppProvider, useStore } from './app/store';
import { match, navigate, useRoute } from './app/router';
import { useWide } from './app/useWide';
import { TripController } from './trip/TripController';
import { storageMode } from './data/db';
import { formatClock } from './domain/format';
import { Loading, ErrorState } from './ui/components';
import { PawGlyph } from './ui/Art';
import Onboarding from './screens/Onboarding';
import PetForm from './screens/PetForm';
import Home from './screens/Home';
import TripSetup from './screens/TripSetup';
import TripLive from './screens/TripLive';
import Explore from './screens/Explore';
import Album from './screens/Album';
import TripDetail from './screens/TripDetail';
import DiaryScreen from './screens/DiaryScreen';
import PawMap from './screens/PawMap';
import MyPage from './screens/MyPage';
import Community from './screens/Community';
import PostDetail from './screens/community/PostDetail';
import PlaceView from './screens/community/PlaceView';
import AlbumPick from './screens/community/AlbumPick';
import EditMedia from './screens/community/EditMedia';
import Compose from './screens/community/Compose';
import UploadDone from './screens/community/UploadDone';
import { Draft } from './app/community';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

// 시안의 사이드 내비: 홈 · 이동 · 기록 · 커뮤니티 · 설정
const TABS = [
  { key: 'home', label: '홈', icon: House, match: ['/home'] },
  { key: 'move', label: '여행', icon: Navigation, match: ['/trip/live', '/trip/setup', '/explore'] },
  { key: 'record', label: '기록', icon: BookOpen, match: ['/album', '/pawmap'] },
  { key: 'community', label: '커뮤니티', icon: Users, match: ['/community'] },
  { key: 'settings', label: '설정', icon: Settings, match: ['/my'] },
] as const;

function goTab(key: (typeof TABS)[number]['key']) {
  if (key === 'home') navigate('/home');
  else if (key === 'move') navigate(!TripController.isActive ? '/trip/setup' : TripController.phase === 'at-destination' ? '/home' : '/trip/live');
  else if (key === 'record') navigate('/album');
  else if (key === 'community') navigate('/community');
  else navigate('/my');
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** 주행 속도: 엔진의 누적 거리 ÷ (시뮬레이션) 시간 변화로 계산. 주행 중이 아니면 0 */
function useSpeedKmh(live: ReturnType<typeof TripController.getSnapshot>) {
  const [kmh, setKmh] = useState(0);
  const prev = useRef<{ km: number; t: number } | null>(null);
  const e = live.engine;
  useEffect(() => {
    if (!e || e.status !== 'driving') { prev.current = null; setKmh(0); return; }
    const cur = { km: e.distanceKm, t: e.lastTick };
    const p = prev.current;
    if (!p || cur.t - p.t > 5 * 60_000) { prev.current = cur; return; }
    if (cur.t - p.t < 2000) return;
    const v = ((cur.km - p.km) / ((cur.t - p.t) / 3_600_000));
    if (Number.isFinite(v) && v >= 0 && v < 200) setKmh((old) => Math.round(old ? old * 0.6 + v * 0.4 : v));
    prev.current = cur;
  }, [e?.distanceKm, e?.lastTick, e?.status]);
  return kmh;
}

/**
 * 상단 상태 바(시안 구성): 시각 · 기어/주행 상태 · 속도 · 날씨 · 목적지 · 신호/5G/블루투스/음량.
 * 차량에서 받지 못하는 값(날씨·통신·블루투스·음량)은 ‘데모’ 표시와 함께 보여 주고 실제 값처럼 쓰지 않아요.
 */
function StatusBar() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const online = useOnline();
  const now = useClock();
  const st = live.engine?.status;
  const gear = !live.active ? 'P' : st === 'driving' ? 'D' : 'P';
  const speed = useSpeedKmh(live);
  const demo = live.kind === 'demo';
  const dest = live.active ? (live.legKind === 'return' ? '집' : live.trip?.destinationName ?? null) : null;
  return (
    <header className="statusbar" role="banner">
      <span className="num" style={{ fontWeight: 650, fontSize: 18 }}>
        {now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
      </span>
      <span className="sb-state">
        <b>{gear}</b>
        {live.active ? (st === 'driving' ? '주행 중' : st === 'resting' ? '휴식 중' : '정차') : '대기'}
      </span>
      {live.active && <span className="sb-speed num" aria-label={`속도 시속 ${speed}킬로미터`}><b>{speed}</b>km/h</span>}
      <span className="sb-weather" title="날씨 정보는 연동 전이에요">
        {demo ? <><CloudSun size={19} />맑음 12°<span className="badge sample" style={{ height: 18 }}>데모</span></> : <><CloudSun size={19} color="var(--text-3)" /><span style={{ color: 'var(--text-3)' }}>날씨 미연동</span></>}
      </span>
      <span className="sb-logo"><PawGlyph size={22} color="var(--primary)" />멍로드</span>
      {dest && <span className="sb-dest ellipsis"><MapPin size={15} />{dest}</span>}
      <span className="sb-icons" title="통신·블루투스·음량은 차량 연동 전 데모 표시예요">
        <Signal size={18} /><span className="g5">5G</span><Bluetooth size={18} /><Volume2 size={18} />
        <span className="badge sample" style={{ height: 18 }}>데모</span>
      </span>
      <span title={online ? '네트워크 연결됨' : '오프라인'} style={{ color: online ? 'var(--text)' : 'var(--error)', display: 'flex' }}>
        {online ? <Wifi size={19} /> : <WifiOff size={19} />}
      </span>
    </header>
  );
}

function Shell() {
  const { ready, fatal, settings, pets, toasts, toast, reload } = useStore();
  const route = useRoute();
  const wide = useWide();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [restoreChecked, setRestoreChecked] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void Draft.restore(); // 작성 중이던 게시물 초안 복구
    TripController.restore()
      .then((restored) => { if (restored) toast('진행 중이던 여행을 이어서 기록해요.'); })
      .finally(() => setRestoreChecked(true));
  }, [ready, toast]);

  useEffect(() => {
    if (!ready || !restoreChecked) return;
    if (!settings.onboardingDone) {
      if (!route.startsWith('/onboarding') && !route.startsWith('/pet/')) navigate('/onboarding', { replace: true });
    } else if (route === '/' || route === '/onboarding') {
      navigate(pets.length ? '/home' : '/pet/new?first=1', { replace: true });
    }
  }, [ready, restoreChecked, settings.onboardingDone, route, pets.length]);

  if (!ready || !restoreChecked) return <div className="app-frame"><Loading label="멍로드를 준비하고 있어요" /></div>;
  if (fatal) {
    return (
      <div className="app-frame">
        <ErrorState title="저장소를 열 수 없어요" desc={`${fatal} 시크릿 모드에서는 기록이 저장되지 않을 수 있어요.`} onRetry={() => location.reload()} />
      </div>
    );
  }

  let screen: React.ReactNode = null;
  let params: Record<string, string> | null;
  const path = route.split('?')[0];
  if (path === '/onboarding') screen = <Onboarding />;
  else if ((params = match('/pet/:id', path))) screen = <PetForm id={params.id} route={route} />;
  else if (path === '/home') screen = <Home />;
  else if (path === '/trip/setup') screen = <TripSetup />;
  else if (path === '/trip/live') screen = <TripLive />;
  else if (path === '/explore') screen = <Explore route={route} />;
  else if (path === '/album') screen = <Album route={route} />;
  else if ((params = match('/album/:id/diary', path))) screen = <DiaryScreen id={params.id} onChanged={reload} />;
  else if ((params = match('/album/:id', path))) screen = <TripDetail id={params.id} route={route} onChanged={reload} />;
  else if (path === '/pawmap') screen = <PawMap />;
  else if (path === '/community') screen = <Community />;
  else if ((params = match('/community/post/:id/place', path))) screen = <PlaceView id={params.id} />;
  else if ((params = match('/community/post/:id', path))) screen = <PostDetail id={params.id} route={route} />;
  else if (path === '/community/new') screen = <AlbumPick />;
  else if (path === '/community/new/edit') screen = <EditMedia />;
  else if (path === '/community/new/write') screen = <Compose />;
  else if (path === '/community/new/done') screen = <UploadDone />;
  else if (path === '/my') screen = <MyPage />;
  else screen = <Home />;

  const inFlow = path === '/onboarding' || path.startsWith('/pet/');
  const showNav = !inFlow;
  const activeTab = TABS.find((t) => t.match.some((m) => path === m || path.startsWith(`${m}/`)))?.key;
  const fullBleed = path === '/trip/live' || (path === '/home' && live.active && live.driving) || path.startsWith('/community/');

  const onHomeLive = path === '/home' && live.active;
  const pill = showNav && live.active && path !== '/trip/live' && !onHomeLive && (
    <button className="live-pill" onClick={() => navigate(live.driving ? '/trip/live' : '/home')}>
      <span className="live-dot" />
      {live.driving
        ? <>{live.legKind === 'return' ? '돌아가는 길 기록 중' : '여행 기록 중'} · <span className="num">{formatClock(live.engine?.elapsedSec ?? 0)}</span></>
        : '여행지 활동 중 · 기록 이어가기'}
    </button>
  );
  const storageWarn = storageMode === 'memory' && (
    <div className="storage-warn" role="status">이 환경에서는 브라우저 저장소를 쓸 수 없어 임시 메모리에 기록해요. 화면 이동은 괜찮지만 새로고침하면 기록이 사라져요.</div>
  );
  const toastsEl = (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>{t.text}</div>)}
    </div>
  );

  if (wide && showNav) {
    return (
      <div className="shell">
        <StatusBar />
        {storageWarn}
        <div className="shell-body">
          <nav className="rail" aria-label="메뉴">
            {TABS.map((t) => (
              <button key={t.key} className={activeTab === t.key ? 'on' : ''} aria-current={activeTab === t.key ? 'page' : undefined} onClick={() => goTab(t.key)}>
                <t.icon size={26} strokeWidth={activeTab === t.key ? 2.3 : 1.8} />
                {t.label}
              </button>
            ))}
          </nav>
          <main className={`shell-main ${fullBleed ? 'bleed' : ''}`}>{screen}</main>
        </div>
        {pill}
        {toastsEl}
      </div>
    );
  }

  // 하단 메뉴: 투뎁스 화면에서도 표시(바로 다른 탭으로 이동 가능).
  // 숨기는 곳: 주행 중 화면, 커뮤니티 상세(다크 전체 화면)·게시물 작성 흐름(전용 하단 버튼 사용)
  const hideBottomNav = path === '/trip/live' || (path === '/home' && live.driving)
    || path.startsWith('/community/new') || (path.startsWith('/community/post/') && !path.endsWith('/place'));
  const mobileNav = showNav && !hideBottomNav;

  return (
    <div className={`app-frame ${mobileNav ? 'has-nav' : ''}`}>
      {storageWarn}
      {screen}
      {pill}
      {mobileNav && (
        <nav className="bottom-nav" aria-label="하단 메뉴">
          {TABS.map((t) => {
            const on = activeTab === t.key;
            return (
              <button key={t.key} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => goTab(t.key)}>
                <t.icon size={22} strokeWidth={on ? 2.3 : 1.9} />
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
      {toastsEl}
    </div>
  );
}
