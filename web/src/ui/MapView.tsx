// 오프라인 SVG 지도. 해안선은 Natural Earth(퍼블릭 도메인) 데이터입니다.
// 도로·지명 타일이 없는 단순 지도이며, Android 단계에서 Google Maps/Kakao 지도 SDK로 교체합니다.
import { useEffect, useMemo, useRef, useState } from 'react';
import geo from '../data/korea-geo.json';
import type { GeoPoint } from '../domain/models';
import { boundsOf, thinPoints } from '../domain/geo';
import { PawGlyph } from './Art';

export interface MapMarker {
  id: string;
  point: GeoPoint;
  kind: 'start' | 'end' | 'current' | 'rest' | 'place' | 'paw' | 'dest' | 'hazard' | 'rec';
  /** hazard 마커 색 (사고 빨강 · 공사 주황 · 낙하물 노랑 · 정체 보라) */
  color?: string;
  label?: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}

interface Props {
  route?: GeoPoint[];
  plannedRoute?: GeoPoint[];
  markers?: MapMarker[];
  height?: number;
  fit?: 'auto' | 'korea';
  padKm?: number;
  ariaLabel?: string;
  note?: string;
}

const KOREA = { minLat: 33.0, maxLat: 38.7, minLon: 124.9, maxLon: 130.0 };

export function MapView({ route = [], plannedRoute = [], markers = [], height = 240, fit = 'auto', padKm = 10, ariaLabel = '지도', note }: Props) {
  const H = height;
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(400);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const proj = useMemo(() => {
    const pts = [...route, ...plannedRoute, ...markers.map((m) => m.point)];
    let b = fit === 'korea' || pts.length === 0 ? KOREA : boundsOf(pts);
    const padLat = padKm / 111;
    const padLon = padKm / 88;
    b = { minLat: b.minLat - padLat, maxLat: b.maxLat + padLat, minLon: b.minLon - padLon, maxLon: b.maxLon + padLon };
    const cLat = (b.minLat + b.maxLat) / 2;
    const cLon = (b.minLon + b.maxLon) / 2;
    const k = Math.cos((cLat * Math.PI) / 180);
    const dx = Math.max((b.maxLon - b.minLon) * k, 0.02);
    const dy = Math.max(b.maxLat - b.minLat, 0.02);
    const s = Math.min((W - 24) / dx, (H - 24) / dy);
    return (p: { latitude: number; longitude: number }) => [W / 2 + (p.longitude - cLon) * k * s, H / 2 - (p.latitude - cLat) * s] as const;
  }, [route, plannedRoute, markers, fit, padKm, H, W]);

  const land = useMemo(() => {
    const toPath = (rings: number[][][]) =>
      rings
        .map((ring) => ring.map(([lon, lat], i) => {
          const [x, y] = proj({ latitude: lat, longitude: lon });
          return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join('') + 'Z')
        .join('');
    return { south: toPath(geo.south as number[][][]), north: toPath(geo.north as number[][][]) };
  }, [proj]);

  const line = (pts: GeoPoint[]) => thinPoints(pts, 500).map((p, i) => {
    const [x, y] = proj(p);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');

  return (
    <div className="map" style={{ height }} ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ariaLabel}>
        <rect width={W} height={H} fill="#E3EEFC" />
        <path d={land.north} fill="#EEEDE6" stroke="#D5D3CA" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d={land.south} fill="#F7F4EC" stroke="#C7D6F0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {plannedRoute.length > 1 && (
          <path d={line(plannedRoute)} fill="none" stroke="#4D80E8" strokeOpacity="0.28" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 8" />
        )}
        {route.length > 1 && (
          <>
            <path d={line(route)} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line(route)} fill="none" stroke="#4D80E8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {markers.map((m) => {
          const [x, y] = proj(m.point);
          return <Marker key={m.id} m={m} x={x} y={y} />;
        })}
      </svg>
      <span className="map-note">{note ?? '지도 데이터 © Natural Earth'}</span>
    </div>
  );
}

function Marker({ m, x, y }: { m: MapMarker; x: number; y: number }) {
  const clickable = !!m.onClick;
  const common = {
    transform: `translate(${x} ${y})`,
    style: clickable ? { cursor: 'pointer' } : undefined,
    onClick: m.onClick,
    role: clickable ? 'button' : undefined,
    tabIndex: clickable ? 0 : undefined,
    'aria-label': m.label,
    onKeyDown: clickable ? (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && m.onClick?.() : undefined,
  };
  if (m.kind === 'current') {
    return (
      <g {...common}>
        <circle r="14" fill="#4D80E8" opacity="0.18"><animate attributeName="r" values="9;16;9" dur="2s" repeatCount="indefinite" /></circle>
        <circle r="7" fill="#4D80E8" stroke="#fff" strokeWidth="3" />
      </g>
    );
  }
  if (m.kind === 'paw') {
    const r = 13 + Math.min(6, (m.count ?? 1) * 1.5);
    return (
      <g {...common}>
        <circle r={r} fill={m.active ? '#4D80E8' : '#fff'} stroke="#4D80E8" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.15))' }} />
        <g transform={`translate(${-r * 0.62} ${-r * 0.66})`}>
          <PawGlyph size={r * 1.25} color={m.active ? '#fff' : '#4D80E8'} />
        </g>
        {m.count != null && m.count > 1 && (
          <g transform={`translate(${r * 0.8} ${-r * 0.8})`}>
            <circle r="8" fill="#F4B860" stroke="#fff" strokeWidth="1.5" />
            <text textAnchor="middle" dy="3.5" fontSize="10" fontWeight="700" fill="#3b2b10">{m.count}</text>
          </g>
        )}
      </g>
    );
  }
  if (m.kind === 'hazard' || m.kind === 'rec') {
    const c = m.kind === 'rec' ? '#2BB673' : m.color ?? '#EF5350';
    return (
      <g {...common}>
        <path d="M0 4 C-9 -6 -11 -12 -11 -16 A11 11 0 1 1 11 -16 C11 -12 9 -6 0 4Z" fill={c} stroke="#fff" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.2))' }} />
        <circle cy="-16" r="4.2" fill="#fff" />
      </g>
    );
  }
  const color = { start: '#202D42', end: '#4D80E8', dest: '#4D80E8', rest: '#F4B860', place: '#E66A61' }[m.kind];
  return (
    <g {...common}>
      <circle r={m.kind === 'place' ? 6 : 7.5} fill={color} stroke="#fff" strokeWidth="2.5" />
      {m.label && m.kind !== 'place' && (
        <g transform="translate(0 -14)">
          <rect x={-m.label.length * 6.2 - 8} y="-12" width={m.label.length * 12.4 + 16} height="20" rx="10" fill="#fff" stroke="#ECE9E2" />
          <text textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#252B28" dy="2">{m.label}</text>
        </g>
      )}
    </g>
  );
}
