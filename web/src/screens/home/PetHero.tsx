// 홈 반려견 개인화 영역(다견 가구 대응)
//  - 1마리: 대표 사진을 크게
//  - 2마리: 두 프로필 사진을 나란히(CSS 분할 레이아웃 — 사진을 합성하지 않음)
//  - 3마리 이상: 대표 사진 + 나머지 반려견 프로필 썸네일
// 사진이 없는 반려견은 기본 프로필 그림을 표시합니다. 반려견을 누르면 해당 프로필로 이동합니다.
import { useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { Pet } from '../../domain/models';
import { PET_SIZE_LABEL } from '../../domain/models';
import { navigate } from '../../app/router';
import { callName } from '../../domain/tripText';
import { DogFace, PawGlyph } from '../../ui/Art';

/** 실제 등록 사진(없거나 로딩 실패 → 기본 프로필 그림) */
export function PetPhoto({ pet, className }: { pet: Pet; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (pet.photoUri && !failed) return <img className={`pet-photo ${className ?? ''}`} src={pet.photoUri} alt={`${pet.name} 사진`} onError={() => setFailed(true)} />;
  return (
    <div className={`pet-photo default ${className ?? ''}`} role="img" aria-label={`${pet.name} 기본 프로필 그림(사진 없음)`}>
      <DogFace size={120} />
    </div>
  );
}

const MAX_THUMBS = 4;

export function PetHero({ pets, variant, locked = false, children }: { pets: Pet[]; variant: 'panel' | 'card'; locked?: boolean; children?: ReactNode }) {
  if (pets.length === 0) {
    return (
      <section className={`pet-hero ${variant} empty`} aria-label="반려견">
        <div className="ph-media"><div className="pet-photo default"><PawGlyph size={64} color="rgba(255,255,255,.55)" /></div></div>
        <div className="ph-copy">
          <p className="k"><PawGlyph size={16} color="currentColor" />멍로드</p>
          <h2>함께 떠날 반려견을<br />등록해 주세요</h2>
        </div>
        <div className="ph-pets"><button className="pet-add wide" onClick={() => navigate('/pet/new')}><Plus size={18} />반려견 등록하기</button></div>
        {children}
      </section>
    );
  }
  const n = pets.length;
  const layout = n === 1 ? 'one' : n === 2 ? 'two' : 'many';
  const main = pets[0];
  const rest = pets.slice(1);
  // callName은 받침 있는 이름에 '이'를 붙여(사슴→사슴이) 항상 '와'가 자연스럽게 이어짐
  const title = n === 1 ? `${callName(main.name)}와 떠날\n준비가 되었어요`
    : n === 2 ? `${pets.map((p) => callName(p.name)).join('·')}와\n떠날 준비가 되었어요`
    : `${callName(main.name)} 외 ${n - 1}마리와\n떠날 준비가 되었어요`;
  const go = (p: Pet) => !locked && navigate(`/pet/${p.id}`);

  return (
    <section className={`pet-hero ${variant} ${layout}`} aria-label={`반려견 ${n}마리`}>
      <div className="ph-media">
        {layout === 'two' ? (
          pets.slice(0, 2).map((p) => (
            <button key={p.id} className="ph-slot" onClick={() => go(p)} aria-label={`${p.name} 프로필 보기`}><PetPhoto pet={p} /></button>
          ))
        ) : (
          <button className="ph-slot" onClick={() => go(main)} aria-label={`${main.name} 프로필 보기`}><PetPhoto pet={main} />{layout === 'many' && <span className="ph-tag">대표 · {main.name}</span>}</button>
        )}
      </div>
      <div className="ph-copy">
        <p className="k"><PawGlyph size={16} color="currentColor" />{n === 1 ? '멍로드 · 대기 중' : `멍로드 · 반려견 ${n}마리`}</p>
        <h2>{title.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
      </div>
      <div className="ph-pets" aria-label="반려견 프로필">
        {(layout === 'many' ? rest.slice(0, MAX_THUMBS - 1) : pets).map((p) => (
          <button key={p.id} className="pet-chip" onClick={() => go(p)} disabled={locked} aria-label={`${p.name} 프로필 ${locked ? '(주행 중 잠김)' : '보기'}`}>
            <span className="av"><PetPhoto pet={p} /></span>
            <span className="tx"><b>{p.name}</b><small>{PET_SIZE_LABEL[p.size]} · {p.restIntervalMinutes}분</small></span>
            {n === 1 && <ChevronRight size={16} />}
          </button>
        ))}
        {layout === 'many' && rest.length > MAX_THUMBS - 1 && (
          <button className="pet-chip more" onClick={() => navigate('/my')} aria-label="모든 반려견 보기">+{rest.length - (MAX_THUMBS - 1)}</button>
        )}
        <button className="pet-add" onClick={() => navigate('/pet/new')} disabled={locked} aria-label="반려견 추가"><Plus size={18} /></button>
      </div>
      {children}
    </section>
  );
}
