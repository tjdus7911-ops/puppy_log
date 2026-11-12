// 상황별 홈: 여행 단계에 따라 다른 홈을 보여줍니다.
//  - 주행 중(이동 중·복귀 중)  → 주행 대시보드(TripLive)
//  - 여행지 활동 중            → Destination
//  - 최근 7일 안에 완료한 여행  → 여행 완료 홈(+ 일반 홈 항목)
//  - 그 외                     → 일반 홈
import { useState, useSyncExternalStore } from 'react';
import { petInterval } from '../domain/restCare';
import { Bell, BookImage, Camera, Car, Image as ImageIcon, MapPinned, MonitorSmartphone, ChevronRight, Coffee, Navigation, PawPrint, Plus, Share2, ShieldCheck, Sparkles, Trees, Users, Waves } from 'lucide-react';
import { SAFETY_ITEMS } from '../domain/plan';
import { realStats, useStore } from '../app/store';
import { navigate } from '../app/router';
import { formatDuration, formatKm, formatKoreanDate, formatShortDate } from '../domain/format';
import { callName, mainPetOf } from '../domain/tripText';
import { useCommunity } from '../app/community';
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
import { PetPhoto } from './home/PetHero';
import { InstallCard } from '../pwa/InstallCard';
import CarHome from './home/CarHome';
import { BackgroundSheet, TripBackground } from './home/TripBackground';
import { SafetyCheck } from './SafetyCheck';
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
  // 휴대폰: 여행지 활동 중이면 여행지 기록 화면, 그 외(주행 중 포함)는 일반 홈 + 진행 중 여행 카드
  if (live.active && live.phase === 'at-destination') return <Destination />;
  return <IdleWrap />;
}

/** 휴대폰 홈(대기): 휴대폰은 여행 기록·커뮤니티·여행지 기록 담당. 여행 시작과 주행은 차량 앱에서 */
function IdleWrap() {
  return <IdleHome />;
}

function IdleHome() {
  const { pets, trips, tripPets, settings } = useStore();
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const main = mainPetOf(pets, settings.mainPetId) ?? pets[0];
  const stats = realStats(trips, main?.id, tripPets);
  const completed = trips.filter((t) => t.status === 'ended');
  const realDone = completed.filter((t) => !t.isDemo);
  const lastDone = completed[0];
  const showCompleted = !!lastDone && Date.now() - (lastDone.endTime ?? lastDone.startTime) < COMPLETED_HOME_DAYS * 86400_000;
  const regions = new Set(realDone.map((t) => regionShort(t.endLocation)).filter((r) => r && r !== '알 수 없음'));
  const name = main ? callName(main.name) : '우리 강아지';
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 11 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '편안한 저녁이에요';
  const dateLabel = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const safetyDone = settings.safetyChecks.length;
  const community = useCommunity();
  const posts = community.posts.slice(0, 4);
  const others = pets.filter((p) => p.id !== main?.id);

  const quick = [
    // Figma M1: 여행 기록 · 커뮤니티 · 발도장 · 내 반려견
    { icon: BookImage, t: '여행 기록', s: completed.length ? `${completed.length}개 여행` : '앨범 · 일기', go: () => navigate('/album'), tone: 'blue' },
    { icon: Users, t: '커뮤니티', s: '여행 후기', go: () => navigate('/community'), tone: 'violet' },
    { icon: MapPinned, t: '발도장', s: regions.size ? `${regions.size}개 지역` : '지역 지도', go: () => navigate('/pawmap'), tone: 'mint' },
    { icon: PawPrint, t: '내 반려견', s: '프로필 · 여행 케어', go: () => navigate('/pets'), tone: 'amber' },
  ] as const;

  return (
    <div className="screen mh">
      <header className="mh-head">
        <div className="grow">
          <p className="mh-date">{dateLabel}</p>
          <h1>{settings.userName ? `${settings.userName}님, ` : ''}{greet}</h1>
        </div>
        <button className="round-btn" aria-label="설정" onClick={() => navigate('/my')}><Bell size={20} /></button>
      </header>

      {/* 히어로: 여행 배경 사진 위에 대표 반려견과 개인화 문구(글자와 사진이 겹치지 않도록 하단 그라데이션 위에 배치) */}
      <section className="mh-hero" aria-label="대표 반려견과 다음 여행">
        <div className="mh-bg"><TripBackground /></div>
        <div className="mh-top">
          <span className="mh-pill"><PawGlyph size={13} color="currentColor" />{live.active ? '여행 중' : '다음 드라이브 대기 중'}</span>
          <button className="mh-icon" onClick={() => setBgOpen(true)} aria-label="여행 배경 변경"><ImageIcon size={16} /></button>
        </div>
        <div className="mh-copy">
          {main ? (
            <>
              <div className="mh-pets">
                <button className="mh-av main" onClick={() => navigate(`/pet/${main.id}`)} aria-label={`${main.name} 프로필`}><PetPhoto pet={main} /></button>
                {others.slice(0, 2).map((p) => <button key={p.id} className="mh-av" onClick={() => navigate(`/pet/${p.id}`)} aria-label={`${p.name} 프로필`}><PetPhoto pet={p} /></button>)}
                {others.length > 2 && <span className="mh-av more">+{others.length - 2}</span>}
                <button className="mh-av add" onClick={() => navigate('/pet/new')} aria-label="반려견 추가"><Plus size={18} /></button>
              </div>
              <h2>반려견과 떠나는<br />특별한 드라이브</h2>
              <p className="mh-brand">멍로드 🐾</p>
              <p>{main.name} · {SIZE_LABEL[main.size]} · 휴식 {petInterval(main).minutes}분 간격{others.length ? ` · 외 ${others.length}마리` : ''}</p>
            </>
          ) : (
            <>
              <h2>함께 떠날 반려견을<br />등록해 주세요</h2>
              <button className="btn primary mt-12" onClick={() => navigate('/pet/new')}><Plus size={18} />반려견 등록하기</button>
            </>
          )}
        </div>
      </section>

      {/* 진행 중인 여행(차량에서 기록 중): 상태 카드 → 자세히 보기 */}
      {live.active && live.driving && live.trip && (
        <button className="mh-live-card" onClick={() => navigate('/trip/live')} data-testid="home-live-trip">
          <span className="pill"><i />{live.arrived ? (live.legKind === 'return' ? '집 근처에 도착' : '여행지 도착') : '차량에서 기록 중'}{live.trip.isDemo ? ' · 데모' : ''}</span>
          <b>{live.petNames.length ? `${live.petNames.map(callName).join(' · ')}와 ` : ''}{live.trip.destinationName ?? '목적지'} 여행</b>
          <small>{live.legKind === 'return' ? '집으로 돌아가는 중 · ' : ''}주행 {formatDuration(live.engine?.drivingSec ?? 0)} · {formatKm(live.trip.totalDistanceKm)}</small>
          <small className="soft">주행·휴식 안내는 차량 화면에서 해요</small>
        </button>
      )}
      {live.active && live.driving && live.trip && live.legKind !== 'return' && (
        <section className="card mh-todo" aria-label="다음 할 일">
          <p className="t-cap">다음 할 일</p>
          <p className="t">{live.arrived ? '여행지에 도착했어요. 사진을 남겨 보세요' : '도착하면 여행지 사진을 남겨 보세요'}</p>
          <button className="btn primary block" onClick={() => navigate('/trip/live')}><Camera size={18} />여행지 기록 시작</button>
        </section>
      )}

      {/* 다음 여행: 여행은 차량에서 시작(휴대폰은 준비물 체크·데모 진입만) */}
      {main && !live.active && (
        <section className="mh-next">
          <span className="ic"><Car size={22} /></span>
          <div className="grow">
            <p className="t">여행은 차량에서 시작해요</p>
            <p className="s">출발하면 자동 기록, 도착하면 여기서 사진·메모</p>
          </div>
          <button className="mh-check" onClick={() => setSafetyOpen(true)} aria-label="출발 전 준비물 체크"><ShieldCheck size={16} />{safetyDone}/{SAFETY_ITEMS.length}</button>
        </section>
      )}
      {main && settings.demoMode && !live.active && (
        <button className="navi-suggest" onClick={() => navigate('/trip/setup?dest=강릉&from=navi')}>
          <Navigation size={18} /><span className="grow">강릉 경포해변 여행 체험하기</span><span className="badge sample">데모</span>
        </button>
      )}

      <InstallCard compact />

      <nav className="mh-quick" aria-label="바로가기">
        {quick.map((q) => (
          <button key={q.t} className={`mh-q ${q.tone}`} onClick={q.go}>
            <span className="ic"><q.icon size={22} /></span><b>{q.t}</b><small>{q.s}</small>
          </button>
        ))}
      </nav>

      {showCompleted && <CompletedHero trip={lastDone} />}

      <section aria-label="최근 여행">
        <SectionHeader title="최근 여행" action={completed.length ? '전체 보기' : undefined} onAction={() => navigate('/album')} />
        {completed.length === 0 ? (
          <div className="mh-empty">
            <p className="t">{name}와의 첫 여행을 기다리고 있어요</p>
            <ol>
              <li><span><Car size={16} /></span>차량에서 출발하면 자동으로 기록해요</li>
              <li><span><Camera size={16} /></span>여행지에서는 휴대폰으로 사진·메모를 남겨요</li>
              <li><span><Sparkles size={16} /></span>집에 오면 AI 여행 일기가 만들어져요</li>
            </ol>
          </div>
        ) : (
          <div className="h-scroll">
            {completed.slice(0, 8).map((t) => <TripPhotoCard key={t.id} trip={t} meta={`${formatShortDate(t.startTime)} · ${formatKm(t.totalDistanceKm)}`} />)}
          </div>
        )}
      </section>

      <section aria-label="나의 여행 기록">
        <SectionHeader title={`${name}의 여행 기록`} aside={<span className="t-cap" style={{ fontSize: 12 }}>실제 여행만 · 데모 제외</span>} />
        <StatStrip items={[{ value: String(stats.count), unit: '회', label: '여행' }, { value: formatKmNumber(stats.km), unit: 'km', label: '누적 거리' }, { value: String(regions.size), unit: '곳', label: '방문 지역' }]} />
      </section>

      {posts.length > 0 && (
        <section aria-label="커뮤니티">
          <SectionHeader title="다른 보호자들의 여행" action="커뮤니티" onAction={() => navigate('/community')} />
          <div className="h-scroll mh-posts">
            {posts.map((p) => (
              <button key={p.id} className="mh-post" onClick={() => navigate(`/community/post/${p.id}`)}>
                <span className="cover">
                  {p.media[0]?.src ? <img src={p.media[0].src} alt="" /> : <span className="ph"><PawGlyph size={30} color="rgba(255,255,255,.9)" /></span>}
                  {p.isExample && <em>예시</em>}
                </span>
                <b className="ellipsis2">{p.title}</b>
                <small>{p.authorPetName ?? p.authorName}{p.place ? ` · ${p.place.name}` : ''} · ♥ {p.likeCount}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label="주변 반려견 동반 장소">
        <SectionHeader title="반려견과 가기 좋은 곳" action="지도로 보기" onAction={() => navigate('/explore')} />
        <div className="list-card">
          {RECOMMENDED.map((r) => (
            <PlaceRow key={r.region} onClick={() => navigate(`/explore?region=${encodeURIComponent(r.region)}`)}
              thumb={<span className="icon-tile" style={{ width: 52, height: 52, borderRadius: 14 }}><r.icon size={22} /></span>}
              title={`${r.region} 주변 동반 장소`} meta={r.note} />
          ))}
        </div>
        <p className="t-cap mt-8" style={{ fontSize: 12 }}>업체가 확인한 곳만 ‘동반 가능’으로 표시해요. 추천 지역은 예시 큐레이션이에요.</p>
      </section>

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
            <li>‘강릉 경포해변 여행 체험하기’ → 차량 화면에서 출발(배속 선택)</li>
            <li>차량 화면에서 휴식 알림·탑승 안전 안내 → 강릉 도착</li>
            <li>휴대폰에서 사진·장소·메모 기록 → 차량 화면에서 ‘집으로 출발’ → 여행 완료</li>
          </ol>
          <p className="t-cap mt-8">PC에서는 창 너비 900px 이상이면 차량 화면으로 바뀌어요. 데모 기록은 실제 통계에 포함되지 않아요.</p>
          <button className="link mt-8" onClick={openCarPreview}><MonitorSmartphone size={15} style={{ verticalAlign: -3, marginRight: 4 }} />차량 화면(1600×900)으로 보기</button>
        </details>
      )}

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
