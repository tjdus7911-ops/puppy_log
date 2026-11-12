import { describe, expect, it } from 'vitest';
import { evaluateFix, haversineKm, isValidCoordinate } from './geo';
import { nearestRegion } from './regions';
import { createEngine, endRest, endTrip, snooze, startRest, step, type VehicleSample } from './tripEngine';
import { autoTitle, callName, petNames, templateDiary } from './tripText';
import { applyPolicyFilters, type Place } from '../places/PlaceSearchProvider';
import { passesSafetyCheck } from '../diary/diaryGenerator';

const T0 = 1_700_000_000_000;
const sample = (sec: number, motion: VehicleSample['motion'], lat: number | null = null, lon: number | null = null): VehicleSample => ({
  timestamp: T0 + sec * 1000, latitude: lat, longitude: lon, accuracy: 8, speedKmh: motion === 'moving' ? 90 : 0, motion,
});

/** 주어진 초 동안 5초 간격으로 주행 샘플을 흘려보냄 */
function drive(state: ReturnType<typeof createEngine>, fromSec: number, toSec: number, motion: VehicleSample['motion'] = 'moving') {
  const events = [];
  let s = state;
  for (let t = fromSec; t <= toSec; t += 5) {
    const r = step(s, sample(t, motion));
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

describe('geo', () => {
  it('서울-강릉 직선거리는 약 165km', () => {
    const d = haversineKm({ latitude: 37.5665, longitude: 126.978 }, { latitude: 37.7519, longitude: 128.8761 });
    expect(d).toBeGreaterThan(160);
    expect(d).toBeLessThan(172);
  });
  it('잘못된 좌표를 거른다', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(NaN, 127)).toBe(false);
    expect(isValidCoordinate(91, 127)).toBe(false);
    expect(isValidCoordinate(37.5, 127)).toBe(true);
  });
  it('순간 이동(거리 급증)과 낮은 정확도를 거른다', () => {
    const a = { latitude: 37.5, longitude: 127, timestamp: T0, accuracy: 5 };
    expect(evaluateFix(a, { ...a, latitude: 37.8, timestamp: T0 + 5000 })).toEqual({ accept: false, reason: 'jump' });
    expect(evaluateFix(a, { ...a, latitude: 37.501, timestamp: T0 + 5000, accuracy: 200 })).toEqual({ accept: false, reason: 'inaccurate' });
    const ok = evaluateFix(a, { ...a, latitude: 37.501, timestamp: T0 + 5000 });
    expect(ok.accept).toBe(true);
  });
  it('가까운 지역을 찾는다', () => {
    expect(nearestRegion({ latitude: 37.76, longitude: 128.9 })?.name).toBe('강릉');
    expect(nearestRegion({ latitude: 30, longitude: 120 })).toBeNull();
  });
});

describe('tripEngine', () => {
  it('전체 경과 시간과 실제 주행 시간을 따로 센다', () => {
    let s = createEngine(T0, 90);
    s = drive(s, 0, 600).s; // 10분 주행
    s = drive(s, 605, 1200, 'stopped').s; // 약 10분 정차
    expect(Math.round(s.drivingSec)).toBe(600);
    expect(Math.round(s.elapsedSec)).toBe(1200);
    expect(s.status).toBe('stopped');
  });

  it('정차를 자동으로 휴식으로 기록하지 않는다', () => {
    let s = createEngine(T0, 90);
    s = drive(s, 0, 300).s;
    s = drive(s, 305, 3000, 'stopped').s; // 오래 서 있어도
    expect(s.restCount).toBe(0);
    expect(s.status).toBe('stopped');
  });

  it('80분에 예고, 90분에 휴식 알림을 각각 한 번만 보낸다', () => {
    const { events } = drive(createEngine(T0, 90), 0, 100 * 60);
    expect(events.filter((e) => e.type === 'restSoon')).toHaveLength(1);
    const due = events.filter((e) => e.type === 'restDue');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ drivenMinutes: 90 });
  });

  it('나중에 알림은 15분 뒤 다시 알린다', () => {
    let { s } = drive(createEngine(T0, 90), 0, 90 * 60);
    s = snooze(s);
    const r = drive(s, 90 * 60 + 5, 106 * 60);
    expect(r.events.filter((e) => e.type === 'restDue')).toHaveLength(1);
  });

  it('휴식은 명시적으로 시작해야 하고 중복 시작되지 않는다', () => {
    let { s } = drive(createEngine(T0, 90), 0, 90 * 60);
    const a = startRest(s, T0 + 90 * 60 * 1000);
    expect(a.started).toBe(true);
    const b = startRest(a.state, T0 + 90 * 60 * 1000 + 10);
    expect(b.started).toBe(false);
    s = drive(a.state, 90 * 60 + 5, 105 * 60, 'moving').s; // 휴식 중엔 주행으로 바뀌지 않음
    expect(s.status).toBe('resting');
    const e = endRest(s, T0 + 105 * 60 * 1000);
    expect(e.state.restCount).toBe(1);
    expect(Math.round(e.durationSec)).toBe(15 * 60);
    expect(e.state.drivingSinceRestSec).toBe(0);
  });

  it('앱이 꺼져 있던 공백은 주행 시간으로 추정하지 않는다', () => {
    let s = drive(createEngine(T0, 90), 0, 60).s;
    s = step(s, sample(60 + 3600, 'moving')).state;
    expect(s.drivingSec).toBeLessThan(120);
    expect(s.elapsedSec).toBe(3660);
  });

  it('비정상 좌표는 거리에 더하지 않는다', () => {
    let s = createEngine(T0, 90);
    s = step(s, sample(0, 'moving', 37.5, 127)).state;
    s = step(s, sample(5, 'moving', 37.5011, 127)).state; // ~122m
    s = step(s, sample(10, 'moving', 0, 0)).state;
    s = step(s, sample(15, 'moving', 38.5, 127)).state; // 순간 이동
    expect(s.distanceKm).toBeGreaterThan(0.1);
    expect(s.distanceKm).toBeLessThan(0.15);
    expect(s.rejectedFixes).toBe(2);
  });

  it('여행 종료 시 진행 중인 휴식도 닫는다', () => {
    let s = drive(createEngine(T0, 90), 0, 60).s;
    s = startRest(s, T0 + 70_000).state;
    s = endTrip(s, T0 + 130_000);
    expect(s.status).toBe('ended');
    expect(s.restCount).toBe(1);
  });
});

describe('tripText', () => {
  it('이름 호칭과 조사', () => {
    expect(callName('사슴')).toBe('사슴이');
    expect(callName('코코')).toBe('코코');
    expect(petNames(['사슴', '코코'])).toBe('사슴이와 코코');
  });
  it('자동 제목', () => {
    expect(autoTitle({ petNames: ['사슴'], destinationName: null, endRegionShort: '강릉', startTime: T0 })).toBe('사슴이와 강릉 바다 여행');
    expect(autoTitle({ petNames: ['사슴'], destinationName: null, endRegionShort: null, startTime: T0 })).toMatch(/사슴이와 달린 길$/);
  });
  it('템플릿 일기는 기록에 없는 장소나 샘플 장소를 쓰지 않는다', () => {
    const text = templateDiary({
      petNames: ['사슴'], startTime: T0, startRegion: '서울', endRegion: '강릉', distanceKm: 236, drivingSec: 9000,
      elapsedSec: 11000, restCount: 1, places: [{ name: '가상 카페', category: 'cafe', isSample: true }], photoCount: 0, memo: '',
    });
    expect(text).toContain('서울에서 강릉까지');
    expect(text).toContain('한 번 쉬어갔다');
    expect(text).not.toContain('가상 카페');
    expect(text).not.toMatch(/행복|피곤|신나/);
  });
  it('AI 일기 안전 점검', () => {
    const base = { petNames: ['사슴'], startTime: T0, startRegion: null, endRegion: null, distanceKm: 1, drivingSec: 1, elapsedSec: 1, restCount: 0, places: [], photoCount: 0, memo: '' };
    expect(passesSafetyCheck('바닷가 카페에 들렀다.', base)).toBe(false);
    expect(passesSafetyCheck('함께 길을 달렸다.', base)).toBe(true);
  });
});

describe('place filters', () => {
  const mk = (id: string, largeDog: boolean | null): Place => ({
    id, name: id, category: 'cafe', address: '', latitude: 37, longitude: 127, phone: null, hours: null, imageUri: null,
    isSample: true, sourceLabel: '', policy: { smallDog: true, largeDog, indoor: null, outdoor: null, carrierRequired: null, parking: null },
  });
  it('확인된 정보만 일치로 보고, 정보 없음은 분리한다', () => {
    const r = applyPolicyFilters([mk('a', true), mk('b', false), mk('c', null)], ['largeDog']);
    expect(r.matched.map((p) => p.id)).toEqual(['a']);
    expect(r.unknown.map((p) => p.id)).toEqual(['c']);
  });
});

import { countRests, planRests } from './plan';
describe('plan (예상 휴식)', () => {
  it('3시간 주행 · 90분 간격 → 도착 직전 휴식 제외 시 1회, 포함 시 1회(180분 시점은 도착과 같아 제외)', () => {
    expect(countRests(180, 90, true)).toEqual([90]);
    expect(countRests(180, 90, false)).toEqual([90]);
    expect(countRests(200, 90, false)).toEqual([90, 180]);
    expect(countRests(200, 90, true)).toEqual([90]);
  });
  it('교통 지연을 고려해 범위를 준다', () => {
    const p = planRests(225, 90, true); // 3시간 추정
    expect(p.estimated).toBe(true);
    expect(p.minRests).toBe(1);
    expect(p.maxRests).toBe(2);
  });
});

import { aheadOnRoute, isMealTime, parseYesNo, pickSuggestion, suggestionSentence, type RecoCandidate } from './autoReco';
describe('autoReco (주행 중 자동 추천)', () => {
  const route = [{ latitude: 37.0, longitude: 127.0 }, { latitude: 37.0, longitude: 127.1 }, { latitude: 37.0, longitude: 127.2 }, { latitude: 37.0, longitude: 127.3 }];
  it('경로 앞쪽만 인정하고 이탈 거리를 계산한다', () => {
    const cur = { latitude: 37.0, longitude: 127.1 };
    expect(aheadOnRoute(route, cur, { latitude: 37.0, longitude: 127.0 })).toBeNull();
    const a = aheadOnRoute(route, cur, { latitude: 37.01, longitude: 127.2 })!;
    expect(a.aheadKm).toBeGreaterThan(8);
    expect(a.detourKm).toBeLessThan(1.2);
  });
  const mk = (id: string, cat: RecoCandidate['category'], ahead: number, detour: number, ok: boolean): RecoCandidate =>
    ({ id, name: id, category: cat, point: { latitude: 0, longitude: 0 }, petConfirmed: ok, aheadKm: ahead, detourKm: detour });
  it('카테고리·이탈·반복 정책', () => {
    const c = [mk('far', 'cafe', 5, 8, true), mk('a', 'cafe', 4, 0.5, false), mk('b', 'cafe', 6, 0.4, true), mk('r', 'restaurant', 2, 0.1, true)];
    expect(pickSuggestion(c, { trigger: 'rest', enabled: ['cafe'], suggested: new Set() })?.id).toBe('b'); // 확인된 곳 우선, 크게 벗어난 곳 제외
    expect(pickSuggestion(c, { trigger: 'rest', enabled: ['cafe'], suggested: new Set(['b']) })?.id).toBe('a'); // 반복 금지
    expect(pickSuggestion(c, { trigger: 'rest', enabled: ['restArea'], suggested: new Set() })).toBeNull(); // 비활성 카테고리
    expect(pickSuggestion(c, { trigger: 'meal', enabled: ['restaurant', 'cafe'], suggested: new Set() })?.id).toBe('r');
  });
  it('문장·짧은 음성 응답·식사 시간', () => {
    expect(suggestionSentence(mk('x', 'cafe', 2.2, 0.3, true))).toBe('2km 앞에 반려견 동반 카페가 있어요. 들렀다 갈까요?');
    expect(suggestionSentence(mk('x', 'cafe', 2, 0.3, false))).toContain('확인이 필요해요');
    expect(parseYesNo('응')).toBe('yes');
    expect(parseYesNo('괜찮아')).toBe('no');
    expect(parseYesNo('날씨 어때')).toBeNull();
    expect(isMealTime(new Date(2026, 10, 11, 12, 0).getTime())).toBe(true);
    expect(isMealTime(new Date(2026, 10, 11, 15, 0).getTime())).toBe(false);
  });
});

import { changeRestInterval } from './tripEngine';
describe('여행 중 휴식 알림 간격 변경', () => {
  it('간격을 바꾸면 새 간격 기준으로 남은 시간·알림이 다시 계산됨', () => {
    let s = createEngine(0, 90);
    s = { ...s, drivingSinceRestSec: 70 * 60, reminder: { soonNotified: false, dueNotified: false, snoozeUntilSec: null } };
    const c = changeRestInterval(s, 60);
    expect(c.restIntervalMin).toBe(60);
    expect(c.reminder.dueNotified).toBe(false);
    expect(changeRestInterval(s, 10).restIntervalMin).toBe(30); // 하한
    expect(changeRestInterval(s, 999).restIntervalMin).toBe(240); // 상한
  });
});

import { mainPetOf, welcomeLead } from './tripText';
describe('홈 환영 문구', () => {
  it('받침에 따라 과/와', () => {
    expect(welcomeLead('사슴')).toBe('사슴과 떠나는');
    expect(welcomeLead('초코')).toBe('초코와 떠나는');
    expect(welcomeLead('보리')).toBe('보리와 떠나는');
    expect(welcomeLead('콩')).toBe('콩과 떠나는');
  });
  it('반려견이 없으면 기본 문구', () => {
    expect(welcomeLead(null)).toBe('반려견과 떠나는');
    expect(welcomeLead('  ')).toBe('반려견과 떠나는');
  });
  it('대표 반려견: 설정값 → 없으면 첫 번째', () => {
    const pets = [{ id: 'a', name: '사슴' }, { id: 'b', name: '초코' }];
    expect(mainPetOf(pets, 'b')?.name).toBe('초코');
    expect(mainPetOf(pets, 'deleted')?.name).toBe('사슴');
    expect(mainPetOf([], 'b')).toBeNull();
  });
});
