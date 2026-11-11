import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, FlaskConical, House, Navigation, Settings, Users, Wifi, WifiOff } from 'lucide-react';
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
  { key: 'move', label: '이동', icon: Navigation, match: ['/trip/live', '/trip/setup', '/explore'] },
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

/** 상단 상태 바: 시각 · 주행 상태 · 로고 · 네트워크. 차량이 주지 않는 정보(외기온·블루투스 등)는 표시하지 않습니다. */
function StatusBar() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const online = useOnline();
  const now = useClock();
  const st = live.engine?.status;
  const gear = !live.active ? null : st === 'driving' ? 'D' : live.arrived || st === 'resting' ? 'P' : null;
  return (
    <header className="statusbar" role="banner">
      <span className="num" style={{ fontWeight: 650, fontSize: 17 }}>
        {now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
      </span>
      {live.active && (
        <span className="sb-state">
          {gear && <b>{gear}</b>}
          {st === 'driving' ? '주행 중' : st === 'resting' ? '휴식 중' : '정차'}
          {live.kind === 'demo' && <span className="badge sample" style={{ height: 20 }}><FlaskConical size={11} />데모</span>}
        </span>
      )}
      <span className="sb-logo"><PawGlyph size={22} color="var(--primary)" />멍로드</span>
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
  else if (path === '/my') screen = <MyPage />;
  else screen = <Home />;

  const inFlow = path === '/onboarding' || path.startsWith('/pet/');
  const showNav = !inFlow;
  const activeTab = TABS.find((t) => t.match.some((m) => path === m || path.startsWith(`${m}/`)))?.key;
  const fullBleed = path === '/trip/live' || (path === '/home' && live.active && live.driving);

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

  return (
    <div className="app-frame">
      {storageWarn}
      {screen}
      {pill}
      {['/home', '/explore', '/album', '/pawmap', '/community', '/my'].includes(path) && !(path === '/home' && live.driving) && (
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
