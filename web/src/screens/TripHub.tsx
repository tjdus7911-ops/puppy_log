// 여행 허브(차량 왼쪽 '여행' 메뉴): 현재 여행 상태 + 여행 관련 기능의 상위 화면.
//  - 진행 중인 여행이 있으면 그 상태와 이어가기
//  - 새 여행 시작(반려견 선택부터) / 여행 계획(목적지·경로·휴식) / 주변 동반 장소 / 최근 여행
import { useSyncExternalStore } from 'react';
import { Car, ChevronRight, Compass, MapPin, Route } from 'lucide-react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { TripController } from '../trip/TripController';
import { formatKm, formatShortDate } from '../domain/format';
import { TopBar } from '../ui/components';

export default function TripHub() {
  const { pets, trips } = useStore();
  const live = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot);
  const recent = trips.filter((t) => t.status === 'ended').slice(0, 4);
  const noPet = pets.length === 0;
  const state = !live.active ? null : live.phase === 'at-destination' ? '여행지 활동 중' : live.engine?.status === 'resting' ? '휴식 중' : live.legKind === 'return' ? '돌아가는 중' : '이동 중';
  return (
    <div className="screen th-screen">
      <TopBar title="여행" />
      <section className={`th-now ${live.active ? 'on' : ''}`}>
        <span className="ic"><Car size={28} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <p className="k">현재 여행 상태</p>
          <p className="t ellipsis">{live.active ? `${live.trip?.destinationName ?? '목적지 미정'} 여행 · ${state}` : '진행 중인 여행이 없어요'}</p>
        </div>
        {live.active && <button className="th-go" onClick={() => navigate(live.phase === 'at-destination' ? '/trip/destination' : '/trip/live')}>{live.phase === 'at-destination' ? '여행지 활동' : '주행 화면'}<ChevronRight size={20} /></button>}
      </section>
      <div className="th-acts">
        <button className="th-act main" disabled={live.active} onClick={() => navigate(noPet ? '/pet/new?first=1' : '/trip/setup')}>
          <Car size={30} /><b>새 여행 시작</b><span>{live.active ? '진행 중인 여행을 먼저 마무리해 주세요' : '반려견 선택부터 시작해요'}</span>
        </button>
        <button className="th-act" disabled={live.active || noPet} onClick={() => navigate('/trip/setup?step=plan')}>
          <Route size={30} /><b>여행 계획</b><span>출발 전 목적지·경로·휴식 계획 확인</span>
        </button>
        <button className="th-act" onClick={() => navigate('/explore')}>
          <Compass size={30} /><b>주변 동반 장소</b><span>카페 · 공원 · 숙소</span>
        </button>
      </div>
      <h2 className="h-md" style={{ margin: '24px 0 10px' }}>최근 여행</h2>
      {recent.length === 0 ? <p className="t-sub">아직 완료한 여행이 없어요.</p> : (
        <div className="th-recent">
          {recent.map((t) => (
            <button key={t.id} className="th-trip" onClick={() => navigate(`/album/${t.id}`)}>
              <MapPin size={20} /><span className="grow ellipsis"><b>{t.title}</b><small>{formatShortDate(t.startTime)} · {formatKm(t.totalDistanceKm)}{t.isDemo ? ' · 데모' : ''}</small></span><ChevronRight size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
