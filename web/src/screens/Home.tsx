// 상황별 홈: 여행 단계에 따라 다른 홈을 보여줍니다.
//  - 주행 중(이동 중·복귀 중)  → 주행 대시보드(TripLive)
//  - 여행지 활동 중            → Destination
//  - 최근 7일 안에 완료한 여행  → 여행 완료 홈(+ 일반 홈 항목)
//  - 그 외                     → 일반 홈
import { useState, useSyncExternalStore } from 'react';
import { Bell, BellRing, BookImage, Image as ImageIcon, MapPinned, MonitorSmartphone, ChevronRight, Coffee, Navigation, Search, Share2, ShieldCheck, Sparkles, Trees, Waves } from 'lucide-react';
import { REGIONS } from '../domain/regions';
import { SAFETY_ITEMS } from '../domain/plan';
import { realStats, useStore } from '../app/store';
import { navigate } from '../app/router';
import { formatDuration, formatKm, formatKoreanDate, formatShortDate } from '../domain/format';
import { callName } from '../domain/tripText';
import { regionShort } from '../domain/regions';
import type { Trip } from '../domain/models';
import { TripController } from '../trip/TripController';
import { useWide } from '../app/useWide';
import { openCarPreview } from '../CarPreview';
import { PawGlyph } from '../ui/Art';
import { Sheet } from '../ui/components';
import { MapView } from '../ui/MapView';
import { PhotoFallback, PlaceRow, SectionHeader, StatStrip, TripPhotoCard } from '../ui/kit';
import { PET_SIZE_LABEL as SIZE_LABEL } from '../domain/models';
import { aggregatePaws } from './PawMap';
import { PetHero } from './home/PetHero';
import CarHome from './home/CarHome';
import { BackgroundSheet, TripBackground } from './home/TripBackground';
import { SafetyCheck } from './SafetyCheck';
import TripLive from './TripLive';
import Destination from './Destination';

const COMPLETED_HOME_DAYS = 7;

/** 추천 여행지: 앱이 고른 '지역 아이디어'일 뿐, 반려견 동반 정보를 보장하지 않음(예시 큐레이션) */
const RECOMMENDED = [
  { region: '강릉', note: '바다 산책로 · 서울에서 약 2시간 반', icon: Waves },
  { region: '가평', note: '강변 산책 · 서울 근교', icon: Trees },
  { region: '양평', note: '강변 드라이브 · 카페', icon: Coffee },
];

export default function Home() {
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const wide = useWide();
  // 차량 화면: 홈은 항상 차량 메인 홈(진행 중인 여행은 카드로), 주행은 '/trip/live', 여행지 활동은 '/trip/destination'
  if (wide) return <CarHome />;
  if (live.active && live.phase === 'at-destination') return <Destination />;
  if (live.active) return <TripLive />;
  return <IdleWrap />;
}

/** 차량 가로 화면(대기): 왼쪽 반려견 개인화 패널 + 오른쪽 여행 계획(홈). 모바일은 한 화면에 위아래로 */
function IdleWrap() {
  const wide = useWide();
  if (!wide) return <IdleHome />;
  return (
    <div className="car-idle">
      <CarIdlePanel />
      <div className="ci-side"><IdleHome inCar /></div>
    </div>
  );
}

function CarIdlePanel() {
  const { pets } = useStore();
  const pet = pets[0];
  const actions = [
    { icon: Navigation, t: '스마트 주행', s: '목적지·휴식 계획 세우기', go: () => navigate(pet ? '/trip/setup' : '/pet/new') },
    { icon: BellRing, t: '휴식 알림', s: pet ? `${pet.restIntervalMinutes}분 간격 · 바꾸기` : '간격 설정', go: () => navigate(pet ? `/pet/${pet.id}` : '/my') },
    { icon: MapPinned, t: '동반 장소 추천', s: '근처 반려견 동반 장소', go: () => navigate('/explore') },
  ];
  return (
    <PetHero pets={pets} variant="panel">
      <div className="ci-acts">
        {actions.map((a) => (
          <button key={a.t} onClick={a.go}><span className="ic"><a.icon size={24} /></span><span className="t">{a.t}</span><span className="s">{a.s}</span></button>
        ))}
      </div>
    </PetHero>
  );
}

function IdleHome({ inCar = false }: { inCar?: boolean }) {
  const wideNow = useWide();
  const { pets, trips, tripPets, settings } = useStore();
  const [petIdx, setPetIdx] = useState(0);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const pet = pets[Math.min(petIdx, pets.length - 1)];
  const stats = realStats(trips, pet?.id, tripPets);
  const completed = trips.filter((t) => t.status === 'ended');
  const realDone = completed.filter((t) => !t.isDemo);
  const lastDone = completed[0];
  const showCompleted = !!lastDone && Date.now() - (lastDone.endTime ?? lastDone.startTime) < COMPLETED_HOME_DAYS * 86400_000;
  const regions = new Set(realDone.map((t) => regionShort(t.endLocation)).filter((r) => r && r !== '알 수 없음'));
  const [bgOpen, setBgOpen] = useState(false);
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const name = pet ? callName(pet.name) : '우리 강아지';
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '편안한 저녁이에요';
  const safetyDone = settings.safetyChecks.length;

  return (
    <div className="screen">
      <header className="home-greet">
        <div className="grow">
          <p className="t-cap">{pets.length > 1 ? `반려견 ${pets.length}마리 · ${pets.map((p) => p.name).join(', ')}` : pet ? [pet.name, pet.ageYears != null ? `${pet.ageYears}살` : null, SIZE_LABEL[pet.size]].filter(Boolean).join(' · ') : '멍로드'}</p>
          <h1 className="h-lg" style={{ fontSize: 22 }}>{settings.userName ? `${settings.userName}님, ` : ''}{greet},<br />오늘은 어디로 갈까요?</h1>
        </div>
        {pets.length > 1 && (
          <button className="chip" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }} onClick={() => setPetIdx((petIdx + 1) % pets.length)} aria-label="통계를 볼 반려견 바꾸기">{pet?.name} 통계</button>
        )}
        <button className="round-btn" aria-label="설정" onClick={() => navigate('/my')}><Bell size={20} /></button>
      </header>


      <div className="stack" style={{ marginTop: 20 }}>
        {/* 반려견 개인화 영역(차량 화면에서는 왼쪽 패널에 있으므로 생략) */}
        {!inCar && <PetHero pets={pets} variant="card" />}

        {/* 핵심 CTA: 새 여행 시작 — 반려견 사진 대신 여행 배경(별도 관리) */}
        <section className="hero-cta" aria-label="새 여행 시작">
          <div className="ph scene">
            <TripBackground />
            <button className="bg-btn" onClick={() => setBgOpen(true)} disabled={live.driving} aria-label="여행 배경 변경"><ImageIcon size={14} />배경 변경</button>
            <button className="badge photo" style={{ border: 0, cursor: 'pointer', height: 28, padding: '0 10px' }} onClick={() => setSafetyOpen(true)}>
              <ShieldCheck size={14} />출발 전 안전 체크 {safetyDone}/{SAFETY_ITEMS.length}
            </button>
          </div>
          <div className="body">
            <div>
              <p className="h-md">새 여행 시작</p>
              <p className="t-cap" style={{ marginTop: 4 }}>목적지를 정하면 {name} 맞춤 휴식 계획을 짜드려요.</p>
            </div>
            {pet ? (
              <>
                <DestinationQuick disabled={!pet} />
                {settings.demoMode && (
                  <button className="navi-suggest" onClick={() => navigate('/trip/setup?dest=강릉&from=navi')}>
                    <Navigation size={18} />
                    <span className="grow">차량 내비 목적지 ‘강릉 경포해변’ 불러오기</span>
                    <span className="badge sample">데모</span>
                  </button>
                )}
                <button className="btn primary block xl" onClick={() => navigate('/trip/setup')}>여행 시작하기</button>
                {!wideNow && <button className="link" style={{ justifySelf: 'center', fontSize: 13 }} onClick={openCarPreview}><MonitorSmartphone size={15} style={{ verticalAlign: -3, marginRight: 4 }} />차량 화면(1600×900)으로 미리보기</button>}
              </>
            ) : (
              <button className="btn primary block xl" onClick={() => navigate('/pet/new')}>반려견 먼저 등록하기</button>
            )}
          </div>
        </section>

        {showCompleted && <CompletedHero trip={lastDone} />}

        {/* 최근 여행: 사진 중심 카드 */}
        <section aria-label="최근 여행">
          <SectionHeader title="최근 여행" action={completed.length ? '전체 앨범' : undefined} onAction={() => navigate('/album')} />
          {completed.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <p style={{ fontWeight: 600 }}>아직 완료한 여행이 없어요</p>
              <p className="t-cap mt-8">첫 여행을 마치면 사진과 함께 이곳에 쌓여요.</p>
            </div>
          ) : (
            <div className="h-scroll">
              {completed.slice(0, 8).map((t) => <TripPhotoCard key={t.id} trip={t} meta={`${formatShortDate(t.startTime)} · ${formatKm(t.totalDistanceKm)}`} />)}
            </div>
          )}
        </section>

        {/* 누적 기록: 작고 정돈된 통계 (실제 여행만) */}
        <section aria-label="나의 여행 기록">
          <SectionHeader title="나의 여행 기록" aside={<span className="t-cap" style={{ fontSize: 12 }}>실제 여행만 집계 · 데모 제외</span>} />
          <StatStrip items={[{ value: String(stats.count), unit: '회', label: '여행' }, { value: formatKmNumber(stats.km), unit: 'km', label: '누적 거리' }, { value: String(regions.size), unit: '곳', label: '방문 지역' }]} />
        </section>

        {/* 주변 반려견 동반 장소 */}
        <section aria-label="주변 반려견 동반 장소">
          <SectionHeader title="근처 반려견 동반 장소" action="지도로 보기" onAction={() => navigate('/explore')} />
          <div className="chips scroll">
            {[['전체', '/explore'], ['카페', '/explore?cat=cafe'], ['산책로', '/explore?cat=park'], ['식당', '/explore?cat=restaurant'], ['휴게소', '/explore?cat=restArea'], ['병원', '/explore?cat=vet']].map(([l, to], i) => (
              <button key={to} className={`chip ${i === 0 ? 'on' : ''}`} onClick={() => navigate(to)}>{l}</button>
            ))}
          </div>
          <div className="list-card mt-12">
            {RECOMMENDED.map((r) => (
              <PlaceRow key={r.region} onClick={() => navigate(`/explore?region=${encodeURIComponent(r.region)}`)}
                thumb={<span className="icon-tile" style={{ width: 56, height: 56, borderRadius: 14 }}><r.icon size={24} /></span>}
                title={`${r.region} 주변 동반 장소`} meta={r.note} />
            ))}
          </div>
          <p className="t-cap mt-8" style={{ fontSize: 12 }}>업체가 확인한 곳만 ‘동반 가능’으로 표시해요. 추천 지역은 예시 큐레이션이에요.</p>
        </section>

        {/* 발도장 지도 진입 */}
        <button className="pawmap-entry" onClick={() => navigate('/pawmap')} aria-label="발도장 지도 열기">
          <div className="grow" style={{ display: 'grid', gap: 10 }}>
            <p className="h-md row" style={{ gap: 6 }}><PawGlyph size={20} color="var(--primary)" />발도장 지도</p>
            <p className="t-cap">{regions.size ? `${regions.size}개 지역에 ${name}의 발도장이 찍혔어요` : '여행을 마치면 도착한 지역에 발도장이 찍혀요'}</p>
            {regions.size > 0 && <div className="chips" style={{ gap: 6 }}>{[...regions].slice(0, 3).map((r) => <span key={r} className="badge">{r}</span>)}</div>}
          </div>
          <div className="mini">
            <MapView fit="korea" height={150} ariaLabel="발도장 미니 지도" markers={aggregatePaws(realDone, []).map((p) => ({ id: p.region.id, point: p.region, kind: 'paw' as const, count: p.tripIds.size }))} />
          </div>
        </button>

        {settings.demoMode && (
          <details className="card" style={{ background: 'var(--bg)' }}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}><span className="badge sample" style={{ marginRight: 6 }}>데모</span>서울 → 강릉 여행 체험 방법</summary>
            <ol className="t-sub" style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.75 }}>
              <li>‘여행 시작하기’ → 시뮬레이션 속도(60~300배속) → 출발</li>
              <li>휴식 알림·휴식 기록 → 강릉 근처에서 <b>‘목적지 도착’</b> (여행은 계속돼요)</li>
              <li>여행지에서 사진·장소·메모 기록 → ‘돌아가는 길 기록 시작’ → 서울 도착 후 ‘여행 완료’</li>
            </ol>
            <p className="t-cap mt-8">PC에서는 창 너비 900px 이상이면 차량용 가로 레이아웃으로 바뀌어요. 데모 기록은 실제 통계에 포함되지 않아요.</p>
          </details>
        )}
      </div>

      <Sheet open={safetyOpen} onClose={() => setSafetyOpen(false)} labelledBy="safety-title">
        <SafetyCheck />
      </Sheet>
      <BackgroundSheet open={bgOpen && !live.driving} onClose={() => setBgOpen(false)} />
    </div>
  );
}

function formatKmNumber(km: number) {
  return km >= 100 ? Math.round(km).toLocaleString('ko-KR') : km.toFixed(1).replace(/\.0$/, '');
}

/** 최근 완료한 여행: AI 여행 일기 · 앨범 · 공유 바로가기 */
function CompletedHero({ trip }: { trip: Trip }) {
  return (
    <section className="card" aria-label="최근 완료한 여행" style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', flex: 'none' }}>
          {trip.coverPhotoUri ? <img src={trip.coverPhotoUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PhotoFallback size={28} />}
        </div>
        <div className="grow">
          <div className="row" style={{ gap: 6 }}><span className="badge">여행 완료</span>{trip.isDemo && <span className="badge sample">데모</span>}</div>
          <p style={{ fontWeight: 600, marginTop: 6 }} className="ellipsis">{trip.title}</p>
          <p className="t-cap">{formatKoreanDate(trip.startTime)} · {formatKm(trip.totalDistanceKm)} · 주행 {formatDuration(trip.drivingDurationSeconds)}</p>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn secondary sm" onClick={() => navigate(`/album/${trip.id}/diary`)}><Sparkles size={16} />AI 여행 일기</button>
        <button className="btn ghost sm" onClick={() => navigate(`/album/${trip.id}`)}><BookImage size={16} />앨범</button>
        <button className="btn ghost sm" onClick={() => navigate(`/album/${trip.id}?share=1`)}><Share2 size={16} />공유</button>
      </div>
      <button className="link" style={{ justifySelf: 'start', padding: 0 }} onClick={() => navigate(trip.isDemo ? '/pawmap?src=demo' : '/pawmap')}>발도장 지도에서 보기 <ChevronRight size={14} /></button>
    </section>
  );
}

/** 여행 전 홈: 목적지 바로 설정 → 여행 시작 화면으로 전달 */
function DestinationQuick({ disabled }: { disabled: boolean }) {
  const [q, setQ] = useState('');
  const matches = q.trim() ? REGIONS.filter((r) => r.name.includes(q.trim()) || r.province.includes(q.trim())).slice(0, 5) : [];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="field-soft">
        <Search size={20} />
        <input className="input" disabled={disabled} placeholder="어디로 갈까요?  예: 강릉, 양평" value={q} onChange={(e) => setQ(e.target.value)} aria-label="여행 목적지" />
      </div>
      <div className="chips scroll" style={{ margin: '0 -20px', padding: '0 20px 2px' }}>
        {(matches.length ? matches.map((r) => ({ key: r.id, label: `${r.province} ${r.name}`, to: r.name })) : RECOMMENDED.map((r) => ({ key: r.region, label: r.region, to: r.region })))
          .map((m) => <button key={m.key} className="chip" disabled={disabled} onClick={() => navigate(`/trip/setup?dest=${encodeURIComponent(m.to)}`)}>{m.label}</button>)}
      </div>
    </div>
  );
}
