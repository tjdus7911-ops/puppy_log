// 차량 메인 홈(프리미엄 차량 UI): 중앙 히어로(홈 배경 사진/일러스트 + 환영 문구) + 나의 반려견 / 현재 여행 상태,
// 오른쪽 '새 여행 시작' + 2×2 퀵 메뉴. 차량 OS 상태바는 앱에서 다시 그리지 않습니다.
// 메뉴 역할: 왼쪽 '여행' = 여행 허브(현재 상태·여행 기능), '여행 계획' = 출발 전 목적지·경로·휴식 계획, '새 여행 시작' = 새 여행 생성
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, Car, ChevronRight, Clock3, Image as ImageIcon, MapPin, PawPrint, Plus } from 'lucide-react';
import { useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { TripController } from '../../trip/TripController';
import { routeSnapshot } from '../../nav/NavigationProvider';
import { ageFrom, formatDuration } from '../../domain/format';
import { PET_SIZE_LABEL, type Pet } from '../../domain/models';
import { mainPetOf, welcomeLead } from '../../domain/tripText';
import { HomeBackground } from '../../app/homeBg';
import { PetAvatar } from '../../ui/Art';
import { TripBackground, BackgroundSheet } from './TripBackground';

export function petLine(p: Pet) {
  return [p.breed || PET_SIZE_LABEL[p.size], ageFrom(p.birthDate, p.ageYears)].filter(Boolean).join(' · ');
}

/** 퀵 메뉴 카드 하단의 은은한 라인 일러스트(시선 분산 없도록 연한 블루) */
function Deco({ kind }: { kind: 'plan' | 'pet' | 'record' | 'place' }) {
  const c = { stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="qm-deco" viewBox="0 0 140 70" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
      {kind === 'plan' && <><path d="M0 70 L0 62 L34 34 L52 48 L78 18 L104 44 L118 34 L140 52 L140 70 Z" fill="currentColor" opacity=".12" /><path d="M0 62 L34 34 L52 48 L78 18 L104 44 L118 34 L140 52" {...c} /></>}
      {kind === 'pet' && <g fill="currentColor"><g opacity=".35"><ellipse cx="96" cy="50" rx="16" ry="13" /><ellipse cx="76" cy="30" rx="6" ry="8" /><ellipse cx="90" cy="20" rx="6" ry="8" /><ellipse cx="106" cy="20" rx="6" ry="8" /><ellipse cx="119" cy="31" rx="6" ry="8" /></g><g opacity=".18"><ellipse cx="40" cy="58" rx="9" ry="7" /><ellipse cx="30" cy="46" rx="3.5" ry="4.5" /><ellipse cx="40" cy="42" rx="3.5" ry="4.5" /><ellipse cx="50" cy="46" rx="3.5" ry="4.5" /></g></g>}
      {kind === 'record' && <><rect x="58" y="16" width="58" height="44" rx="6" transform="rotate(-8 87 38)" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" /><rect x="74" y="22" width="58" height="44" rx="6" transform="rotate(6 103 44)" fill="#fff" stroke="currentColor" strokeWidth="2" /><path d="M82 58 L96 44 L106 54 L114 47 L126 58" {...c} /></>}
      {kind === 'place' && <><path d="M0 64 Q40 44 80 58 T140 50 L140 70 L0 70 Z" fill="currentColor" opacity=".12" /><path d="M104 56 L104 30 M96 40 L104 22 L112 40 Z M122 58 L122 36 M115 46 L122 28 L129 46 Z" {...c} /><path d="M84 58 L84 42 M79 48 L84 36 L89 48 Z" {...c} /></>}
    </svg>
  );
}

export default function CarHome() {
  const { pets, trips, settings } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [bgOpen, setBgOpen] = useState(false);
  useEffect(() => { void HomeBackground.load(); }, []);
  // 대표 반려견: 설정값(내 반려견 화면에서 지정) → 없으면 첫 번째. 이름이 바뀌면 store 갱신으로 즉시 반영
  const pet = mainPetOf(pets, settings.mainPetId);
  const lead = welcomeLead(pet?.name);

  // 현재 여행 상태 카드
  let tripCard: { title: string; sub: string; go: () => void } | null = null;
  if (live.active && live.trip) {
    const e = live.engine;
    const atDest = live.phase === 'at-destination';
    const isReturn = live.legKind === 'return';
    const r = e && !atDest ? routeSnapshot({ isDemo: live.kind === 'demo', direction: isReturn ? 'return' : 'outbound', destinationName: live.trip.destinationName, destination: live.trip.destination, current: live.position, drivenKm: e.distanceKm, drivingSec: e.drivingSec }) : null;
    const state = atDest ? '여행지 활동 중' : live.arrived ? '목적지 근처 도착' : e?.status === 'resting' ? '휴식 중' : isReturn ? '돌아가는 중' : '이동 중';
    tripCard = {
      title: `${live.trip.destinationName ?? '목적지 미정'} 여행`,
      sub: [state, r?.etaMinutes != null ? `약 ${formatDuration(r.etaMinutes * 60)} 남음${r.etaEstimated ? '(예상)' : ''}` : null].filter(Boolean).join(' · '),
      go: () => navigate(atDest ? '/trip/destination' : '/trip/live'),
    };
  }
  const lastDone = trips.find((t) => t.status === 'ended');
  const needPet = () => navigate('/pet/new?first=1');

  const menu: { icon: typeof MapPin; t: string; s: string; deco: 'plan' | 'pet' | 'record' | 'place'; go: () => void }[] = [
    { icon: MapPin, t: '여행 계획', s: '목적지 · 경로', deco: 'plan', go: () => (pet ? navigate('/trip/setup?step=plan') : needPet()) },
    { icon: PawPrint, t: '내 반려견', s: '프로필 · 설정', deco: 'pet', go: () => navigate('/pets') },
    { icon: Clock3, t: '여행 기록', s: '이동 · 휴식 · 방문', deco: 'record', go: () => navigate('/album') },
    { icon: BookOpen, t: '추천 장소', s: '카페 · 공원 · 숙소', deco: 'place', go: () => navigate('/explore') },
  ];

  return (
    <div className="ch v2">
      <section className="ch-hero">
        <div className="ch-bg"><TripBackground /></div>
        <div className="ch-shade" aria-hidden="true" />
        <button className="ch-bgbtn" disabled={live.driving} onClick={() => setBgOpen(true)} aria-label="홈 배경 변경" title={live.driving ? '주행 중에는 바꿀 수 없어요' : '홈 배경 변경 · 이 기기에만 저장'}><ImageIcon size={16} />배경 변경</button>
        <div className="ch-copy">
          <p className="l1"><span className="lead">{lead}</span><br />특별한 드라이브</p>
          <p className="l2">멍로드 <PawPrint size={34} /></p>
          <span className="ch-accent" aria-hidden="true" />
          <p className="l3">함께하는 이동이<br />더 특별한 여행이 돼요.</p>
        </div>
        <div className="ch-cards">
          <button className="ch-card" onClick={() => (pet ? navigate(`/pet/${pet.id}`) : needPet())} aria-label={pet ? `${pet.name} 프로필 보기` : '반려견 등록하기'}>
            <p className="k">나의 반려견</p>
            <div className="row">
              {pet ? <span className="av"><PetAvatar uri={pet.photoUri} size={60} /></span> : <span className="ch-empty"><Plus size={24} /></span>}
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="t ellipsis">{pet ? pet.name : '반려견 등록하기'}{pet && pets.length > 1 && <small> 외 {pets.length - 1}마리</small>}</p>
                <p className="s ellipsis">{pet ? petLine(pet) : '함께 떠날 친구를 알려 주세요'}</p>
              </div>
              <ChevronRight size={24} />
            </div>
          </button>
          <button className="ch-card" onClick={tripCard ? tripCard.go : () => navigate('/trip')} aria-label="현재 여행 상태">
            <p className="k">{tripCard ? '진행 중인 여행' : '현재 여행 상태'}</p>
            <div className="row">
              <span className="ch-empty"><Car size={24} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="t ellipsis">{tripCard ? tripCard.title : '진행 중인 여행이 없어요'}</p>
                <p className="s ellipsis">{tripCard ? tripCard.sub : lastDone ? `최근: ${lastDone.title}` : '새 여행을 시작해 보세요'}</p>
              </div>
              <ChevronRight size={24} />
            </div>
          </button>
        </div>
      </section>

      <aside className="ch-side">
        <button className="ch-start" onClick={() => (tripCard ? tripCard.go() : pet ? navigate('/trip/setup') : needPet())}>
          <svg className="road" viewBox="0 0 200 96" preserveAspectRatio="xMaxYMax meet" aria-hidden="true"><path d="M110 96 C140 60 160 40 200 30" stroke="rgba(255,255,255,.18)" strokeWidth="22" fill="none" /><path d="M110 96 C140 60 160 40 200 30" stroke="rgba(255,255,255,.45)" strokeWidth="2" strokeDasharray="8 8" fill="none" /></svg>
          <Car size={32} /><span>{tripCard ? (live.phase === 'at-destination' ? '여행지 활동 이어가기' : '주행 화면으로') : '새 여행 시작'}</span><ChevronRight size={28} />
        </button>
        <div className="ch-grid">
          {menu.map((m) => (
            <button key={m.t} onClick={m.go}>
              <m.icon size={36} strokeWidth={1.9} />
              <b>{m.t}</b><span>({m.s})</span>
              <Deco kind={m.deco} />
            </button>
          ))}
        </div>
      </aside>
      <BackgroundSheet open={bgOpen && !live.driving} onClose={() => setBgOpen(false)} />
    </div>
  );
}
