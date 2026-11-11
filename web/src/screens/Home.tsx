// 상황별 홈: 여행 단계에 따라 다른 홈을 보여줍니다.
//  - 주행 중(이동 중·복귀 중)  → 주행 대시보드(TripLive)
//  - 여행지 활동 중            → Destination
//  - 최근 7일 안에 완료한 여행  → 여행 완료 홈(+ 일반 홈 항목)
//  - 그 외                     → 일반 홈
import { useState, useSyncExternalStore } from 'react';
import { BookImage, Check, ChevronRight, Coffee, Footprints, MapPin, Navigation, Play, Search, Share2, ShieldCheck, Sparkles, Trees, Utensils } from 'lucide-react';
import { REGIONS } from '../domain/regions';
import { SAFETY_ITEMS } from '../domain/plan';
import { realStats, useStore } from '../app/store';
import { navigate } from '../app/router';
import { formatDuration, formatKm, formatKoreanDate, formatShortDate } from '../domain/format';
import { callName } from '../domain/tripText';
import { regionShort } from '../domain/regions';
import type { Trip } from '../domain/models';
import { TripController } from '../trip/TripController';
import { Logo, PawGlyph, PetAvatar, Scene } from '../ui/Art';
import { EmptyState } from '../ui/components';
import { TripCard } from './Album';
import TripLive from './TripLive';
import Destination from './Destination';

const COMPLETED_HOME_DAYS = 7;

/** 추천 여행지: 앱이 고른 '지역 아이디어'일 뿐, 반려견 동반 정보를 보장하지 않음(예시 큐레이션) */
const RECOMMENDED = [
  { region: '강릉', note: '바다 산책로 · 서울에서 약 2시간 반', mint: false },
  { region: '가평', note: '강변 산책 · 서울 근교', mint: true },
  { region: '속초', note: '해변 · 설악 자락', mint: false },
  { region: '양평', note: '강변 드라이브', mint: true },
];

export default function Home() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  if (live.active && live.phase === 'at-destination') return <Destination />;
  if (live.active) return <TripLive />;
  return <IdleHome />;
}

function IdleHome() {
  const { pets, trips, tripPets, settings } = useStore();
  const [petIdx, setPetIdx] = useState(0);
  const pet = pets[Math.min(petIdx, pets.length - 1)];
  const stats = realStats(trips, pet?.id, tripPets);
  const allStats = realStats(trips);
  const completed = trips.filter((t) => t.status === 'ended');
  const lastDone = completed[0];
  const showCompleted = !!lastDone && Date.now() - (lastDone.endTime ?? lastDone.startTime) < COMPLETED_HOME_DAYS * 86400_000;

  return (
    <div className="screen">
      <header className="row between" style={{ height: 60 }}>
        <Logo />
        <button className="icon-btn" aria-label="마이페이지" onClick={() => navigate('/my')} style={{ padding: 0 }}>
          <PetAvatar uri={pet?.photoUri ?? null} size={36} />
        </button>
      </header>

      {showCompleted && <CompletedHero trip={lastDone} totals={allStats} />}

      <h1 className="h-xl mt-8">
        {settings.userName ? `${settings.userName}님, ` : ''}오늘은 {pet ? callName(pet.name) : '우리 강아지'}와
        <br />어디로 떠나볼까요?
      </h1>

      {pet ? (
        <div className="card mt-16" style={{ background: 'linear-gradient(135deg, #fff 0%, #F3F8FF 100%)' }}>
          <div className="row" style={{ gap: 14 }}>
            <PetAvatar uri={pet.photoUri} size={64} ring />
            <div className="grow">
              <p className="h-md">{pet.name}</p>
              <p className="t-cap mt-8">함께 달린 기록</p>
            </div>
            {pets.length > 1 && <button className="chip" onClick={() => setPetIdx((petIdx + 1) % pets.length)}>다른 친구</button>}
          </div>
          <div className="grid-2 mt-16">
            <div className="muted-box"><p className="t-cap">누적 여행</p><p className="num" style={{ fontWeight: 750, fontSize: 20, marginTop: 4 }}>{stats.count}회</p></div>
            <div className="muted-box"><p className="t-cap">누적 이동 거리</p><p className="num" style={{ fontWeight: 750, fontSize: 20, marginTop: 4 }}>{formatKm(stats.km)}</p></div>
          </div>
          {trips.some((t) => t.isDemo) && <p className="t-cap mt-8">데모 기록은 누적 통계에 포함되지 않아요.</p>}
        </div>
      ) : (
        <div className="card mt-16">
          <p className="h-md">반려견을 먼저 등록해 주세요</p>
          <button className="btn secondary sm mt-12" onClick={() => navigate('/pet/new')}>반려견 등록</button>
        </div>
      )}

      {settings.demoMode && pet && (
        <div className="hint mt-16" style={{ alignItems: 'center' }}>
          <Navigation size={16} />
          <div className="grow"><span className="badge sample" style={{ height: 20, marginRight: 6 }}>데모</span>차량 내비에 <b>강릉 경포해변</b>이 목적지로 설정되어 있어요. 여행 기록을 시작할까요?</div>
          <button className="btn primary sm" onClick={() => navigate('/trip/setup?dest=강릉&from=navi')}>기록 시작</button>
        </div>
      )}

      <DestinationQuick disabled={!pet} />
      <SafetyCheck />

      <button className="btn primary block xl mt-16" onClick={() => navigate('/trip/setup')} disabled={!pet}>
        <Play size={22} fill="#fff" /> 새 여행 시작하기
      </button>
      {settings.demoMode && (
        <div className="card mt-12" style={{ background: 'var(--secondary)', boxShadow: 'none' }}>
          <p style={{ fontWeight: 700 }} className="row"><span className="badge sample">데모</span>서울 → 강릉 여행 체험 방법</p>
          <ol className="t-sub" style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.75 }}>
            <li>‘새 여행 시작하기’ → 시뮬레이션 속도(60~300배속) → 여행 시작</li>
            <li>휴식 알림·휴식 기록 → 강릉 근처에서 <b>‘목적지 도착’</b> (여행은 계속돼요)</li>
            <li>여행지에서 사진·장소·메모 기록 → ‘돌아가는 길 기록 시작’ → 서울 도착 후 ‘여행 완료’</li>
          </ol>
          <p className="t-cap mt-8">PC에서는 창 너비 900px 이상이면 차량용 가로 레이아웃으로 바뀌어요. 데모 기록은 실제 통계에 포함되지 않아요.</p>
        </div>
      )}

      <section className="section">
        <h2 className="h-md" style={{ marginBottom: 12 }}>주변 반려견 동반 장소</h2>
        <div className="grid-4">
          {[
            { label: '동반\n음식점', icon: Utensils, to: '/explore?cat=restaurant' },
            { label: '동반\n카페', icon: Coffee, to: '/explore?cat=cafe' },
            { label: '산책\n장소', icon: Trees, to: '/explore?cat=park' },
            { label: '전체\n보기', icon: MapPin, to: '/explore' },
          ].map((s) => (
            <button key={s.to} onClick={() => navigate(s.to)} style={{ border: 0, background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><s.icon size={24} /></span>
              <span style={{ fontSize: 12.5, lineHeight: 1.3, whiteSpace: 'pre-line', textAlign: 'center', color: 'var(--text)' }}>{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h-md">최근 여행 앨범</h2>{completed.length > 0 && <button className="link" onClick={() => navigate('/album')}>전체 보기 <ChevronRight size={16} /></button>}</div>
        {completed.length === 0 ? (
          <div className="card"><EmptyState title="아직 완료한 여행이 없어요" desc="첫 여행을 마치면 이곳에 앨범이 쌓여요." /></div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {completed.slice(showCompleted ? 1 : 0, showCompleted ? 4 : 3).map((t) => <TripCard key={t.id} trip={t} compact subtitle={`${formatShortDate(t.startTime)} · ${regionShort(t.endLocation)}`} />)}
            {showCompleted && completed.length === 1 && <p className="t-cap">위의 최근 여행이 전부예요.</p>}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h-md">추천 여행지</h2><span className="badge gray">예시 큐레이션</span></div>
        <div className="reco-row">
          {RECOMMENDED.map((r) => (
            <button key={r.region} className={`reco-card ${r.mint ? 'mint' : ''}`} onClick={() => navigate(`/explore?region=${encodeURIComponent(r.region)}`)}>
              <p className="h-md">{r.region}</p>
              <p className="t-cap mt-8">{r.note}</p>
              <p className="t-cap mt-8" style={{ color: 'var(--primary)', fontWeight: 600 }}>주변 동반 장소 보기 ›</p>
            </button>
          ))}
        </div>
        <p className="t-cap mt-8">추천 지역은 아이디어 예시예요. 반려견 동반 가능 여부는 장소마다 방문 전 확인해 주세요.</p>
      </section>

      <section className="section">
        <button className="card-btn" style={{ width: '100%' }} onClick={() => navigate('/pawmap')}>
          <div className="card row" style={{ gap: 14, background: 'var(--primary)', color: '#fff' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}><PawGlyph size={26} color="#fff" /></div>
            <div className="grow"><p style={{ fontWeight: 700 }}>발도장 지도</p><p style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>함께 다녀온 지역 {new Set(completed.filter((t) => !t.isDemo).map((t) => regionShort(t.endLocation))).size}곳</p></div>
            <ChevronRight size={20} />
          </div>
        </button>
      </section>
    </div>
  );
}

/** 여행 완료 홈: 최근 여행 기록 · AI 여행 일기 · 여행 앨범 · 누적 통계 · 공유하기 */
function CompletedHero({ trip, totals }: { trip: Trip; totals: { count: number; km: number; drivingSec: number } }) {
  return (
    <section className="home-hero mt-8" aria-label="최근 완료한 여행">
      <div style={{ position: 'relative', aspectRatio: '16 / 8', background: 'var(--secondary)' }}>
        {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Scene kind="album" height={200} />}
        <span className="badge" style={{ position: 'absolute', left: 12, top: 12, background: 'var(--primary)', color: '#fff' }}>여행 완료</span>
        {trip.isDemo && <span className="badge sample" style={{ position: 'absolute', right: 12, top: 12 }}>데모</span>}
      </div>
      <div style={{ padding: 18 }}>
        <p className="h-lg">{trip.title}</p>
        <p className="t-sub mt-8">{formatKoreanDate(trip.startTime)} · {formatKm(trip.totalDistanceKm)} · 주행 {formatDuration(trip.drivingDurationSeconds)}</p>
        <div className="tile-row mt-16">
          <button className="tile" onClick={() => navigate(`/album/${trip.id}/diary`)}><Sparkles size={24} />AI 여행 일기</button>
          <button className="tile" onClick={() => navigate(`/album/${trip.id}`)}><BookImage size={24} />여행 앨범</button>
          <button className="tile" onClick={() => navigate(`/album/${trip.id}?share=1`)}><Share2 size={24} />공유하기</button>
        </div>
        <div className="grid-3 mt-16" style={{ background: '#F4F8FF', borderRadius: 16, padding: '12px 0' }}>
          <div><p className="k">누적 여행</p><p className="v">{totals.count}회</p></div>
          <div><p className="k">누적 거리</p><p className="v">{formatKm(totals.km)}</p></div>
          <div><p className="k">누적 주행</p><p className="v">{formatDuration(totals.drivingSec)}</p></div>
        </div>
        <p className="t-cap mt-8 row" style={{ gap: 4 }}><Footprints size={13} />누적 통계는 실제 기록만 집계해요{trip.isDemo ? ' (이 데모 여행은 제외)' : ''}.</p>
        <button className="btn ghost sm block mt-12" onClick={() => navigate(trip.isDemo ? '/pawmap?src=demo' : '/pawmap')}><PawGlyph size={16} color="var(--primary)" />발도장 지도에서 보기</button>
      </div>
    </section>
  );
}

/** 여행 전 홈: 목적지 바로 설정 → 여행 시작 화면으로 전달 */
function DestinationQuick({ disabled }: { disabled: boolean }) {
  const [q, setQ] = useState('');
  const matches = q.trim() ? REGIONS.filter((r) => r.name.includes(q.trim()) || r.province.includes(q.trim())).slice(0, 5) : [];
  return (
    <section className="card mt-16">
      <p className="h-md row" style={{ gap: 6 }}><MapPin size={18} color="var(--primary)" />여행 목적지</p>
      <div style={{ position: 'relative' }} className="mt-12">
        <Search size={17} style={{ position: 'absolute', left: 14, top: 17, color: 'var(--text-2)' }} />
        <input className="input" style={{ paddingLeft: 40 }} disabled={disabled} placeholder="어디로 갈까요? (예: 강릉)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="여행 목적지" />
      </div>
      {matches.length > 0 && (
        <div className="chips mt-8">
          {matches.map((r) => <button key={r.id} className="chip" onClick={() => navigate(`/trip/setup?dest=${encodeURIComponent(r.name)}`)}>{r.province} {r.name} →</button>)}
        </div>
      )}
      <p className="t-cap mt-8">목적지 없이도 출발할 수 있어요. 고르면 예상 주행 시간과 휴식 횟수를 미리 알려드려요.</p>
    </section>
  );
}

/** 출발 전 안전 체크(보호자 확인용 체크리스트, 새 여행을 시작하면 초기화) */
function SafetyCheck() {
  const { settings, updateSettings } = useStore();
  const done = new Set(settings.safetyChecks);
  const toggle = (id: string) => {
    const n = new Set(done);
    if (n.has(id)) n.delete(id); else n.add(id);
    void updateSettings({ safetyChecks: [...n] });
  };
  return (
    <section className="card mt-12">
      <div className="row between">
        <p className="h-md row" style={{ gap: 6 }}><ShieldCheck size={18} color="var(--primary)" />출발 전 안전 체크</p>
        <span className="badge">{done.size}/{SAFETY_ITEMS.length}</span>
      </div>
      <div className="mt-12" style={{ display: 'grid', gap: 6 }}>
        {SAFETY_ITEMS.map((it) => {
          const on = done.has(it.id);
          return (
            <button key={it.id} className="check-row" aria-pressed={on} onClick={() => toggle(it.id)}>
              <span className={`check-box ${on ? 'on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
              <span style={{ textAlign: 'left' }}>{it.label}</span>
            </button>
          );
        })}
      </div>
      <p className="t-cap mt-8">보호자가 직접 확인하는 체크리스트예요. 차량 상태를 자동으로 점검하지 않아요.</p>
    </section>
  );
}
