// 지도 어댑터: 카카오맵 JavaScript SDK(실제 도로·경로) ↔ 오프라인 개요 지도(키가 없을 때).
// 키는 마이페이지 › 지도 설정 또는 빌드 환경변수 VITE_KAKAO_MAP_JS_KEY 로 넣습니다.
// 카카오 JS 키는 '카카오디벨로퍼스 > 앱 > 플랫폼 키 > JavaScript 키'이며, 'JavaScript SDK 도메인'에 이 웹 주소를 등록해야 합니다.
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, TrafficCone } from 'lucide-react';
import type { GeoPoint } from '../domain/models';
import { MapView, type MapMarker } from './MapView';

interface Props {
  jsKey: string;
  route: GeoPoint[];
  plannedRoute?: GeoPoint[];
  markers: MapMarker[];
  height?: number;
  follow?: GeoPoint | null;
  ariaLabel?: string;
  /** 카카오맵 실시간 교통정보 레이어(정체 표시) 토글 버튼 표시 */
  allowTrafficLayer?: boolean;
  fit?: 'auto' | 'korea';
}

// ---- 카카오 SDK 최소 타입 ----
interface KLatLng { getLat(): number; getLng(): number }
interface KMap {
  setCenter(p: KLatLng): void; setLevel(l: number): void; getLevel(): number; setBounds(b: unknown, ...pad: number[]): void; relayout(): void;
  addOverlayMapTypeId(id: unknown): void; removeOverlayMapTypeId(id: unknown): void;
}
interface KOverlay { setMap(m: KMap | null): void }
interface KakaoNS {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => { extend(p: KLatLng): void };
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    Polyline: new (o: Record<string, unknown>) => KOverlay;
    CustomOverlay: new (o: Record<string, unknown>) => KOverlay;
    MapTypeId: { TRAFFIC: unknown };
  };
}

let loader: Promise<KakaoNS> | null = null;
let loadedKey = '';
function loadKakao(key: string): Promise<KakaoNS> {
  if (loader && loadedKey === key) return loader;
  loadedKey = key;
  loader = new Promise((resolve, reject) => {
    const w = window as unknown as { kakao?: KakaoNS };
    if (w.kakao?.maps) { w.kakao.maps.load(() => resolve(w.kakao!)); return; }
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.async = true;
    const timer = setTimeout(() => reject(new Error('카카오 지도 SDK 응답 시간 초과')), 10000);
    s.onload = () => {
      clearTimeout(timer);
      if (!w.kakao?.maps) { reject(new Error('카카오 지도 SDK 초기화 실패(키·도메인 확인)')); return; }
      w.kakao.maps.load(() => resolve(w.kakao!));
    };
    s.onerror = () => { clearTimeout(timer); reject(new Error('카카오 지도 SDK를 불러오지 못했어요(네트워크·키·도메인 확인)')); };
    document.head.appendChild(s);
  });
  loader.catch(() => { loader = null; });
  return loader;
}

function markerHtml(m: MapMarker): string {
  const pin = (c: string) => `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${c};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)"></div>`;
  switch (m.kind) {
    case 'current': return '<div style="width:22px;height:22px;border-radius:50%;background:#4D80E8;border:4px solid #fff;box-shadow:0 0 0 8px rgba(77,128,232,.22)"></div>';
    case 'hazard': return pin(m.color ?? '#EF5350');
    case 'rec': return pin('#2BB673');
    case 'rest': return pin('#F5A623');
    default: {
      const label = m.label ? `<span style="margin-left:6px;background:#fff;border-radius:10px;padding:2px 8px;font:700 12px Pretendard,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.15)">${m.label.replace(/[<>&]/g, '')}</span>` : '';
      return `<div style="display:flex;align-items:center"><div style="width:16px;height:16px;border-radius:50%;background:${m.kind === 'start' ? '#202D42' : '#4D80E8'};border:3px solid #fff"></div>${label}</div>`;
    }
  }
}

export function RoadMap(p: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'nokey'>(p.jsKey ? 'loading' : 'nokey');
  const [err, setErr] = useState('');
  const [traffic, setTraffic] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<KMap | null>(null);
  const ns = useRef<KakaoNS | null>(null);
  const overlays = useRef<KOverlay[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    if (!p.jsKey) { setState('nokey'); return; }
    let cancelled = false;
    setState('loading');
    loadKakao(p.jsKey)
      .then((k) => {
        if (cancelled || !el.current) return;
        ns.current = k;
        map.current = new k.maps.Map(el.current, { center: new k.maps.LatLng(37.5665, 126.978), level: 9 });
        fitted.current = false;
        setState('ready');
      })
      .catch((e: Error) => { if (!cancelled) { setErr(e.message); setState('error'); } });
    return () => { cancelled = true; };
  }, [p.jsKey]);

  // 경로·마커 갱신
  useEffect(() => {
    const k = ns.current;
    const m = map.current;
    if (state !== 'ready' || !k || !m) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const ll = (g: GeoPoint) => new k.maps.LatLng(g.latitude, g.longitude);
    if ((p.plannedRoute?.length ?? 0) > 1) {
      const o = new k.maps.Polyline({ path: p.plannedRoute!.map(ll), strokeWeight: 7, strokeColor: '#8DAEF5', strokeOpacity: 0.55, strokeStyle: 'shortdash' });
      o.setMap(m); overlays.current.push(o);
    }
    if (p.route.length > 1) {
      const o = new k.maps.Polyline({ path: p.route.map(ll), strokeWeight: 8, strokeColor: '#4D80E8', strokeOpacity: 0.95 });
      o.setMap(m); overlays.current.push(o);
    }
    for (const mk of p.markers) {
      const content = document.createElement('div');
      content.innerHTML = markerHtml(mk);
      if (mk.onClick) { content.style.cursor = 'pointer'; content.onclick = mk.onClick; }
      const o = new k.maps.CustomOverlay({ position: ll(mk.point), content, yAnchor: mk.kind === 'hazard' || mk.kind === 'rec' || mk.kind === 'rest' ? 1.1 : 0.5, zIndex: mk.kind === 'current' ? 10 : 3 });
      o.setMap(m); overlays.current.push(o);
    }
    if (p.follow) m.setCenter(ll(p.follow));
    else if (!fitted.current) {
      const all = [...p.route, ...(p.plannedRoute ?? []), ...p.markers.map((x) => x.point)];
      if (all.length) {
        const b = new k.maps.LatLngBounds();
        all.forEach((g) => b.extend(ll(g)));
        m.setBounds(b, 40, 40, 40, 40);
        fitted.current = true;
      }
    }
  }, [state, p.route, p.plannedRoute, p.markers, p.follow]);

  useEffect(() => {
    const k = ns.current;
    const m = map.current;
    if (state !== 'ready' || !k || !m) return;
    if (traffic) m.addOverlayMapTypeId(k.maps.MapTypeId.TRAFFIC);
    else m.removeOverlayMapTypeId(k.maps.MapTypeId.TRAFFIC);
  }, [traffic, state]);

  useEffect(() => {
    const onResize = () => map.current?.relayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (state === 'nokey' || state === 'error') {
    return (
      <MapView
        route={p.route}
        plannedRoute={p.plannedRoute}
        markers={p.markers}
        height={p.height ?? 240}
        fit={p.fit}
        ariaLabel={p.ariaLabel}
        note={state === 'error' ? `개요 지도 · ${err}` : '개요 지도(도로 없음) · 카카오 지도 키 미설정'}
      />
    );
  }

  return (
    <div className="map kmap" style={{ height: p.height ?? 240, position: 'relative' }} aria-label={p.ariaLabel}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {state === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>}
      <div className="map-tools">
        <button aria-label="확대" onClick={() => map.current?.setLevel(Math.max(1, (map.current?.getLevel() ?? 5) - 1))}><Plus size={18} /></button>
        <button aria-label="축소" onClick={() => map.current?.setLevel((map.current?.getLevel() ?? 5) + 1)}><Minus size={18} /></button>
        {p.allowTrafficLayer && (
          <button aria-label="실시간 교통정보(정체) 레이어" aria-pressed={traffic} className={traffic ? 'on' : ''} onClick={() => setTraffic((v) => !v)}><TrafficCone size={18} /></button>
        )}
      </div>
    </div>
  );
}
