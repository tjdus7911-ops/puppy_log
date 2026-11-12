// 맞춤 휴식 추천 정책: 다양한 반려견 조건
import { describe, expect, it } from 'vitest';
import type { Pet } from './models';
import { EMPTY_CARE, hasCare, petInterval, placeFoundVoice, REST_RULES, resolveRestPolicy, restDueTitle, restDueVoice, restSoonVoice } from './restCare';

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

describe('케어 정보는 간격 숫자를 바꾸지 않음(전문가 검토 전)', () => {
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
