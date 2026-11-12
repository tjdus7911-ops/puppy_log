// 차량 메인 홈(프리미엄 차량 UI): 중앙 히어로(홈 배경 사진/일러스트 + 환영 문구) + 나의 반려견 / 현재 여행 상태,
// 오른쪽 '새 여행 시작' + 2×2 퀵 메뉴. 차량 OS 상태바는 앱에서 다시 그리지 않습니다.
// 메뉴 역할: 왼쪽 '여행' = 여행 허브(현재 상태·여행 기능), '여행 계획' = 출발 전 목적지·경로·휴식 계획, '새 여행 시작' = 새 여행 생성
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, CarFront, ChevronRight, Clock3, Image as ImageIcon, MapPin, PawPrint, Plus } from 'lucide-react';
import { CtaRoad, IllustMountains, IllustPaws, IllustPhotos, IllustTrees } from './HomeIllust';
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
    <div className="ch3">
      <section className="ch3-hero">
        <div className="ch3-bg"><TripBackground /></div>
        <div className="ch3-shade" aria-hidden="true" />
        <button className="ch3-pill" disabled={live.driving} onClick={() => setBgOpen(true)} aria-label="홈 배경 변경" title={live.driving ? '주행 중에는 바꿀 수 없어요' : '홈 배경 변경 · 이 기기에만 저장'}><ImageIcon /><span>배경 변경</span></button>
        <div className="ch3-copy">
          <p className="l1"><span className="lead">{lead}</span><br />특별한 드라이브</p>
          <p className="l2">멍로드<PawPrint className="paw" /></p>
          <svg className="ch3-smile" viewBox="0 0 68 12" aria-hidden="true"><path d="M3 4 Q34 13 65 4" stroke="url(#ch3sm)" strokeWidth="5" strokeLinecap="round" fill="none" /><defs><linearGradient id="ch3sm" x1="0" x2="1"><stop offset="0" stopColor="#3f7bea" /><stop offset="1" stopColor="#6aa2fb" /></linearGradient></defs></svg>
          <p className="l3">함께하는 이동이<br />더 특별한 여행이 돼요.</p>
        </div>
        <div className="ch3-cards">
          <button className="ch3-card a" onClick={() => (pet ? navigate(`/pet/${pet.id}`) : needPet())} aria-label={pet ? `${pet.name} 프로필 보기` : '반려견 등록하기'}>
            <span className="k">나의 반려견</span>
            <span className="row">
              {pet ? <span className="av"><PetAvatar uri={pet.photoUri} size={76} /></span> : <span className="ic"><Plus /></span>}
              <span className="tx"><b>{pet ? pet.name : '반려견 등록하기'}{pet && pets.length > 1 && <em> 외 {pets.length - 1}마리</em>}</b><small>{pet ? petLine(pet) : '함께 떠날 친구를 알려 주세요'}</small></span>
              <ChevronRight className="chev" />
            </span>
          </button>
          <span className="ch3-div" aria-hidden="true" />
          <button className="ch3-card b" onClick={tripCard ? tripCard.go : () => navigate('/trip')} aria-label="현재 여행 상태">
            <span className="k">진행 중인 여행</span>
            <span className="row">
              <span className="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 5.2A2.4 2.4 0 0 1 8.8 3.8h6.4c.95 0 1.8.56 2.2 1.42L19 8.9c1.17.36 2 1.45 2 2.7V16a1 1 0 0 1-1 1h-.6v1.4a1.3 1.3 0 0 1-2.6 0V17H7.2v1.4a1.3 1.3 0 0 1-2.6 0V17H4a1 1 0 0 1-1-1v-4.4c0-1.25.83-2.34 2-2.7Z" /><path fill="#e3e9fa" d="M7.5 6.1c.12-.27.4-.45.7-.45h7.6c.3 0 .58.18.7.45l1.2 2.75H6.3Z" /><circle cx="7" cy="13" r="1.5" fill="#e3e9fa" /><circle cx="17" cy="13" r="1.5" fill="#e3e9fa" /><rect x="10" y="12.3" width="4" height="1.4" rx=".7" fill="#e3e9fa" /></svg></span>
              <span className="tx"><b>{tripCard ? tripCard.title : '진행 중인 여행이 없어요'}</b><small>{tripCard ? tripCard.sub : lastDone ? `최근: ${lastDone.title}` : '새 여행을 시작해 보세요'}</small></span>
              <ChevronRight className="chev" />
            </span>
          </button>
        </div>
      </section>

      <aside className="ch3-side">
        <button className="ch3-cta" onClick={() => (tripCard ? tripCard.go() : pet ? navigate('/trip/setup') : needPet())}>
          <CtaRoad />
          <CarFront className="car" /><span>{tripCard ? (live.phase === 'at-destination' ? '여행지 활동 이어가기' : '주행 화면으로') : '새 여행 시작'}</span><ChevronRight className="chev" />
        </button>
        <div className="ch3-grid">
          {menu.map((m) => (
            <button key={m.t} onClick={m.go}>
              <m.icon className="qi" strokeWidth={2.3} />
              <b>{m.t}</b><span>({m.s})</span>
              <span className="il">{m.deco === 'plan' ? <IllustMountains /> : m.deco === 'pet' ? <IllustPaws /> : m.deco === 'record' ? <IllustPhotos /> : <IllustTrees />}</span>
            </button>
          ))}
        </div>
      </aside>
      <BackgroundSheet open={bgOpen && !live.driving} onClose={() => setBgOpen(false)} />
    </div>
  );
}
