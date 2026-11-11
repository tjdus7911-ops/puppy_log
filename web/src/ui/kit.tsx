// 멍로드 디자인 시스템 v1 공통 UI (Figma 컴포넌트와 1:1 대응)
//  SectionHeader · StatStrip · JourneyBar · Timeline · TripPhotoCard · PlaceRow · PhotoFallback
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { navigate } from '../app/router';
import type { Trip } from '../domain/models';
import { formatKm, formatShortDate } from '../domain/format';
import { PawGlyph } from './Art';

export function SectionHeader({ title, action, onAction, aside }: { title: ReactNode; action?: string; onAction?: () => void; aside?: ReactNode }) {
  return (
    <div className="sec-h">
      <h2 className="h-md">{title}</h2>
      {aside}
      {action && onAction && (
        <button className="link" onClick={onAction}>{action}<ChevronRight size={16} /></button>
      )}
    </div>
  );
}

export interface StatDef { value: string; unit?: string; label: string }

export function Stat({ value, unit, label, tone }: StatDef & { tone?: 'rest' }) {
  return (
    <div className={`stat-i ${tone ?? ''}`}>
      <p className="v num">{value}{unit && <span className="u">{unit}</span>}</p>
      <p className="k">{label}</p>
    </div>
  );
}

/** 작고 정돈된 통계 줄(카드 + 세로 구분선) */
export function StatStrip({ items }: { items: StatDef[] }) {
  return (
    <div className="stat-strip">
      {items.map((s, i) => (
        <div key={s.label} style={{ display: 'contents' }}>
          {i > 0 && <span className="stat-div" aria-hidden="true" />}
          <Stat {...s} />
        </div>
      ))}
    </div>
  );
}

/** 여정 진행 바: 현재 위치(0~1)와 다음 휴식 예정 지점(0~1, 추정) */
export function JourneyBar({ progress, restAt, big = false, label }: { progress: number; restAt?: number | null; big?: boolean; label?: string }) {
  const p = Math.max(0, Math.min(1, progress));
  const r = restAt == null ? null : Math.max(0, Math.min(1, restAt));
  return (
    <div className={`jbar ${big ? 'big' : ''}`} role="img" aria-label={label ?? `여정 ${Math.round(p * 100)}% 진행`}>
      <span className="track" />
      <span className="fill" style={{ width: `${p * 100}%` }} />
      <span className="end start" />
      <span className="end goal" />
      {r != null && r > p && r < 0.99 && <span className="rest" style={{ left: `${r * 100}%` }} />}
      <span className="cur" style={{ left: `${p * 100}%` }} />
    </div>
  );
}

export interface TimelineItem { id: string; icon: ReactNode; title: string; time?: string; sub?: string; kind?: 'point' | 'rest' | 'leg' }

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="tl">
      {items.map((it) => (
        <li key={it.id} className={it.kind ?? 'point'}>
          <span className="tl-dot">{it.icon}</span>
          <div className="tl-body">
            <p className="tl-title">{it.title}{it.time && <span className="tl-time num">{it.time}</span>}</p>
            {it.sub && <p className="tl-sub">{it.sub}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 사진이 없을 때의 대체 배경(의미 없는 일러스트 대신 부드러운 블루 톤 + 발자국) */
export function PhotoFallback({ size = 44 }: { size?: number }) {
  return (
    <div className="ph-fallback" aria-hidden="true">
      <PawGlyph size={size} color="rgba(77,128,232,.35)" />
    </div>
  );
}

/** 사진 중심 여행 카드(최근 여행 가로 스크롤) */
export function TripPhotoCard({ trip, meta }: { trip: Trip; meta?: string }) {
  return (
    <button className="trip-card" onClick={() => navigate(`/album/${trip.id}`)} aria-label={`${trip.title} 상세 보기`}>
      {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="" /> : <PhotoFallback size={56} />}
      {trip.isDemo && <span className="badge sample tc-badge">데모</span>}
      <span className="tc-cap">
        <span className="tc-title">{trip.title || '제목 없는 여행'}</span>
        <span className="tc-meta num">{meta ?? `${formatShortDate(trip.startTime)} · ${formatKm(trip.totalDistanceKm)}`}</span>
      </span>
    </button>
  );
}

/** 장소 행: 썸네일 · 이름 · 메타 · 동반 상태 */
export function PlaceRow({ thumb, title, meta, status, onClick }: { thumb: ReactNode; title: string; meta: string; status?: { tone: 'ok' | 'check' | 'sample'; label: string }; onClick?: () => void }) {
  const body = (
    <>
      <span className="pr-thumb">{thumb}</span>
      <span className="pr-text">
        <span className="pr-title ellipsis">{title}</span>
        <span className="pr-meta ellipsis">{meta}</span>
      </span>
      {status && <span className={`badge ${status.tone === 'ok' ? 'rest' : status.tone === 'sample' ? 'sample' : 'est'}`}>{status.label}</span>}
    </>
  );
  return onClick ? <button className="place-row" onClick={onClick}>{body}</button> : <div className="place-row">{body}</div>;
}
