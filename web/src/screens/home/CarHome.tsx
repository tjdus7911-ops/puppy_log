// 차량 메인 홈(시안 1 상단): 중앙 여행 히어로 + 나의 반려견 / 진행 중인 여행, 오른쪽 '새 여행 시작' + 2×2 메뉴
// 차량 OS 상태바는 앱에서 다시 그리지 않습니다.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, Car, ChevronRight, Clock3, Image as ImageIcon, MapPin, PawPrint, Plus } from 'lucide-react';
import { useStore } from '../../app/store';
import { navigate } from '../../app/router';
import { TripController } from '../../trip/TripController';
import { routeSnapshot } from '../../nav/NavigationProvider';
import { ageFrom, formatDuration } from '../../domain/format';
import { PET_SIZE_LABEL, type Pet } from '../../domain/models';
import { HomeBackground } from '../../app/homeBg';
import { PetAvatar } from '../../ui/Art';
import { TripBackground, BackgroundSheet } from './TripBackground';

export function petLine(p: Pet) {
  return [p.breed || PET_SIZE_LABEL[p.size], ageFrom(p.birthDate, p.ageYears)].filter(Boolean).join(' · ');
}

export default function CarHome() {
  const { pets, trips } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const [bgOpen, setBgOpen] = useState(false);
  useEffect(() => { void HomeBackground.load(); }, []);
  const pet = pets[0];

  // 진행 중인 여행 카드
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

  const menu = [
    { icon: MapPin, t: '여행 계획', s: '목적지 · 경로', go: () => navigate(pet ? '/trip/setup' : '/pet/new?first=1') },
    { icon: PawPrint, t: '내 반려견', s: '프로필 · 설정', go: () => navigate('/pets') },
    { icon: Clock3, t: '여행 기록', s: '이동 · 휴식 · 방문', go: () => navigate('/album') },
    { icon: BookOpen, t: '추천 장소', s: '카페 · 공원 · 숙소', go: () => navigate('/explore') },
  ];

  return (
    <div className="ch">
      <section className="ch-hero">
        <div className="ch-bg"><TripBackground /></div>
        <button className="ch-bgbtn" disabled={live.driving} onClick={() => setBgOpen(true)} aria-label="홈 배경 변경"><ImageIcon size={15} />배경</button>
        <div className="ch-copy">
          <p className="l1">반려견과 떠나는<br />특별한 드라이브</p>
          <p className="l2">멍로드 <PawPrint size={30} /></p>
        </div>
        <div className="ch-cards">
          <button className="ch-card" onClick={() => navigate(pet ? (pets.length > 1 ? '/pets' : `/pet/${pet.id}`) : '/pet/new?first=1')}>
            <p className="k">나의 반려견</p>
            {pet ? (
              <div className="row" style={{ gap: 14 }}>
                <span className="ch-pets">{pets.slice(0, 3).map((p, i) => <span key={p.id} style={{ marginLeft: i ? -18 : 0, zIndex: 5 - i }}><PetAvatar uri={p.photoUri} size={56} /></span>)}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="t ellipsis">{pets.length > 1 ? `${pet.name} 외 ${pets.length - 1}마리` : pet.name}</p>
                  <p className="s ellipsis">{pets.length > 1 ? pets.map((p) => p.name).join(' · ') : petLine(pet)}</p>
                </div>
                <ChevronRight size={22} />
              </div>
            ) : (
              <div className="row" style={{ gap: 14 }}><span className="ch-empty"><Plus size={22} /></span><div className="grow"><p className="t">반려견 등록하기</p><p className="s">함께 떠날 친구를 알려 주세요</p></div><ChevronRight size={22} /></div>
            )}
          </button>
          <button className="ch-card" onClick={tripCard ? tripCard.go : () => navigate(pet ? '/trip/setup' : '/pet/new?first=1')}>
            <p className="k">진행 중인 여행</p>
            {tripCard ? (
              <div className="row" style={{ gap: 14 }}>
                <span className="ch-thumb"><TripBackground /></span>
                <div className="grow" style={{ minWidth: 0 }}><p className="t ellipsis">{tripCard.title}</p><p className="s ellipsis">{tripCard.sub}</p></div>
                <ChevronRight size={22} />
              </div>
            ) : (
              <div className="row" style={{ gap: 14 }}>
                <span className="ch-empty"><Car size={22} /></span>
                <div className="grow" style={{ minWidth: 0 }}><p className="t">진행 중인 여행이 없어요</p><p className="s ellipsis">{lastDone ? `최근: ${lastDone.title}` : '새 여행을 시작해 보세요'}</p></div>
                <ChevronRight size={22} />
              </div>
            )}
          </button>
        </div>
      </section>

      <aside className="ch-side">
        <button className="ch-start" onClick={() => (tripCard ? tripCard.go() : navigate(pet ? '/trip/setup' : '/pet/new?first=1'))}>
          <Car size={30} /><span>{tripCard ? (live.phase === 'at-destination' ? '여행지 활동 이어가기' : '주행 화면으로') : '새 여행 시작'}</span><ChevronRight size={26} />
        </button>
        <div className="ch-grid">
          {menu.map((m) => (
            <button key={m.t} onClick={m.go}><m.icon size={30} /><b>{m.t}</b><span>({m.s})</span></button>
          ))}
        </div>
      </aside>
      <BackgroundSheet open={bgOpen && !live.driving} onClose={() => setBgOpen(false)} />
    </div>
  );
}
