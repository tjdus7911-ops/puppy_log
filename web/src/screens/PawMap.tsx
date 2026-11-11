import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FlaskConical } from 'lucide-react';
import { useStore } from '../app/store';
import { repo } from '../data/db';
import type { VisitedPlace } from '../domain/models';
import { nearestRegion, type Region } from '../domain/regions';
import { MapView } from '../ui/MapView';
import { EmptyState, Segmented } from '../ui/components';
import { PhotoFallback, SectionHeader, StatStrip } from '../ui/kit';
import { PawGlyph } from '../ui/Art';
import { navigate, queryParam, useRoute } from '../app/router';
import { formatKm, formatShortDate } from '../domain/format';

/** 발도장 = 실제 여행의 도착 지역 + 실제(샘플 아님) 방문 장소의 지역 */
export function aggregatePaws(trips: { id: string; endLocation: { latitude: number; longitude: number } | null }[], places: VisitedPlace[]) {
  const map = new Map<string, { region: Region; tripIds: Set<string> }>();
  const add = (r: Region | null, tripId: string) => {
    if (!r) return;
    const cur = map.get(r.id) ?? { region: r, tripIds: new Set<string>() };
    cur.tripIds.add(tripId);
    map.set(r.id, cur);
  };
  const ids = new Set(trips.map((t) => t.id));
  for (const t of trips) if (t.endLocation) add(nearestRegion(t.endLocation), t.id);
  for (const p of places) if (ids.has(p.tripId) && !p.isSample) add(nearestRegion(p), p.tripId);
  return [...map.values()].sort((a, b) => b.tripIds.size - a.tripIds.size);
}

export default function PawMap() {
  const { trips } = useStore();
  const [places, setPlaces] = useState<VisitedPlace[]>([]);
  const route = useRoute();
  const [source, setSource] = useState<'real' | 'demo'>(queryParam(route, 'src') === 'demo' ? 'demo' : 'real');
  const [sel, setSel] = useState<string | null>(null);
  // 같은 화면에서 주소(?src=)만 바뀌어도 탭을 맞춤
  const srcParam = queryParam(route, 'src') === 'demo' ? 'demo' : 'real';
  useEffect(() => { setSource(srcParam); setSel(null); }, [srcParam]);
  useEffect(() => { repo.allVisitedPlaces().then(setPlaces).catch(() => setPlaces([])); }, []);

  const ended = trips.filter((t) => t.status === 'ended' && (source === 'demo' ? t.isDemo : !t.isDemo));
  const paws = useMemo(() => aggregatePaws(ended, places), [ended, places]);
  const hasDemo = trips.some((t) => t.isDemo && t.status === 'ended');
  const selected = paws.find((p) => p.region.id === sel) ?? null;
  const selTrips = selected ? ended.filter((t) => selected.tripIds.has(t.id)) : [];

  const totalKm = ended.reduce((a, t) => a + t.totalDistanceKm, 0);
  const kmText = totalKm >= 100 ? Math.round(totalKm).toLocaleString('ko-KR') : totalKm.toFixed(1).replace(/\.0$/, '');
  const albumLink = (name: string) => `/album?region=${encodeURIComponent(name)}${source === 'demo' ? '&src=demo' : ''}`;

  return (
    <div className="screen">
      <header className="paw-head">
        <h1 className="h-xl">발도장 지도</h1>
        {hasDemo && <div style={{ width: 168 }}><Segmented ariaLabel="기록 종류" value={source} onChange={(v) => { setSource(v); setSel(null); }} options={[{ value: 'real', label: '실제 기록' }, { value: 'demo', label: '데모' }]} /></div>}
      </header>
      <div className="stack" style={{ gap: 20, marginTop: 12 }}>
        {source === 'demo' && <div className="demo-ribbon" style={{ margin: 0, borderRadius: 12 }}><FlaskConical size={14} />데모 기록으로 만든 발도장이에요 · 실제 통계와 분리</div>}
        <StatStrip items={[{ value: String(ended.length), unit: '회', label: '총 여행 횟수' }, { value: kmText, unit: 'km', label: '누적 이동 거리' }, { value: String(paws.length), unit: '곳', label: '방문 지역' }]} />
        <div className="paw-map-card">
          <span className="legend">발도장 크기 = 방문 횟수</span>
          <MapView
            fit="korea"
            height={460}
            markers={paws.map((p) => ({ id: p.region.id, point: p.region, kind: 'paw' as const, count: p.tripIds.size, active: p.region.id === sel, label: `${p.region.name} ${p.tripIds.size}회`, onClick: () => setSel(p.region.id === sel ? null : p.region.id) }))}
            ariaLabel="발도장 지도"
          />
        </div>

        {paws.length === 0 ? (
          <div className="card"><EmptyState title="아직 발도장이 없어요" desc="여행을 마치면 도착한 지역에 발도장이 찍혀요." /></div>
        ) : (
          <>
            {selected && (
              <section className="region-panel" aria-label={`${selected.region.name} 여행`}>
                <div className="row between">
                  <div><p className="h-md">{selected.region.province} {selected.region.name}</p><p className="t-cap">{selTrips.length}회 방문 · 사진 {selTrips.reduce((a, t) => a + (t.coverPhotoUri ? 1 : 0), 0) ? '있음' : '없음'} · 마지막 {formatShortDate(Math.max(...selTrips.map((t) => t.startTime)))}</p></div>
                  <span className="row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 700 }}><PawGlyph size={16} color="var(--primary)" />×{selected.tripIds.size}</span>
                </div>
                {selTrips.map((t) => (
                  <button key={t.id} className="place-row" onClick={() => navigate(`/album/${t.id}`)}>
                    <span className="pr-thumb" style={{ width: 64, height: 64 }}>{t.coverPhotoUri ? <img src={t.coverPhotoUri} alt="" /> : <PhotoFallback size={24} />}</span>
                    <span className="pr-text"><span className="pr-title ellipsis">{t.title}</span><span className="pr-meta">{formatShortDate(t.startTime)} · {formatKm(t.totalDistanceKm)}</span></span>
                    <ChevronRight size={18} color="var(--text-3)" />
                  </button>
                ))}
                <button className="btn secondary block" onClick={() => navigate(albumLink(selected.region.name))}>{selected.region.name} 앨범에서 보기<ChevronRight size={16} /></button>
              </section>
            )}
            <section>
              <SectionHeader title="방문 지역" />
              <div className="list-card region-list">
                {paws.map((p) => {
                  const ts = ended.filter((t) => p.tripIds.has(t.id));
                  return (
                    <button key={p.region.id} className="row-btn" aria-pressed={sel === p.region.id} onClick={() => setSel(sel === p.region.id ? null : p.region.id)}>
                      <span className="icon-tile" style={{ borderRadius: 18, width: 36, height: 36 }}><PawGlyph size={18} color="var(--primary)" /></span>
                      <span className="grow"><b style={{ fontWeight: 600 }}>{p.region.province} {p.region.name}</b><br /><span className="t-cap">{formatKm(ts.reduce((a, t) => a + t.totalDistanceKm, 0))}</span></span>
                      <b style={{ color: 'var(--primary)', fontWeight: 600 }}>{p.tripIds.size}회</b>
                      <ChevronRight size={18} color="var(--text-3)" />
                    </button>
                  );
                })}
              </div>
              <p className="t-cap mt-8" style={{ fontSize: 12 }}>완료된 여행만 표시해요. 발도장은 도착 지역과 방문 장소를 기준으로 찍혀요.{source === 'real' && hasDemo ? ' 데모 기록은 ‘데모’ 탭에서 따로 볼 수 있어요.' : ''}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
