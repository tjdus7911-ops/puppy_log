import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, Clock3, House, Navigation, PawPrint, Settings, UserRound, Users } from 'lucide-react';
import { AppProvider, useStore } from './app/store';
import { match, navigate, useRoute } from './app/router';
import { useWide } from './app/useWide';
import { TripController } from './trip/TripController';
import { storageMode } from './data/db';
import { formatClock } from './domain/format';
import { Loading, ErrorState } from './ui/components';
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
import PetsScreen from './screens/PetsScreen';
import TripHub from './screens/TripHub';
import Destination from './screens/Destination';
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

// 모바일 하단 탭: 홈 · 여행 · 기록 · 커뮤니티 · 내 정보
const TABS = [
  { key: 'home', label: '홈', icon: House, match: ['/home'] },
  { key: 'move', label: '여행', icon: Navigation, match: ['/trip/live', '/trip/setup', '/explore'] },
  { key: 'record', label: '기록', icon: BookOpen, match: ['/album', '/pawmap'] },
  { key: 'community', label: '커뮤니티', icon: Users, match: ['/community'] },
  { key: 'settings', label: '내 정보', icon: UserRound, match: ['/my', '/pets', '/pet'] },
] as const;
// 차량 왼쪽 메뉴(시안): 홈 · 여행/경로 · 내 반려견 · 여행 기록 · 설정 — 커뮤니티는 모바일 전용
const CAR_TABS = [
  { key: 'home', label: '홈', icon: House, match: ['/home'] },
  { key: 'move', label: '여행', icon: Navigation, match: ['/trip', '/trip/live', '/trip/setup', '/trip/destination', '/explore'] },
  { key: 'pets', label: '내 반려견', icon: PawPrint, match: ['/pets', '/pet'] },
  { key: 'record', label: '여행 기록', icon: Clock3, match: ['/album', '/pawmap', '/community'] },
  { key: 'settings', label: '설정', icon: Settings, match: ['/my'] },
] as const;

function goTab(key: (typeof TABS)[number]['key'] | (typeof CAR_TABS)[number]['key']) {
  if (key === 'home') navigate('/home');
  else if (key === 'pets') navigate('/pets');
  else if (key === 'move') {
    // 차량: '여행' = 여행 허브(진행 중이면 해당 화면) / 모바일: 기존처럼 새 여행 또는 진행 화면
    const carWide = window.matchMedia('(min-width: 900px)').matches;
    if (!TripController.isActive) navigate(carWide ? '/trip' : '/trip/setup');
    else navigate(TripController.phase === 'at-destination' ? (carWide ? '/trip/destination' : '/home') : '/trip/live');
  }
  else if (key === 'record') navigate('/album');
  else if (key === 'community') navigate('/community');
  else navigate('/my');
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
  else if (path === '/pets') screen = <PetsScreen />;
  else if (path === '/trip') screen = <TripHub />;
  else if (path === '/trip/destination') screen = live.active && live.phase === 'at-destination' ? <Destination /> : <Home />;
  else screen = <Home />;

  const inFlow = path === '/onboarding' || path.startsWith('/pet/');
  const showNav = !inFlow;
  const activeTab = TABS.find((t) => t.match.some((m) => path === m || path.startsWith(`${m}/`)))?.key;
  const carTab = CAR_TABS.find((t) => t.match.some((m) => path === m || path.startsWith(`${m}/`)))?.key;
  const fullBleed = path === '/trip/live' || (path === '/home' && live.active && live.driving) || path.startsWith('/community/');

  const onHomeLive = path === '/home' && live.active;
  const pill = showNav && live.active && path !== '/trip/live' && path !== '/trip/destination' && !(onHomeLive && !wide) && (
    <button className="live-pill" onClick={() => navigate(live.driving ? '/trip/live' : wide && live.phase === 'at-destination' ? '/trip/destination' : '/home')}>
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
        {storageWarn}
        <div className="shell-body">
          <nav className="rail" aria-label="메뉴">
            {CAR_TABS.map((t) => (
              <button key={t.key} className={carTab === t.key ? 'on' : ''} aria-current={carTab === t.key ? 'page' : undefined} onClick={() => goTab(t.key)}>
                <t.icon size={26} strokeWidth={carTab === t.key ? 2.3 : 1.8} />
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
