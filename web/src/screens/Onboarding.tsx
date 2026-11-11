import { useState } from 'react';
import { Scene } from '../ui/Art';
import { navigate } from '../app/router';
import { useStore } from '../app/store';

const PAGES = [
  { kind: 'drive' as const, title: '우리 강아지와 떠나는\n모든 여행', desc: '반려견과 함께한 이동을 자동으로 기록하고 소중한 추억으로 남겨보세요.' },
  { kind: 'rest' as const, title: '우리 강아지,\n쉬어갈 시간이에요!', desc: '주행 시간에 맞춰 휴식을 안내하고 주변 산책 장소를 찾아드려요.' },
  { kind: 'album' as const, title: '함께한 길이\n여행 일기가 돼요.', desc: '이동 경로와 사진을 모아 우리만의 여행 앨범을 완성해 보세요.' },
];

export default function Onboarding() {
  const [i, setI] = useState(0);
  const { updateSettings, pets } = useStore();
  const last = i === PAGES.length - 1;
  const page = PAGES[i];

  const finish = async () => {
    await updateSettings({ onboardingDone: true });
    navigate(pets.length ? '/home' : '/pet/new?first=1', { replace: true });
  };

  return (
    <div className="screen no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingTop: 12 }}>
      <div className="row between" style={{ height: 48 }}>
        <span className="t-cap" style={{ fontWeight: 700, letterSpacing: '0.16em' }}>MUNG ROAD</span>
        {!last && <button className="link" onClick={finish}>건너뛰기</button>}
      </div>
      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', animation: 'fade-in .3s ease both' }}>
        <Scene kind={page.kind} height={260} />
        <h1 className="h-xl mt-24" style={{ whiteSpace: 'pre-line' }}>{page.title}</h1>
        <p className="t-body mt-12" style={{ color: 'var(--text-2)' }}>{page.desc}</p>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 6, margin: '24px 0' }} aria-label={`${i + 1} / ${PAGES.length}`}>
        {PAGES.map((_, k) => (
          <span key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 4, background: k === i ? 'var(--primary)' : '#DCD8CF', transition: 'width .2s' }} />
        ))}
      </div>
      <button className="btn primary block" onClick={() => (last ? finish() : setI(i + 1))}>
        {last ? '시작하기' : '다음'}
      </button>
    </div>
  );
}
