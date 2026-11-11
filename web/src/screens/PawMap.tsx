import { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useStore } from '../app/store';
import { repo } from '../data/db';
import type { VisitedPlace } from '../domain/models';
import { nearestRegion, type Region } from '../domain/regions';
import { MapView } from '../ui/MapView';
import { EmptyState, Segmented, TopBar } from '../ui/components';
import { PawGlyph } from '../ui/Art';
import { navigate, queryParam, useRoute } from '../app/router';
import { formatKm } from '../domain/format';
import { TripCard } from './Album';

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

  return (
    <div className="screen">
      <TopBar title="발도장 지도" />
      {hasDemo && (
        <div style={{ marginBottom: 12 }}>
          <Segmented ariaLabel="기록 종류" value={source} onChange={(v) => { setSource(v); setSel(null); }} options={[{ value: 'real', label: '실제 기록' }, { value: 'demo', label: '데모 기록' }]} />
        </div>
      )}
      {source === 'demo' && <div className="demo-ribbon" style={{ margin: '0 0 12px', borderRadius: 12 }}><FlaskConical size={14} />데모 기록으로 만든 발도장이에요</div>}
      <MapView
        fit="korea"
        height={420}
        markers={paws.map((p) => ({ id: p.region.id, point: p.region, kind: 'paw' as const, count: p.tripIds.size, active: p.region.id === sel, label: `${p.region.name} ${p.tripIds.size}회`, onClick: () => setSel(p.region.id === sel ? null : p.region.id) }))}
        ariaLabel="발도장 지도"
      />
      <div className="card mt-16" style={{ padding: '16px 10px' }}>
        <div className="grid-3">
          <div><p className="k">총 여행 횟수</p><p className="v" style={{ fontSize: 22 }}>{ended.length}회</p></div>
          <div><p className="k">누적 이동 거리</p><p className="v" style={{ fontSize: 22 }}>{formatKm(ended.reduce((a, t) => a + t.totalDistanceKm, 0))}</p></div>
          <div><p className="k">방문 지역</p><p className="v" style={{ fontSize: 22 }}>{paws.length}곳</p></div>
        </div>
      </div>
      {paws.length > 0 && (
        <div className="region-cards mt-12">
          {paws.slice(0, 6).map((p) => (
            <button key={p.region.id} className="region-card" onClick={() => navigate(`/album?region=${encodeURIComponent(p.region.name)}${source === 'demo' ? '&src=demo' : ''}`)}>
              <PawGlyph size={22} color="var(--primary)" />
              <span>{p.region.name}</span><b>{p.tripIds.size}회</b>
            </button>
          ))}
        </div>
      )}

      {paws.length === 0 ? (
        <div className="card mt-16"><EmptyState title="아직 발도장이 없어요" desc="여행을 마치면 도착한 지역에 발도장이 찍혀요." /></div>
      ) : (
        <section className="section">
          <div className="chips">
            {paws.map((p) => (
              <button key={p.region.id} className={`chip ${sel === p.region.id ? 'on' : ''}`} onClick={() => setSel(sel === p.region.id ? null : p.region.id)}>
                {p.region.name} <b>{p.tripIds.size}</b>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="mt-16" style={{ display: 'grid', gap: 12 }}>
              <div className="row between">
                <p className="h-md">{selected.region.province} {selected.region.name}의 여행 {selTrips.length}개</p>
                <button className="link" onClick={() => navigate(`/album?region=${encodeURIComponent(selected.region.name)}${source === 'demo' ? '&src=demo' : ''}`)}>앨범에서 보기 ›</button>
              </div>
              {selTrips.map((t) => <TripCard key={t.id} trip={t} compact />)}
            </div>
          ) : (
            <p className="t-cap mt-12">지도나 지역을 누르면 그 지역의 여행 기록을 볼 수 있어요. 발도장은 도착 지역과 방문 장소를 기준으로 찍혀요.</p>
          )}
        </section>
      )}
    </div>
  );
}
