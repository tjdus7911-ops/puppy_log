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
