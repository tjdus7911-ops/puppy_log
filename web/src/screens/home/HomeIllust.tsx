// 차량 홈 퀵 메뉴 카드 하단 일러스트(앱 자체 제작 SVG). 연한 블루 그라데이션 + 위로 갈수록 사라지는 안개 처리.
import { useId } from 'react';

const B1 = '#b9d1fb', B2 = '#d6e5fd', B3 = '#9fbff7';

function Fade({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".55" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="1" /></linearGradient>
      <mask id={`${id}-m`}><rect width="210" height="110" fill={`url(#${id}-fade)`} /></mask>
      <linearGradient id={`${id}-g1`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={B3} /><stop offset="1" stopColor={B2} /></linearGradient>
      <linearGradient id={`${id}-g2`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={B1} /><stop offset="1" stopColor={B3} /></linearGradient>
      <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".6" /></filter>
    </defs>
  );
}

export function IllustMountains() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 210 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Fade id={id} />
      <filter id={`${id}-blur`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1" /></filter>
      <g filter={`url(#${id}-blur)`}>
        <g mask={`url(#${id}-m)`}><path d="M0 96 C14 86 22 78 32 78 C42 78 48 88 58 88 C70 88 78 70 92 70 C104 70 110 84 124 84 L210 84 L210 110 L0 110 Z" fill={B2} /></g>
        <path d="M44 110 C66 98 82 70 100 58 C108 53 114 62 122 66 C132 70 138 44 152 36 C162 31 168 50 178 56 C188 62 196 54 210 60 L210 110 Z" fill={`url(#${id}-g1)`} opacity=".85" />
        <path d="M148 38 C152 36 156 40 158 46 C154 44 150 46 146 50 C146 45 146 41 148 38 Z" fill="#fff" opacity=".55" />
        <path d="M0 110 L0 100 C40 90 80 98 120 98 C160 98 190 94 210 96 L210 110 Z" fill="#e6eefd" />
        <path d="M118 98 l4 -9 l4 9 Z M130 99 l4 -8 l4 8 Z M186 96 l4 -9 l4 9 Z" fill={B3} opacity=".55" />
      </g>
    </svg>
  );
}

export function IllustPaws() {
  const id = useId().replace(/:/g, '');
  const paw = (x: number, y: number, s: number, o: number, r = -16) => (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={o} fill={`url(#${id}-g2)`}>
      <path d="M0 10 C-12 10 -18 22 -14 30 C-11 36 -4 34 0 34 C4 34 11 36 14 30 C18 22 12 10 0 10 Z" />
      <ellipse cx="-15" cy="-2" rx="6" ry="8" transform="rotate(-18 -15 -2)" />
      <ellipse cx="-5" cy="-9" rx="6" ry="8.5" />
      <ellipse cx="7" cy="-9" rx="6" ry="8.5" />
      <ellipse cx="17" cy="-2" rx="6" ry="8" transform="rotate(18 17 -2)" />
    </g>
  );
  return (
    <svg viewBox="0 0 210 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Fade id={id} />
      <g filter={`url(#${id}-soft)`}>
        {paw(168, 60, 1.15, 1)}
        <g mask={`url(#${id}-m)`}>{paw(112, 64, 0.7, 0.45)}{paw(100, 92, 0.55, 0.3)}</g>
      </g>
    </svg>
  );
}

export function IllustPhotos() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 210 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Fade id={id} />
      <g filter={`url(#${id}-soft)`}>
        <g transform="rotate(-9 128 82)" opacity=".75">
          <rect x="96" y="56" width="62" height="48" rx="5" fill="#fff" />
          <rect x="101" y="61" width="52" height="38" rx="3" fill={B2} />
          <path d="M101 99 L117 80 L127 90 L137 82 L153 99 Z" fill={B1} />
        </g>
        <g transform="rotate(6 166 80)">
          <rect x="128" y="48" width="72" height="56" rx="6" fill="#fff" stroke="#e1ebfd" />
          <rect x="134" y="54" width="60" height="44" rx="3" fill="#dbe8fd" />
          <path d="M134 98 L152 74 L164 88 L176 78 L194 98 Z" fill={`url(#${id}-g1)`} />
          <circle cx="182" cy="64" r="4" fill="#fff" opacity=".85" />
        </g>
      </g>
    </svg>
  );
}

export function IllustTrees() {
  const id = useId().replace(/:/g, '');
  const tree = (x: number, base: number, h: number, o: number) => (
    <g opacity={o} fill={`url(#${id}-g1)`}>
      <path d={`M${x} ${base - h} L${x + h * 0.28} ${base - h * 0.45} L${x + h * 0.16} ${base - h * 0.45} L${x + h * 0.34} ${base - h * 0.12} L${x - h * 0.34} ${base - h * 0.12} L${x - h * 0.16} ${base - h * 0.45} L${x - h * 0.28} ${base - h * 0.45} Z`} />
      <rect x={x - 1.6} y={base - h * 0.13} width="3.2" height={h * 0.15} rx="1" />
    </g>
  );
  return (
    <svg viewBox="0 0 210 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Fade id={id} />
      <g filter={`url(#${id}-soft)`}>
        <g mask={`url(#${id}-m)`}><path d="M0 110 L0 92 Q40 74 82 88 Q124 100 160 86 Q190 76 210 80 L210 110 Z" fill="#e2ecfd" /></g>
        <path d="M40 110 Q100 80 160 88 Q190 92 210 86 L210 110 Z" fill={B2} />
        {tree(146, 92, 56, 1)}{tree(176, 90, 50, 0.95)}{tree(120, 96, 32, 0.7)}{tree(198, 94, 34, 0.6)}
      </g>
    </svg>
  );
}

/** 새 여행 시작 버튼 오른쪽의 은은한 도로 */
export function CtaRoad() {
  return (
    <svg className="ch3-road" viewBox="0 0 220 140" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <path d="M70 140 C110 112 140 96 172 78 C190 68 206 60 220 54 L220 74 C204 80 190 88 176 98 C150 114 130 128 118 140 Z" fill="#fff" opacity=".1" />
      <path d="M94 140 C126 116 158 92 196 70" stroke="#fff" strokeOpacity=".28" strokeWidth="1.6" strokeDasharray="7 7" fill="none" />
    </svg>
  );
}
