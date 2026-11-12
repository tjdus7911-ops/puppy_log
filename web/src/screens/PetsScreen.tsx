// 내 반려견: 등록된 반려견 목록 · 추가 · 프로필 편집으로 이동
import { ChevronRight, Plus } from 'lucide-react';
import { petInterval } from '../domain/restCare';
import { useSyncExternalStore } from 'react';
import { useStore } from '../app/store';
import { navigate } from '../app/router';
import { TripController } from '../trip/TripController';
import { TopBar } from '../ui/components';
import { PetPhoto } from './home/PetHero';
import { petLine } from './home/CarHome';
import { josa, mainPetOf } from '../domain/tripText';

export default function PetsScreen() {
  const { pets, settings, updateSettings, toast } = useStore();
  const main = mainPetOf(pets, settings.mainPetId);
  const driving = useSyncExternalStore(TripController.subscribe, TripController.getSnapshot).driving;
  return (
    <div className="screen">
      <TopBar title="내 반려견" />
      {driving && <div className="hint" style={{ marginBottom: 12 }}>주행 중에는 프로필 편집이 잠겨요. 정차 후 이용해 주세요.</div>}
      <div className="pets-grid">
        {pets.map((p) => (
          <button key={p.id} className="pet-tile" disabled={driving} onClick={() => navigate(`/pet/${p.id}`)} aria-label={`${p.name} 프로필`}>
            <span className="ph"><PetPhoto pet={p} /></span>
            <span className="tx"><b>{p.name}{main?.id === p.id && <span className="badge" style={{ marginLeft: 8, verticalAlign: 2 }}>대표</span>}</b><small>{petLine(p)}</small><small>휴식 알림 {petInterval(p).minutes}분</small></span>
            {pets.length > 1 && main?.id !== p.id && (
              <span role="button" tabIndex={0} className="btn sm secondary" onClick={(e) => { e.stopPropagation(); void updateSettings({ mainPetId: p.id }); toast(`${p.name}${josa(p.name, '을', '를')} 대표 반려견으로 정했어요. 홈 문구에 바로 반영돼요.`); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void updateSettings({ mainPetId: p.id }); } }}>대표로</span>
            )}
            <ChevronRight size={20} />
          </button>
        ))}
        <button className="pet-tile add" disabled={driving} onClick={() => navigate('/pet/new')}><Plus size={28} /><b>반려견 추가</b></button>
      </div>
    </div>
  );
}
