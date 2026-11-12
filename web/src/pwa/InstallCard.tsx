// '앱으로 설치' 안내: 안드로이드·PC는 설치 창, 아이폰은 Safari '홈 화면에 추가' 안내
import { useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { promptInstall, useInstallState } from './install';
import { Sheet } from '../ui/components';

const HIDE_KEY = 'mungroad.installCardHidden';

export function InstallCard({ compact = false, dismissible = true }: { compact?: boolean; dismissible?: boolean }) {
  const state = useInstallState();
  const [iosOpen, setIosOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return dismissible && localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  if (hidden || state === 'installed' || state === 'unsupported' || (compact && state === 'embedded')) return null;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* 저장 불가 환경은 이번만 숨김 */ } setHidden(true); };
  const go = async () => { if (state === 'available') await promptInstall(); else if (state === 'ios') setIosOpen(true); };
  return (
    <>
      <div className="install-card" data-testid="install-card">
        <img src="./icon-192.png" alt="" />
        <div className="grow">
          <b>멍로드를 앱으로 설치하세요</b>
          <small>{state === 'embedded' ? '미리보기 화면에서는 설치할 수 없어요 · 배포된 주소를 휴대폰 브라우저로 열어 주세요' : '홈 화면에서 바로 열고, 인터넷이 약해도 기록을 볼 수 있어요'}</small>
        </div>
        {state !== 'embedded' && <button className="btn primary sm" onClick={go}><Download size={16} />설치</button>}
        {dismissible && <button className="icon-btn" aria-label="설치 안내 닫기" onClick={hide}><X size={16} /></button>}
      </div>
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} labelledBy="ios-install">
        <h2 id="ios-install" className="h-md">아이폰에 멍로드 설치하기</h2>
        <ol className="ios-steps mt-16">
          <li><span><Share size={18} /></span>Safari 아래쪽의 <b>공유</b> 버튼을 눌러요</li>
          <li><span><SquarePlus size={18} /></span><b>홈 화면에 추가</b>를 골라요</li>
          <li><span><img src="./icon-192.png" alt="" /></span>홈 화면의 <b>멍로드</b> 아이콘으로 열어요</li>
        </ol>
        <p className="t-cap mt-12">Safari에서만 설치할 수 있어요. 다른 브라우저라면 주소를 Safari로 열어 주세요.</p>
        <button className="btn primary block mt-16" onClick={() => setIosOpen(false)}>확인</button>
      </Sheet>
    </>
  );
}
