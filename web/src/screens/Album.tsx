import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { TripController } from '../trip/TripController';
import { PHASE_LABEL } from '../domain/models';
import { ChevronRight, FlaskConical, Footprints } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate, queryParam } from '../app/router';
import type { Trip } from '../domain/models';
import { formatDuration, formatKm, formatShortDate } from '../domain/format';
import { regionShort } from '../domain/regions';
import { EmptyState, Segmented, TopBar } from '../ui/components';
import { PawGlyph, Scene } from '../ui/Art';

export function TripCard({ trip, compact = false, subtitle }: { trip: Trip; compact?: boolean; subtitle?: string }) {
  return (
    <button className="card-btn" onClick={() => navigate(`/album/${trip.id}`)} aria-label={`${trip.title} 상세 보기`}>
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: compact ? 'flex' : 'block' }}>
        <div style={{ position: 'relative', width: compact ? 112 : '100%', aspectRatio: compact ? '1' : '16 / 9', flex: 'none', background: 'var(--secondary)' }}>
          {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Scene kind="drive" height={compact ? 112 : 200} />}
          {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', left: 8, top: 8 }}><FlaskConical size={12} />데모</span>}
        </div>
        <div style={{ padding: compact ? '12px 14px' : 16, flex: 1, minWidth: 0, textAlign: 'left' }}>
          <p style={{ fontWeight: 700, fontSize: compact ? 15 : 16.5 }} className="ellipsis">{trip.title || '제목 없는 여행'}</p>
          <p className="t-cap mt-8">{subtitle ?? `${formatShortDate(trip.startTime)} · ${regionShort(trip.startLocation)} → ${regionShort(trip.endLocation)}`}</p>
          <div className="row between mt-8">
            <span className="t-sub num" style={{ fontSize: 13.5 }}>{formatKm(trip.totalDistanceKm)} · 주행 {formatDuration(trip.drivingDurationSeconds)}</span>
            <span className="link" style={{ padding: 0, fontSize: 13 }}>상세 보기<ChevronRight size={14} /></span>
          </div>
        </div>
      </div>
    </button>
  );
}

type Sort = 'recent' | 'old' | 'region';

export default function Album({ route }: { route: string }) {
  const { trips } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [source, setSource] = useState<'real' | 'demo'>(queryParam(route, 'src') === 'demo' ? 'demo' : 'real');
  const [sort, setSort] = useState<Sort>('recent');
  const srcParam = queryParam(route, 'src') === 'demo' ? 'demo' : 'real';
  useEffect(() => setSource(srcParam), [srcParam]);
  const ended = trips.filter((t) => t.status === 'ended');
  const hasDemo = ended.some((t) => t.isDemo);
  const regionFilter = queryParam(route, 'region');
  const list = useMemo(() => {
    let l = ended.filter((t) => (source === 'demo' ? t.isDemo : !t.isDemo));
    if (regionFilter) l = l.filter((t) => regionShort(t.endLocation) === regionFilter || regionShort(t.startLocation) === regionFilter);
    return sort === 'old' ? [...l].sort((a, b) => a.startTime - b.startTime) : l;
  }, [ended, source, sort, regionFilter]);

  const groups = useMemo(() => {
    if (sort !== 'region') return null;
    const m = new Map<string, Trip[]>();
    for (const t of list) {
      const k = regionShort(t.endLocation);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [list, sort]);

  return (
    <div className="screen">
      <TopBar title="여행 기록" showBack={false} />
      <button className="card-btn" style={{ width: '100%' }} onClick={() => navigate('/pawmap')}>
        <div className="card row" style={{ gap: 14, background: 'var(--primary)', color: '#fff' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}><PawGlyph size={26} color="#fff" /></div>
          <div className="grow">
            <p style={{ fontWeight: 700 }}>발도장 지도</p>
            <p style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>함께 다녀온 지역을 한눈에 봐요</p>
          </div>
          <ChevronRight size={20} />
        </div>
      </button>

      {live.active && live.trip && (
        <button className="card-btn mt-12" style={{ width: '100%' }} onClick={() => navigate(live.driving ? '/trip/live' : '/home')}>
          <div className="card row" style={{ gap: 12, border: '1.5px solid var(--primary-soft)' }}>
            <span className="live-dot" />
            <div className="grow">
              <p style={{ fontWeight: 700 }}>진행 중인 여행 · {live.phase ? PHASE_LABEL[live.phase] : ''}</p>
              <p className="t-cap">{live.trip.title || `${live.petNames.join(', ')}와의 여행`} · 완료하면 앨범에 정리돼요</p>
            </div>
            <ChevronRight size={18} />
          </div>
        </button>
      )}

      {hasDemo && (
        <div className="mt-16">
          <Segmented ariaLabel="기록 종류" value={source} onChange={setSource} options={[{ value: 'real', label: '실제 기록' }, { value: 'demo', label: '데모 기록' }]} />
        </div>
      )}

      <div className="row between mt-16">
        <span className="t-sub">전체 <b style={{ color: 'var(--text)' }}>{list.length}</b>개{regionFilter && ` · ${regionFilter}`}</span>
        <div className="chips">
          {([['recent', '최근순'], ['old', '오래된순'], ['region', '지역별']] as [Sort, string][]).map(([v, l]) => (
            <button key={v} className={`chip ${sort === v ? 'on' : ''}`} style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }} onClick={() => setSort(v)}>{l}</button>
          ))}
        </div>
      </div>
      {regionFilter && <button className="link" onClick={() => navigate('/album', { replace: true })}>지역 필터 해제</button>}

      <div className="mt-12">
        {list.length === 0 ? (
          <div className="card">
            <EmptyState
              title={source === 'demo' ? '데모 기록이 없어요' : '아직 여행 기록이 없어요'}
              desc={source === 'demo' ? '데모 모드로 여행을 시작해 보세요.' : '여행을 마치면 이동 경로와 사진이 이곳에 앨범으로 정리돼요.'}
              action={<button className="btn primary sm" onClick={() => navigate('/trip/setup')}><Footprints size={16} />여행 시작하기</button>}
            />
          </div>
        ) : groups ? (
          groups.map(([region, ts]) => (
            <section key={region} className="mt-16">
              <p className="h-md" style={{ marginBottom: 10 }}>{region} <span className="t-cap">{ts.length}회</span></p>
              <div style={{ display: 'grid', gap: 12 }}>{ts.map((t) => <TripCard key={t.id} trip={t} compact />)}</div>
            </section>
          ))
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>{list.map((t) => <TripCard key={t.id} trip={t} />)}</div>
        )}
      </div>
    </div>
  );
}
