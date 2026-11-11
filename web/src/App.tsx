import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookImage, Compass, House, User } from 'lucide-react';
import { AppProvider, useStore } from './app/store';
import { match, navigate, useRoute } from './app/router';
import { TripController } from './trip/TripController';
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
import PawMap from './screens/PawMap';
import MyPage from './screens/MyPage';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

const TABS = [
  { path: '/home', label: '홈', icon: House },
  { path: '/explore', label: '주변 탐색', icon: Compass },
  { path: '/album', label: '여행 기록', icon: BookImage },
  { path: '/my', label: '마이페이지', icon: User },
];

function Shell() {
  const { ready, fatal, settings, pets, toasts, toast, reload } = useStore();
  const route = useRoute();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [restoreChecked, setRestoreChecked] = useState(false);

  // 앱 재실행 시 진행 중이던 여행 복원
  useEffect(() => {
    if (!ready) return;
    TripController.restore()
      .then((restored) => {
        if (restored) toast('진행 중이던 여행을 이어서 기록해요.');
      })
      .finally(() => setRestoreChecked(true));
  }, [ready, toast]);

  // 첫 실행 분기
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
  else if ((params = match('/album/:id', path))) screen = <TripDetail id={params.id} route={route} onChanged={reload} />;
  else if (path === '/pawmap') screen = <PawMap />;
  else if (path === '/my') screen = <MyPage />;
  else screen = <Home />;

  const showNav = ['/home', '/explore', '/album', '/my', '/pawmap'].includes(path);
  const wide = path === '/trip/live';

  return (
    <div className={`app-frame ${wide ? 'wide' : ''}`}>
      {screen}
      {showNav && live.active && (
        <button className="live-pill" onClick={() => navigate('/trip/live')}>
          <span className="live-dot" />
          여행 기록 중 · <span className="num">{formatClock(live.engine?.elapsedSec ?? 0)}</span>
        </button>
      )}
      {showNav && (
        <nav className="bottom-nav" aria-label="하단 메뉴">
          {TABS.map((t) => {
            const on = path === t.path || (t.path === '/album' && path === '/pawmap');
            return (
              <button key={t.path} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => navigate(t.path)}>
                <t.icon size={23} strokeWidth={on ? 2.3 : 1.9} />
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
