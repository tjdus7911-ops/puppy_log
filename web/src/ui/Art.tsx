// 멍로드 자체 제작 SVG 일러스트(외부 이미지 라이선스 문제 없음).
// 실제 반려견·여행 사진은 사용자가 직접 등록한 사진을 사용합니다.
import type { PlaceCategory } from '../domain/models';
import { Bed, Coffee, Fuel, Stethoscope, Trees, Utensils } from 'lucide-react';

export function PawGlyph({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill={color}>
        <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
        <ellipse cx="5.6" cy="10.4" rx="2.2" ry="2.8" transform="rotate(-18 5.6 10.4)" />
        <ellipse cx="18.4" cy="10.4" rx="2.2" ry="2.8" transform="rotate(18 18.4 10.4)" />
        <ellipse cx="9.2" cy="6.2" rx="2.1" ry="2.7" transform="rotate(-6 9.2 6.2)" />
        <ellipse cx="14.8" cy="6.2" rx="2.1" ry="2.7" transform="rotate(6 14.8 6.2)" />
      </g>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="row" style={{ gap: 8 }} aria-label="멍로드 MUNG ROAD">
      <div style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
        <PawGlyph size={20} color="#fff" />
      </div>
      {!compact && (
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>멍로드</div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-2)' }}>MUNG ROAD</div>
        </div>
      )}
    </div>
  );
}

/** 사진이 없을 때 쓰는 기본 강아지 얼굴 */
export function DogFace({ size = 64, tone = 'beige' }: { size?: number; tone?: 'beige' | 'white' | 'brown' }) {
  const fur = { beige: '#EBCB9E', white: '#F7F1E6', brown: '#B98157' }[tone];
  const ear = { beige: '#C99A63', white: '#DCCBB1', brown: '#8A5A3A' }[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="#F4E9D8" />
      <path d="M22 30 C10 34 8 58 18 66 C24 60 28 46 30 36 Z" fill={ear} />
      <path d="M78 30 C90 34 92 58 82 66 C76 60 72 46 70 36 Z" fill={ear} />
      <ellipse cx="50" cy="56" rx="30" ry="28" fill={fur} />
      <ellipse cx="50" cy="68" rx="15" ry="11" fill="#FBF6EE" />
      <circle cx="39" cy="52" r="3.6" fill="#252B28" />
      <circle cx="61" cy="52" r="3.6" fill="#252B28" />
      <circle cx="40.2" cy="50.8" r="1.1" fill="#fff" />
      <circle cx="62.2" cy="50.8" r="1.1" fill="#fff" />
      <ellipse cx="50" cy="62.5" rx="5" ry="3.6" fill="#3A3330" />
      <path d="M50 66 C50 70 45 72 43 70 M50 66 C50 70 55 72 57 70" stroke="#3A3330" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="62" r="3.4" fill="#F4B860" opacity="0.35" />
      <circle cx="67" cy="62" r="3.4" fill="#F4B860" opacity="0.35" />
    </svg>
  );
}

export function PetAvatar({ uri, size = 56, ring = false }: { uri: string | null; size?: number; ring?: boolean }) {
  return (
    <div className="avatar" style={{ width: size, height: size, boxShadow: ring ? '0 0 0 3px #fff, 0 0 0 5px var(--primary-soft)' : undefined }}>
      {uri ? <img src={uri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <DogFace size={size} />}
    </div>
  );
}

/** 온보딩·빈 화면 일러스트 */
export function Scene({ kind, height = 220 }: { kind: 'drive' | 'rest' | 'album' | 'empty-trip' | 'empty-place' | 'error'; height?: number }) {
  return (
    <svg viewBox="0 0 320 220" style={{ width: '100%', height }} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${kind}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F4E9D8" />
          <stop offset="1" stopColor="#FAF9F6" />
        </linearGradient>
      </defs>
      <rect width="320" height="220" rx="28" fill={`url(#sky-${kind})`} />
      <circle cx="252" cy="58" r="24" fill="#F4B860" opacity="0.55" />
      <path d="M0 150 C60 120 110 132 160 140 C220 150 270 124 320 132 L320 220 L0 220 Z" fill="#CFE0D5" />
      <path d="M0 172 C70 150 140 166 200 160 C250 155 290 160 320 156 L320 220 L0 220 Z" fill="#A9C7B5" />
      {kind === 'drive' && (
        <g>
          <path d="M-10 214 C80 180 200 200 330 160" stroke="#F1EEE7" strokeWidth="26" fill="none" />
          <path d="M-10 214 C80 180 200 200 330 160" stroke="#fff" strokeWidth="2.5" strokeDasharray="10 12" fill="none" />
          <g transform="translate(118 132)">
            <rect x="0" y="22" width="96" height="34" rx="14" fill="#5B8C72" />
            <path d="M14 24 C22 4 34 0 50 0 C66 0 76 6 84 24 Z" fill="#6E9E84" />
            <path d="M24 22 C30 8 38 6 48 6 L48 22 Z" fill="#E6EFE9" />
            <path d="M54 6 C64 6 70 10 76 22 L54 22 Z" fill="#E6EFE9" />
            <circle cx="24" cy="58" r="10" fill="#252B28" /><circle cx="24" cy="58" r="4" fill="#C9CEC9" />
            <circle cx="74" cy="58" r="10" fill="#252B28" /><circle cx="74" cy="58" r="4" fill="#C9CEC9" />
            <g transform="translate(55 4)">
              <path d="M2 10 C-2 12 -2 20 2 22 L5 13 Z" fill="#C99A63" />
              <ellipse cx="10" cy="14" rx="8" ry="7.5" fill="#EBCB9E" />
              <circle cx="8" cy="13" r="1.2" fill="#252B28" /><circle cx="13" cy="13" r="1.2" fill="#252B28" />
              <ellipse cx="11" cy="17" rx="1.8" ry="1.2" fill="#3A3330" />
            </g>
          </g>
        </g>
      )}
      {kind === 'rest' && (
        <g>
          <g transform="translate(70 70)">
            <rect x="22" y="40" width="10" height="50" rx="4" fill="#8A6B4A" />
            <circle cx="27" cy="34" r="30" fill="#5B8C72" /><circle cx="10" cy="48" r="18" fill="#6E9E84" /><circle cx="44" cy="46" r="18" fill="#6E9E84" />
          </g>
          <g transform="translate(160 132)">
            <ellipse cx="30" cy="40" rx="34" ry="8" fill="#94B6A2" opacity="0.6" />
            <path d="M6 30 C6 16 22 12 34 14 C48 16 56 24 56 32 L56 38 L6 38 Z" fill="#EBCB9E" />
            <circle cx="56" cy="22" r="13" fill="#EBCB9E" />
            <path d="M48 12 C44 14 44 22 48 26 L52 16 Z" fill="#C99A63" />
            <path d="M58 22 Q61 24 64 22" stroke="#252B28" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <ellipse cx="67" cy="26" rx="2.2" ry="1.6" fill="#3A3330" />
            <path d="M4 30 C-4 26 -6 18 0 16" stroke="#C99A63" strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
          <g fill="#5B8C72" opacity="0.6"><circle cx="248" cy="104" r="3" /><circle cx="262" cy="96" r="2" /></g>
        </g>
      )}
      {kind === 'album' && (
        <g>
          <g transform="translate(84 46) rotate(-8)">
            <rect width="92" height="108" rx="10" fill="#fff" />
            <rect x="8" y="8" width="76" height="70" rx="6" fill="#CFE0D5" />
            <circle cx="46" cy="40" r="16" fill="#EBCB9E" />
            <rect x="8" y="86" width="50" height="6" rx="3" fill="#E6E2D8" />
          </g>
          <g transform="translate(150 54) rotate(7)">
            <rect width="92" height="108" rx="10" fill="#fff" />
            <rect x="8" y="8" width="76" height="70" rx="6" fill="#F4E9D8" />
            <path d="M8 62 C30 46 52 58 84 44 L84 78 L8 78 Z" fill="#A9C7B5" />
            <rect x="8" y="86" width="60" height="6" rx="3" fill="#E6E2D8" />
          </g>
          <g transform="translate(222 140)"><PawPath /></g>
          <g transform="translate(60 150) scale(0.7)"><PawPath /></g>
        </g>
      )}
      {(kind === 'empty-trip' || kind === 'empty-place' || kind === 'error') && (
        <g transform="translate(116 70)">
          <ellipse cx="44" cy="96" rx="44" ry="8" fill="#94B6A2" opacity="0.45" />
          <path d="M12 30 C2 34 0 56 10 62 C16 56 20 44 22 36 Z" fill="#C99A63" />
          <path d="M76 30 C86 34 88 56 78 62 C72 56 68 44 66 36 Z" fill="#C99A63" />
          <ellipse cx="44" cy="54" rx="30" ry="28" fill="#EBCB9E" />
          <ellipse cx="44" cy="66" rx="14" ry="10" fill="#FBF6EE" />
          {kind === 'error' ? (
            <g stroke="#252B28" strokeWidth="2.4" strokeLinecap="round"><path d="M30 48 l6 6 M36 48 l-6 6 M52 48 l6 6 M58 48 l-6 6" /></g>
          ) : (
            <g fill="#252B28"><circle cx="33" cy="51" r="3.4" /><circle cx="55" cy="51" r="3.4" /></g>
          )}
          <ellipse cx="44" cy="61" rx="4.6" ry="3.3" fill="#3A3330" />
          {kind === 'empty-place' && <g transform="translate(70 0)"><circle cx="10" cy="10" r="10" fill="none" stroke="#5B8C72" strokeWidth="3" /><path d="M17 17 l8 8" stroke="#5B8C72" strokeWidth="3.4" strokeLinecap="round" /></g>}
          {kind === 'empty-trip' && <g transform="translate(-30 4)" fill="#5B8C72" opacity="0.7"><PawPath /></g>}
        </g>
      )}
    </svg>
  );
}

function PawPath() {
  return (
    <g fill="#5B8C72" opacity="0.75">
      <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
      <ellipse cx="5.6" cy="10.4" rx="2.2" ry="2.8" />
      <ellipse cx="18.4" cy="10.4" rx="2.2" ry="2.8" />
      <ellipse cx="9.2" cy="6.2" rx="2.1" ry="2.7" />
      <ellipse cx="14.8" cy="6.2" rx="2.1" ry="2.7" />
    </g>
  );
}

const CAT_ICON = { restaurant: Utensils, cafe: Coffee, park: Trees, restArea: Fuel, lodging: Bed, vet: Stethoscope };
const CAT_TONE: Record<PlaceCategory, [string, string]> = {
  restaurant: ['#FBE7D6', '#C9763C'],
  cafe: ['#F4E9D8', '#8A6B4A'],
  park: ['#E1EDE5', '#4A7860'],
  restArea: ['#E8EEF2', '#4F6C80'],
  lodging: ['#EFE6F2', '#7A5A8A'],
  vet: ['#FBE7E5', '#B8453D'],
};

export function CategoryIcon({ category, size = 20 }: { category: PlaceCategory; size?: number }) {
  const Icon = CAT_ICON[category];
  return <Icon size={size} strokeWidth={2} />;
}

/** 장소 대표 이미지가 없을 때의 카테고리 썸네일 */
export function PlaceThumb({ category, size = 64, radius = 14 }: { category: PlaceCategory; size?: number | string; radius?: number }) {
  const [bg, fg] = CAT_TONE[category];
  const Icon = CAT_ICON[category];
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Icon size={typeof size === 'number' ? Math.round(size * 0.4) : 36} strokeWidth={1.8} />
    </div>
  );
}
