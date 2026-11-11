// 새 여행 시작 영역의 기본 배경 일러스트(앱 자체 제작 SVG). 반려견 사진과 별도로 관리합니다.
// 실제 장소·실제 반려견을 그린 것이 아니라 ‘여행 분위기’를 위한 일러스트입니다.
import { useState, type ReactElement } from 'react';
import coastPhoto from '../assets/bg-coast.jpg';
import coastThumb from '../assets/bg-coast-thumb.jpg';

export type SceneId = 'sea' | 'forest' | 'sunset';
export const SCENE_LABEL: Record<SceneId, string> = { sea: '바닷가 드라이브', forest: '푸른 숲길', sunset: '노을 드라이브' };

/** 작은 차(브랜드 블루) — 길 위에 놓이는 공통 요소 */
function Car({ x, y, s = 1, color = '#4d80e8' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="17" rx="34" ry="5" fill="rgba(0,0,0,.18)" />
      <path d="M-34 8 Q-34 -2 -24 -4 L-14 -16 Q-10 -20 -4 -20 L14 -20 Q20 -20 24 -14 L30 -4 Q36 -2 36 6 L36 10 Q36 14 32 14 L-30 14 Q-34 14 -34 10 Z" fill={color} />
      <path d="M-11 -15 L-4 -15 L-4 -5 L-19 -5 Z M1 -15 L13 -15 Q17 -15 19 -11 L22 -5 L1 -5 Z" fill="#dbe8ff" opacity=".9" />
      <rect x="-34" y="2" width="70" height="3" fill="#fff" opacity=".25" />
      <circle cx="-19" cy="14" r="7" fill="#1d2b44" /><circle cx="-19" cy="14" r="3" fill="#c9d4e6" />
      <circle cx="21" cy="14" r="7" fill="#1d2b44" /><circle cx="21" cy="14" r="3" fill="#c9d4e6" />
      <rect x="31" y="2" width="5" height="3" rx="1" fill="#ffe08a" />
    </g>
  );
}

function Sea() {
  return (
    <>
      <defs>
        <linearGradient id="sc-sea-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5d93f0" /><stop offset=".55" stopColor="#a9c9fb" /><stop offset="1" stopColor="#e6f0ff" /></linearGradient>
        <linearGradient id="sc-sea-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f8fe0" /><stop offset="1" stopColor="#2a62b8" /></linearGradient>
        <linearGradient id="sc-sea-land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfe8c9" /><stop offset="1" stopColor="#7cc79a" /></linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-sea-sky)" />
      <circle cx="640" cy="78" r="38" fill="#fff6d6" opacity=".95" />
      <circle cx="640" cy="78" r="64" fill="#fff6d6" opacity=".25" />
      <g fill="#fff" opacity=".9"><ellipse cx="170" cy="70" rx="56" ry="14" /><ellipse cx="205" cy="60" rx="36" ry="16" /><ellipse cx="470" cy="110" rx="44" ry="11" /><ellipse cx="495" cy="102" rx="26" ry="12" /></g>
      <path d="M0 190 Q200 176 420 186 T800 182 L800 400 L0 400 Z" fill="url(#sc-sea-water)" />
      <g stroke="#ffffff" strokeOpacity=".5" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M60 222 q14 -6 28 0 t28 0" /><path d="M300 210 q14 -6 28 0 t28 0" /><path d="M520 236 q14 -6 28 0 t28 0" /><path d="M150 262 q14 -6 28 0 t28 0" />
      </g>
      <path d="M380 400 Q470 300 620 262 Q720 236 800 232 L800 400 Z" fill="url(#sc-sea-land)" />
      <path d="M455 400 Q530 318 660 286 Q740 266 800 262" stroke="#5d6b80" strokeWidth="34" fill="none" />
      <path d="M455 400 Q530 318 660 286 Q740 266 800 262" stroke="#fff" strokeWidth="2.5" strokeDasharray="14 12" fill="none" opacity=".85" />
      <path d="M420 400 Q500 300 640 264" stroke="#e9f4ff" strokeWidth="3" fill="none" opacity=".7" />
      <Car x={612} y={278} s={1.05} />
      <g fill="#5fb07f"><circle cx="760" cy="226" r="16" /><circle cx="782" cy="230" r="12" /><rect x="758" y="232" width="4" height="16" fill="#6d5a45" /></g>
    </>
  );
}

function Forest() {
  const tree = (x: number, y: number, s: number, c: string) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="0" width="6" height="18" fill="#6a5440" />
      <path d="M0 -46 L22 -6 L-22 -6 Z M0 -30 L26 8 L-26 8 Z" fill={c} />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id="sc-fo-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fb6f2" /><stop offset="1" stopColor="#e4f3ec" /></linearGradient>
        <linearGradient id="sc-fo-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd1a6" /><stop offset="1" stopColor="#5daf7c" /></linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-fo-sky)" />
      <circle cx="150" cy="80" r="30" fill="#fffbe6" opacity=".9" />
      <path d="M0 210 Q140 140 300 190 T620 170 T800 180 L800 400 L0 400 Z" fill="#a6dcb8" />
      <path d="M0 260 Q180 200 380 250 T800 230 L800 400 L0 400 Z" fill="url(#sc-fo-hill)" />
      {[[60, 220, 1.1, '#3f9a66'], [110, 236, 0.9, '#4caa74'], [690, 214, 1.1, '#3f9a66'], [740, 230, 1, '#4caa74'], [640, 236, 0.8, '#58b781'], [200, 246, 0.8, '#58b781']].map(([x, y, s, c]) => tree(x as number, y as number, s as number, c as string))}
      <path d="M260 400 Q360 320 420 290 Q470 266 540 256" stroke="#66748a" strokeWidth="40" fill="none" strokeLinecap="round" />
      <path d="M260 400 Q360 320 420 290 Q470 266 540 256" stroke="#fff" strokeWidth="2.5" strokeDasharray="14 12" fill="none" opacity=".85" />
      {[[180, 330, 1.3, '#2f8a58'], [600, 320, 1.4, '#2f8a58'], [660, 350, 1.2, '#3f9a66'], [120, 370, 1.2, '#3f9a66']].map(([x, y, s, c]) => tree(x as number, y as number, s as number, c as string))}
      <Car x={420} y={288} s={1.1} />
    </>
  );
}

function Sunset() {
  return (
    <>
      <defs>
        <linearGradient id="sc-su-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a5fb8" /><stop offset=".45" stopColor="#c47cb0" /><stop offset=".78" stopColor="#ffab73" /><stop offset="1" stopColor="#ffd59a" /></linearGradient>
        <radialGradient id="sc-su-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff2c4" /><stop offset="1" stopColor="#ffb36b" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-su-sky)" />
      <circle cx="520" cy="210" r="120" fill="url(#sc-su-sun)" />
      <circle cx="520" cy="210" r="44" fill="#fff0c2" />
      <path d="M0 230 L120 160 L210 215 L330 140 L460 225 L800 190 L800 400 L0 400 Z" fill="#6b4f8f" opacity=".7" />
      <path d="M0 270 L160 210 L300 262 L470 220 L640 258 L800 230 L800 400 L0 400 Z" fill="#3f3a6e" />
      <path d="M0 330 Q260 290 520 300 T800 296 L800 400 L0 400 Z" fill="#2c2b52" />
      <path d="M0 352 Q300 318 800 324" stroke="#3a3f5e" strokeWidth="30" fill="none" />
      <path d="M0 352 Q300 318 800 324" stroke="#ffd59a" strokeWidth="2" strokeDasharray="14 12" fill="none" opacity=".75" />
      <Car x={300} y={326} s={1.05} color="#5b8ff2" />
      <g fill="#fff" opacity=".8"><circle cx="90" cy="60" r="1.6" /><circle cx="240" cy="40" r="1.2" /><circle cx="680" cy="56" r="1.4" /><circle cx="740" cy="96" r="1" /></g>
    </>
  );
}

const SCENES: Record<SceneId, () => ReactElement> = { sea: Sea, forest: Forest, sunset: Sunset };

/** 기본 배경(바닷가 드라이브)은 사진, 나머지는 일러스트. 사진을 불러오지 못하면 일러스트로 대체 */
export function TripScene({ id, className, thumb = false }: { id: SceneId; className?: string; thumb?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  if (id === 'sea' && !photoFailed) {
    return <img className={className} src={thumb ? coastThumb : coastPhoto} alt="바닷가 해안도로 기본 배경" onError={() => setPhotoFailed(true)} style={{ objectFit: 'cover', objectPosition: 'center 60%' }} />;
  }
  const S = SCENES[id] ?? Sea;
  return (
    <svg className={className} viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${SCENE_LABEL[id] ?? SCENE_LABEL.sea} 배경 일러스트`}>
      <S />
    </svg>
  );
}
