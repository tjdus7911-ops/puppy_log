// 차량 화면(1600×900) 미리보기: 좁은 창(휴대폰·아티팩트 패널)에서도 차량용 가로 화면을 축소해 보여줍니다.
// 같은 앱을 1600×900 iframe 안에서 실행하므로 레이아웃·미디어쿼리가 실제 차량 화면과 같아요.
// 바깥 페이지는 앱을 실행하지 않아(기록 중복 방지) iframe 하나만 앱으로 동작합니다.
import { useEffect, useRef, useState } from 'react';

const W = 1600;
const H = 900;

export function isCarPreview() {
  return new URLSearchParams(window.location.search).has('car');
}

/** 앱 안에서 차량 화면 미리보기로 전환(현재 화면 유지) */
export function openCarPreview() {
  const u = new URL(window.location.href);
  u.searchParams.set('car', '1');
  window.location.href = u.toString();
}

export default function CarPreview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 24) / W, (window.innerHeight - 76) / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const src = `${window.location.pathname}${window.location.hash || '#/home'}`;
  const back = () => {
    let hash = window.location.hash;
    try { hash = frame.current?.contentWindow?.location.hash || hash; } catch { /* 접근 불가 시 기존 화면 */ }
    const u = new URL(window.location.href);
    u.searchParams.delete('car');
    u.hash = hash;
    window.location.href = u.toString();
  };
  return (
    <div className="carpv">
      <div className="carpv-bar">
        <span className="t">차량 화면 미리보기</span>
        <span className="s">1600×900 · 화면에 맞춰 {Math.round(scale * 100)}%로 축소</span>
        <button className="btn sm secondary" onClick={back}>휴대폰 화면으로</button>
      </div>
      <div className="carpv-stage" style={{ width: W * scale, height: H * scale }}>
        <iframe ref={frame} title="멍로드 차량 화면" src={src} style={{ width: W, height: H, transform: `scale(${scale})` }} />
      </div>
    </div>
  );
}
