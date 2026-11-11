// 내 반려견: 등록된 반려견 목록 · 추가 · 프로필 편집으로 이동
import { ChevronRight, Plus } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { TripController } from '../trip/TripController';
import { TopBar } from '../ui/components';
import { PetPhoto } from './home/PetHero';
import { petLine } from './home/CarHome';

export default function PetsScreen() {
  const { pets } = useStore();
  const driving = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot).driving;
  return (
    <div className="screen">
      <TopBar title="내 반려견" />
      {driving && <div className="hint" style={{ marginBottom: 12 }}>주행 중에는 프로필 편집이 잠겨요. 정차 후 이용해 주세요.</div>}
      <div className="pets-grid">
        {pets.map((p) => (
          <button key={p.id} className="pet-tile" disabled={driving} onClick={() => navigate(`/pet/${p.id}`)} aria-label={`${p.name} 프로필`}>
            <span className="ph"><PetPhoto pet={p} /></span>
            <span className="tx"><b>{p.name}</b><small>{petLine(p)}</small><small>휴식 알림 {p.restIntervalMinutes}분</small></span>
            <ChevronRight size={20} />
          </button>
        ))}
        <button className="pet-tile add" disabled={driving} onClick={() => navigate('/pet/new')}><Plus size={28} /><b>반려견 추가</b></button>
      </div>
    </div>
  );
}
