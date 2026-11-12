// 맞춤 휴식 추천 정책: 다양한 반려견 조건
import { describe, expect, it } from 'vitest';
import type { Pet } from './models';
import { ageStage, breedLooksBrachy, EMPTY_CARE, guidelineInterval, hasCare, suggestSenior, petInterval, placeFoundVoice, REST_RULES, resolveRestPolicy, restDueTitle, restDueVoice, restSoonVoice } from './restCare';

const pet = (o: Partial<Pet> = {}): Pet => ({ id: o.name ?? 'p', name: '사슴', photoUri: null, birthDate: null, ageYears: null, weight: null, size: 'small', notes: '', restIntervalMinutes: 90, createdAt: 1, ...o });

describe('적용 간격 우선순위', () => {
  it('케어 정보 없음 → 앱 기본값(의학 기준 아님)', () => {
    expect(petInterval(pet())).toEqual({ minutes: 90, basis: 'app-default' });
  });
  it('보호자가 바꾼 간격 → 보호자 설정', () => {
    expect(petInterval(pet({ restIntervalMinutes: 60 }))).toEqual({ minutes: 60, basis: 'guardian' });
  });
  it('수의사 안내 간격이 있으면 최우선', () => {
    expect(petInterval(pet({ restIntervalMinutes: 60, care: { ...EMPTY_CARE, vetRestIntervalMinutes: 120 } }))).toEqual({ minutes: 120, basis: 'vet' });
  });
  it('허용 범위(30~240분)로 제한', () => {
    expect(petInterval(pet({ care: { ...EMPTY_CARE, vetRestIntervalMinutes: 5 } })).minutes).toBe(30);
  });
});

describe('보호자가 정한 간격은 케어 정보로 바뀌지 않음', () => {
  it('노령견·멀미·불안·건강 메모가 있어도 간격은 보호자 설정 그대로, 확인 안내만 추가', () => {
    const p = pet({ restIntervalMinutes: 100, care: { ...EMPTY_CARE, senior: true, motionSickness: 'often', travelAnxiety: 'sometimes', healthNotes: '관절이 약함' } });
    const pol = resolveRestPolicy([p]);
    expect(pol.intervalMinutes).toBe(100);
    expect(pol.basis).toBe('guardian');
    expect(pol.prompts.map((x) => x.ruleId).sort()).toEqual(['health-notes', 'motion-sickness', 'senior', 'travel-anxiety']);
    expect(pol.prompts.every((x) => !/\d+\s*분/.test(x.text))).toBe(true); // 안내 문구에 임의 숫자 없음
  });
  it('모든 규칙은 확인 안내(prompt)뿐이고 출처가 있음', () => {
    expect(REST_RULES.every((r) => r.effect === 'prompt' && r.source.length > 0)).toBe(true);
  });
  it('“없음”으로 기록하면 안내하지 않음', () => {
    const p = pet({ care: { ...EMPTY_CARE, motionSickness: 'none', travelAnxiety: 'none', senior: false } });
    expect(hasCare(p)).toBe(false);
    expect(resolveRestPolicy([p]).prompts).toHaveLength(0);
  });
});

describe('여러 마리', () => {
  it('가장 짧은 간격 적용 + 이유 기록', () => {
    const pol = resolveRestPolicy([pet({ id: 'a', name: '사슴', restIntervalMinutes: 120 }), pet({ id: 'b', name: '초코', care: { ...EMPTY_CARE, vetRestIntervalMinutes: 75 } })]);
    expect(pol.intervalMinutes).toBe(75);
    expect(pol.basis).toBe('vet');
    expect(pol.petId).toBe('b');
    expect(pol.reasons[1]).toContain('2마리 중 가장 짧은 간격');
  });
  it('반려견 없음 → 앱 기본값', () => {
    expect(resolveRestPolicy([]).basis).toBe('app-default');
  });
});

describe('음성·화면 문구', () => {
  it('받침에 따른 조사와 부르는 이름', () => {
    expect(restDueVoice('사슴', false)).toBe('사슴이가 쉬어갈 시간이네요. 가까운 휴식 장소를 찾아볼까요?');
    expect(restDueVoice('초코', false)).toBe('초코가 쉬어갈 시간이네요. 가까운 휴식 장소를 찾아볼까요?');
    expect(restDueVoice('사슴', true)).toBe('사슴이의 여행 케어 설정을 고려하면 잠시 쉬어가는 게 좋겠어요. 가까운 휴식지를 안내할까요?');
    expect(restSoonVoice('보리')).toBe('곧 보리가 쉬어갈 시간이에요.');
    expect(restDueTitle('콩')).toBe('콩이가 쉬어갈 시간이에요');
  });
  it('동반 가능이 확인된 경우에만 “동반 가능”이라고 말함', () => {
    expect(placeFoundVoice(true)).toContain('반려견 동반이 가능한');
    expect(placeFoundVoice(false)).not.toContain('동반이 가능한');
    expect(placeFoundVoice(false)).toContain('확인이 필요');
  });
  it('측정·진단처럼 들리는 표현을 쓰지 않음', () => {
    const all = [restDueVoice('사슴', true), restDueVoice('사슴', false), restSoonVoice('사슴'), ...REST_RULES.map((r) => r.message('사슴이'))].join(' ');
    expect(all).not.toMatch(/피로도|측정|진단|치료|위험합니다|해야 합니다/);
  });
});

describe('휴식 간격 기준표(기획서 초안) 자동 추천', () => {
  const NOW = new Date('2026-11-12T12:00:00').getTime();
  it('성견·특이사항 없음 → 120분', () => {
    const p = pet({ ageYears: 4, care: { ...EMPTY_CARE, condition: 'none' } });
    expect(petInterval(p, NOW)).toEqual({ minutes: 120, basis: 'guideline' });
  });
  it('어린 강아지는 월령이 낮을수록 짧게(3개월 60 · 6개월 75 · 10개월 90)', () => {
    expect(guidelineInterval(pet({ birthDate: '2026-08-10' }), NOW)?.minutes).toBe(60);
    expect(guidelineInterval(pet({ birthDate: '2026-05-01' }), NOW)?.minutes).toBe(75);
    expect(guidelineInterval(pet({ birthDate: '2026-01-01' }), NOW)?.minutes).toBe(90);
    expect(ageStage(pet({ birthDate: '2026-01-01' }), NOW)).toBe('puppy');
  });
  it('노령견은 나이·체급으로 제안(소형 10살·중형 8살·대형 7살), 보호자 확인값이 우선', () => {
    expect(suggestSenior(pet({ ageYears: 9, size: 'medium' }), NOW)).toBe(true);
    expect(suggestSenior(pet({ ageYears: 9, size: 'small' }), NOW)).toBe(false);
    expect(petInterval(pet({ ageYears: 9, size: 'medium' }), NOW)).toEqual({ minutes: 90, basis: 'guideline' });
    expect(petInterval(pet({ ageYears: 9, size: 'medium', care: { ...EMPTY_CARE, senior: false } }), NOW).minutes).toBe(120);
  });
  it('단두종은 견종 이름으로 제안 → 90분', () => {
    expect(breedLooksBrachy('프렌치 불독')).toBe(true);
    expect(breedLooksBrachy('말티즈')).toBe(false);
    expect(petInterval(pet({ ageYears: 3, breed: '퍼그' }), NOW).minutes).toBe(90);
  });
  it('여러 조건이 겹치면 가장 짧은 간격(노령견 90 + 신장 질환·당뇨 60 → 60)', () => {
    const g = guidelineInterval(pet({ ageYears: 12, care: { ...EMPTY_CARE, condition: 'kidney-diabetes' } }), NOW);
    expect(g?.minutes).toBe(60);
    expect(g?.items.map((i) => i.id).sort()).toEqual(['cond-kd', 'senior']);
    expect(g?.items.every((i) => i.source.length > 10)).toBe(true); // 항목마다 근거 자료
  });
  it('보호자가 직접 고치면 보호자 설정, 수의사 안내 간격이 있으면 그보다 우선', () => {
    const base = { ageYears: 12, care: { ...EMPTY_CARE, condition: 'kidney-diabetes' as const } };
    expect(petInterval(pet({ ...base, restIntervalMinutes: 100, care: { ...base.care, guardianInterval: true } }), NOW)).toEqual({ minutes: 100, basis: 'guardian' });
    expect(petInterval(pet({ ...base, care: { ...base.care, vetRestIntervalMinutes: 45 } }), NOW)).toEqual({ minutes: 45, basis: 'vet' });
  });
  it('나이·건강 정보가 없으면 기준표를 쓰지 않고 앱 기본값', () => {
    expect(guidelineInterval(pet(), NOW)).toBeNull();
    expect(petInterval(pet(), NOW).basis).toBe('app-default');
  });
  it('기준표 추천이면 정책 이유에 항목이 남음', () => {
    const pol = resolveRestPolicy([pet({ ageYears: 9, size: 'medium' })], NOW);
    expect(pol.basis).toBe('guideline');
    expect(pol.reasons.join(' ')).toContain('노령견 90분');
  });
});
