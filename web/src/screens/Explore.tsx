import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Clock, Lock, MapPin, Navigation, Phone, Search, TriangleAlert } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam } from '../app/router';
import { CATEGORY_LABEL, newId, type GeoPoint, type PlaceCategory } from '../domain/models';
import { REGIONS, regionLabel } from '../domain/regions';
import { formatKm } from '../domain/format';
import { haversineKm } from '../domain/geo';
import { repo } from '../data/db';
import { TripController } from '../trip/TripController';
import { DEMO_ROUTE } from '../vehicle/demoRoute';
import { getPlaceProvider, sortByDistance } from '../places/providers';
import { applyPolicyFilters, POLICY_LABEL, type Place, type PetPolicyKey, type SearchMode, type Tri } from '../places/PlaceSearchProvider';
import { openNavigation } from '../places/navigation';
import { EmptyState, Hint, Loading, Sheet, TopBar } from '../ui/components';
import { CategoryIcon, PlaceThumb } from '../ui/Art';

const CATS = Object.keys(CATEGORY_LABEL) as PlaceCategory[];
const MODES: { value: SearchMode; label: string }[] = [
  { value: 'current', label: '현재 위치' },
  { value: 'destination', label: '목적지' },
  { value: 'route', label: '이동 경로' },
  { value: 'region', label: '지역 검색' },
];
const FILTERS = Object.keys(POLICY_LABEL) as PetPolicyKey[];

type Center = { points: GeoPoint[]; label: string; origin: GeoPoint | null } | { error: string };

export default function Explore({ route }: { route: string }) {
  const { settings, trips, toast } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const initialCat = (queryParam(route, 'cat') as PlaceCategory) || 'restaurant';
  const [cat, setCat] = useState<PlaceCategory>(CATS.includes(initialCat) ? initialCat : 'restaurant');
  const [mode, setMode] = useState<SearchMode>('current');
  const [regionText, setRegionText] = useState('');
  const [regionId, setRegionId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PetPolicyKey[]>([]);
  const [center, setCenter] = useState<Center | null>(null);
  const [results, setResults] = useState<{ loading: boolean; error: string | null; places: Place[] }>({ loading: false, error: null, places: [] });
  const [detail, setDetail] = useState<Place | null>(null);
  const [nonce, setNonce] = useState(0);
  const provider = useMemo(() => getPlaceProvider(settings.apiBaseUrl), [settings.apiBaseUrl]);
  const driving = live.active && live.engine?.status === 'driving';

  useEffect(() => {
    const c = queryParam(route, 'cat') as PlaceCategory | null;
    if (c && CATS.includes(c)) setCat(c);
  }, [route]);

  // 검색 기준 위치 결정
  useEffect(() => {
    let cancelled = false;
    const lastTrip = trips.find((t) => t.status === 'ended');
    const set = (c: Center) => !cancelled && setCenter(c);
    if (mode === 'current') {
      if (live.active && live.position) set({ points: [live.position], label: `현재 위치 · ${regionLabel(live.position)}`, origin: live.position });
      else if (settings.demoMode) set({ points: [DEMO_ROUTE[0]], label: '데모 위치 · 서울 시청', origin: DEMO_ROUTE[0] });
      else if (!('geolocation' in navigator)) set({ error: '이 기기에서는 위치를 쓸 수 없어요. 지역 검색을 이용해 주세요.' });
      else {
        setCenter(null);
        navigator.geolocation.getCurrentPosition(
          (p) => { const g = { latitude: p.coords.latitude, longitude: p.coords.longitude }; set({ points: [g], label: `현재 위치 · ${regionLabel(g)}`, origin: g }); },
          (err) => set({ error: err.code === err.PERMISSION_DENIED ? '위치 권한이 없어 현재 위치 주변을 찾을 수 없어요. 지역 검색을 이용해 주세요.' : '현재 위치를 가져오지 못했어요.' }),
          { timeout: 10000, maximumAge: 60000 },
        );
      }
    } else if (mode === 'destination') {
      const d = live.trip?.destination ?? lastTrip?.destination ?? null;
      const name = live.trip?.destinationName ?? lastTrip?.destinationName;
      set(d ? { points: [d], label: `목적지 · ${name ?? regionLabel(d)}`, origin: live.position ?? d } : { error: '목적지가 정해진 여행이 없어요. 여행 시작 화면에서 목적지를 입력해 보세요.' });
    } else if (mode === 'route') {
      const pts = live.active && live.route.length > 1 ? live.route : settings.demoMode ? DEMO_ROUTE : [];
      if (pts.length < 2) set({ error: '이동 중인 경로가 없어요. 여행을 시작하면 경로 주변을 찾아드려요.' });
      else {
        // 경로를 따라 약 40km 간격 지점 최대 5곳
        const samples: GeoPoint[] = [pts[0]];
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          acc += haversineKm(pts[i - 1], pts[i]);
          if (acc >= 40) { samples.push(pts[i]); acc = 0; }
        }
        samples.push(pts[pts.length - 1]);
        set({ points: samples.slice(-5), label: `이동 경로 주변 ${samples.slice(-5).length}개 지점${live.active ? '' : ' (데모 경로)'}`, origin: live.position ?? pts[0] });
      }
    } else {
      const r = REGIONS.find((x) => x.id === regionId);
      set(r ? { points: [r], label: `${r.province} ${r.name} 주변`, origin: live.position ?? r } : { error: '' });
    }
    return () => { cancelled = true; };
  }, [mode, regionId, live.active, live.position?.latitude.toFixed(2), live.trip?.destination, settings.demoMode, trips]); // eslint-disable-line react-hooks/exhaustive-deps

  // 장소 검색
  useEffect(() => {
    if (!center || 'error' in center || driving) return;
    const ac = new AbortController();
    setResults({ loading: true, error: null, places: [] });
    provider
      .search({ category: cat, centers: center.points, radiusKm: mode === 'route' ? 6 : 8 }, ac.signal)
      .then((places) => setResults({ loading: false, error: null, places }))
      .catch((e) => { if (e.name !== 'AbortError') setResults({ loading: false, error: (e as Error).message, places: [] }); });
    return () => ac.abort();
  }, [center, cat, provider, nonce, driving, mode]);

  const regionMatches = regionText.trim() ? REGIONS.filter((r) => r.name.includes(regionText.trim()) || r.province.includes(regionText.trim())).slice(0, 6) : [];
  const origin = center && !('error' in center) ? center.origin : null;
  const { matched, unknown } = applyPolicyFilters(results.places, provider.providesPetPolicy ? filters : []);
  const sorted = sortByDistance(matched, origin);
  const sortedUnknown = sortByDistance(unknown, origin);

  if (driving) {
    return (
      <div className="screen">
        <TopBar title="주변 탐색" showBack={false} />
        <EmptyState kind="empty-place" title="주행 중에는 장소 목록이 잠겨요" desc="안전을 위해 정차 후 이용해 주세요. 휴식 장소는 여행 화면의 ‘주변 휴식 장소’에서 크게 볼 수 있어요." action={<button className="btn primary" onClick={() => navigate('/trip/live')}><Lock size={16} />여행 화면으로</button>} />
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="주변 탐색" showBack={false} right={provider.isSample ? <span className="badge sample">샘플 데이터</span> : <span className="badge">{provider.label}</span>} />

      <div className="chips scroll" role="tablist" aria-label="카테고리">
        {CATS.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
            <CategoryIcon category={c} size={16} />{CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="seg mt-12" role="radiogroup" aria-label="검색 기준">
        {MODES.map((m) => (
          <button key={m.value} role="radio" aria-checked={mode === m.value} className={mode === m.value ? 'on' : ''} style={{ fontSize: 13.5 }} onClick={() => setMode(m.value)}>{m.label}</button>
        ))}
      </div>

      {mode === 'region' && (
        <div className="mt-12">
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: 17, color: 'var(--text-2)' }} />
            <input className="input" style={{ paddingLeft: 40 }} placeholder="지역 이름 (예: 강릉, 제주)" value={regionText} onChange={(e) => { setRegionText(e.target.value); setRegionId(null); }} aria-label="지역 검색" />
          </div>
          {!regionId && regionMatches.length > 0 && (
            <div className="chips mt-8">
              {regionMatches.map((r) => <button key={r.id} className="chip" onClick={() => { setRegionId(r.id); setRegionText(r.name); }}>{r.province} {r.name}</button>)}
            </div>
          )}
          {regionText.trim() && !regionId && regionMatches.length === 0 && <p className="t-cap mt-8">찾는 지역이 없어요. 시·군 이름으로 검색해 주세요.</p>}
        </div>
      )}

      <div className="mt-16">
        <p className="t-cap" style={{ fontWeight: 600, marginBottom: 8 }}>반려동물 동반 조건</p>
        <div className="chips scroll">
          {FILTERS.map((f) => {
            const on = filters.includes(f);
            return (
              <button key={f} className={`chip ${on ? 'on' : ''}`} disabled={!provider.providesPetPolicy} aria-pressed={on} onClick={() => setFilters((s) => (on ? s.filter((x) => x !== f) : [...s, f]))}>
                {POLICY_LABEL[f]}
              </button>
            );
          })}
        </div>
        {!provider.providesPetPolicy && <p className="t-cap mt-8">현재 장소 데이터에는 반려동물 동반 조건 정보가 없어 필터를 쓸 수 없어요.</p>}
      </div>

      <div className="mt-16">
        {center && !('error' in center) && <p className="t-cap row" style={{ gap: 4 }}><MapPin size={13} />{center.label}</p>}
        {center === null ? (
          <Loading label="위치를 확인하고 있어요" />
        ) : 'error' in center ? (
          center.error ? <EmptyState kind="empty-place" title="검색 기준이 필요해요" desc={center.error} action={mode !== 'region' ? <button className="btn ghost sm" onClick={() => setMode('region')}>지역으로 검색</button> : undefined} />
            : <EmptyState kind="empty-place" title="어느 지역을 찾아볼까요?" desc="지역 이름을 입력하고 목록에서 골라 주세요." />
        ) : results.loading ? (
          <div style={{ display: 'grid', gap: 10 }} className="mt-12" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 92 }} />)}
          </div>
        ) : results.error ? (
          <EmptyState kind="error" title="장소를 불러오지 못했어요" desc={`${results.error} 네트워크 상태를 확인하고 다시 시도해 주세요.`} action={<button className="btn ghost sm" onClick={() => setNonce((n) => n + 1)}>다시 시도</button>} />
        ) : sorted.length === 0 && sortedUnknown.length === 0 ? (
          <EmptyState kind="empty-place" title="조건에 맞는 장소가 없어요" desc={filters.length ? '필터를 줄이거나 다른 카테고리를 찾아보세요.' : '다른 지역이나 카테고리를 찾아보세요.'} />
        ) : (
          <div style={{ display: 'grid', gap: 10 }} className="mt-12">
            {sorted.map(({ place, distanceKm }) => <PlaceCard key={place.id} place={place} distanceKm={distanceKm} onOpen={() => setDetail(place)} />)}
            {sortedUnknown.length > 0 && (
              <>
                <p className="t-cap mt-12" style={{ fontWeight: 600 }}>선택한 조건의 정보가 없는 장소 {sortedUnknown.length}곳 · 방문 전 확인이 필요해요</p>
                {sortedUnknown.map(({ place, distanceKm }) => <PlaceCard key={place.id} place={place} distanceKm={distanceKm} onOpen={() => setDetail(place)} dim />)}
              </>
            )}
            {provider.isSample && <p className="t-cap" style={{ textAlign: 'center', marginTop: 6 }}>표시된 장소는 모두 가상의 샘플 데이터예요. 실제 검색 결과가 아닙니다.</p>}
          </div>
        )}
      </div>

      <PlaceDetailSheet place={detail} origin={origin} onClose={() => setDetail(null)} onToast={toast} />
    </div>
  );
}

function triLabel(v: Tri, kind: 'yes' | 'need' = 'yes') {
  if (v == null) return '정보 없음';
  if (kind === 'need') return v ? '필요' : '필요 없음';
  return v ? '가능' : '불가';
}

function PlaceCard({ place, distanceKm, onOpen, dim }: { place: Place; distanceKm: number | null; onOpen: () => void; dim?: boolean }) {
  const p = place.policy;
  const tags: { k: string; ok: boolean }[] = [];
  if (p.smallDog) tags.push({ k: '소형견', ok: true });
  if (p.largeDog) tags.push({ k: '대형견', ok: true });
  if (p.indoor) tags.push({ k: '실내 동반', ok: true });
  if (p.outdoor) tags.push({ k: '야외 동반', ok: true });
  if (p.parking) tags.push({ k: '주차', ok: true });
  return (
    <button className="card-btn" onClick={onOpen} style={{ opacity: dim ? 0.75 : 1 }}>
      <div className="card row" style={{ gap: 14, padding: 14 }}>
        <PlaceThumb category={place.category} size={64} />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <p style={{ fontWeight: 700 }} className="ellipsis">{place.name}</p>
            {place.isSample && <span className="badge sample">샘플</span>}
          </div>
          <p className="t-cap mt-8 ellipsis">{distanceKm != null ? `${formatKm(distanceKm)} · ` : ''}{place.address}</p>
          <div className="row mt-8" style={{ gap: 4, flexWrap: 'wrap' }}>
            {tags.length ? tags.slice(0, 4).map((t) => <span key={t.k} className="badge">{t.k}</span>) : <span className="badge gray">동반 조건 정보 없음</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function PlaceDetailSheet({ place, origin, onClose, onToast }: { place: Place | null; origin: GeoPoint | null; onClose: () => void; onToast: (t: string, tone?: 'info' | 'error') => void }) {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  if (!place) return null;
  const p = place.policy;
  const rows: [string, string][] = [
    ['소형견 동반', triLabel(p.smallDog)],
    ['대형견 동반', triLabel(p.largeDog)],
    ['실내 동반', triLabel(p.indoor)],
    ['야외 동반', triLabel(p.outdoor)],
    ['이동장', triLabel(p.carrierRequired, 'need')],
    ['주차', triLabel(p.parking)],
  ];
  const canRecord = live.active && live.engine?.status !== 'driving' && live.trip;
  return (
    <Sheet open onClose={onClose} labelledBy="pd-title">
      <PlaceThumb category={place.category} size="100%" radius={18} />
      <div className="row mt-16" style={{ gap: 8 }}>
        <span className="badge">{CATEGORY_LABEL[place.category]}</span>
        {place.isSample && <span className="badge sample">샘플 데이터</span>}
      </div>
      <h2 id="pd-title" className="h-lg mt-8">{place.name}</h2>
      <p className="t-sub mt-8 row" style={{ gap: 6 }}><MapPin size={15} />{place.address}{origin ? ` · ${formatKm(haversineKm(origin, place))}` : ''}</p>
      <div className="muted-box mt-16">
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>반려동물 동반 조건</p>
        {rows.map(([k, v]) => (
          <div key={k} className="row between" style={{ padding: '6px 0', fontSize: 14 }}>
            <span className="t-sub">{k}</span>
            <span style={{ fontWeight: 650, color: v === '정보 없음' ? 'var(--text-3)' : v === '불가' ? '#b8453d' : 'var(--text)' }}>{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-16" style={{ display: 'grid', gap: 8, fontSize: 14 }}>
        <p className="row" style={{ gap: 8 }}><Clock size={16} color="var(--text-2)" />{place.hours ?? '영업시간 정보 없음'}</p>
        <p className="row" style={{ gap: 8 }}><Phone size={16} color="var(--text-2)" />{place.phone ? (place.isSample ? `${place.phone} (가상 번호)` : <a href={`tel:${place.phone}`}>{place.phone}</a>) : '전화번호 정보 없음'}</p>
      </div>
      <div className="mt-16"><Hint><span>반려동물 동반 정책은 변경될 수 있어요. 방문 전 매장에 꼭 확인해 주세요.</span></Hint></div>
      <div className="btn-row mt-16">
        {canRecord && (
          <button className="btn ghost" onClick={async () => {
            try {
              await repo.addVisitedPlace({ id: newId(), tripId: live.trip!.id, placeName: place.name, category: place.category, latitude: place.latitude, longitude: place.longitude, visitedAt: Date.now(), isSample: place.isSample });
              onToast('방문 장소로 기록했어요.');
            } catch (e) { onToast((e as Error).message, 'error'); }
          }}>방문 기록</button>
        )}
        <button className="btn primary" onClick={() => { const r = openNavigation(place.name, place.latitude, place.longitude, place.isSample); if (!r.ok) onToast(r.message!, 'error'); }}>
          <Navigation size={18} />길 안내
        </button>
      </div>
      {place.isSample && <p className="t-cap mt-8" style={{ textAlign: 'center' }}><TriangleAlert size={12} style={{ verticalAlign: -2 }} /> 샘플 장소는 실제로 존재하지 않아요.</p>}
    </Sheet>
  );
}
