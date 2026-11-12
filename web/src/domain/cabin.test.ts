// 반려견 탑승 안전 안내(기획서 3장): 창문·더위·뒷문 휴식 확인·알림 미루기
import { describe, expect, it } from 'vitest';
import { EMPTY_CABIN, EMPTY_MEMO, evaluateCabin, heatThreshold, NO_CABIN, shouldHoldAlerts, type CabinCapabilities, type CabinContext, type CabinState } from './cabin';

const ALL: CabinCapabilities = { window: true, door: true, hvac: true, hvacControl: true, outsideTemp: true, turnSignal: true, safety: true, odometer: true, ignition: true, brake: true, petMode: true };
const ctx = (o: Partial<CabinContext> = {}): CabinContext => ({ moving: true, parked: false, resting: false, arrived: false, petCall: '사슴이', brachy: false, caps: ALL, now: 1, ...o });
const cab = (o: Partial<CabinState> = {}): CabinState => ({ ...EMPTY_CABIN, rearWindowOpenPct: 0, rearDoorOpen: false, acOn: true, outsideTempC: 22, ...o });

describe('뒷좌석 창문', () => {
  it('주행 중 절반 넘게 열리면 이름을 넣어 한 번 안내', () => {
    const r = evaluateCabin(cab({ rearWindowOpenPct: 60 }), EMPTY_MEMO, ctx());
    expect(r.prompt?.kind).toBe('window');
    expect(r.prompt?.text).toBe('뒷좌석 창문이 많이 열려 있어요. 사슴이가 머리를 내밀 수 있으니 조금 닫아 주세요.');
    expect(r.prompt?.priority).toBe('safety');
    expect(evaluateCabin(cab({ rearWindowOpenPct: 70 }), r.memo, ctx()).prompt).toBeNull(); // 반복 안내 없음
  });
  it('거의 닫혔다가 다시 많이 열리면 다시 안내', () => {
    let m = evaluateCabin(cab({ rearWindowOpenPct: 60 }), EMPTY_MEMO, ctx()).memo;
    m = evaluateCabin(cab({ rearWindowOpenPct: 10 }), m, ctx()).memo;
    expect(evaluateCabin(cab({ rearWindowOpenPct: 60 }), m, ctx()).prompt?.kind).toBe('window');
  });
  it('정차 중이거나 창문 도메인을 지원하지 않으면 안내하지 않음', () => {
    expect(evaluateCabin(cab({ rearWindowOpenPct: 60 }), EMPTY_MEMO, ctx({ moving: false })).prompt).toBeNull();
    expect(evaluateCabin(cab({ rearWindowOpenPct: 60 }), EMPTY_MEMO, ctx({ caps: { ...ALL, window: false } })).prompt).toBeNull();
  });
});

describe('더운 날 에어컨', () => {
  it('28℃ 이상·에어컨 꺼짐 → 켤까요? (제어 가능할 때만 묻기)', () => {
    const r = evaluateCabin(cab({ outsideTempC: 31, acOn: false }), EMPTY_MEMO, ctx());
    expect(r.prompt).toMatchObject({ kind: 'heat', ask: true, text: '바깥이 31도예요. 사슴이를 위해 에어컨을 켤까요?' });
    const noCtl = evaluateCabin(cab({ outsideTempC: 31, acOn: false }), EMPTY_MEMO, ctx({ caps: { ...ALL, hvacControl: false } }));
    expect(noCtl.prompt).toMatchObject({ ask: false, text: '바깥이 31도예요. 사슴이를 위해 에어컨을 켜 주세요.' });
  });
  it('에어컨이 켜져 있거나 기준보다 시원하면 안내 없음', () => {
    expect(evaluateCabin(cab({ outsideTempC: 31, acOn: true }), EMPTY_MEMO, ctx()).prompt).toBeNull();
    expect(evaluateCabin(cab({ outsideTempC: 26, acOn: false }), EMPTY_MEMO, ctx()).prompt).toBeNull();
  });
  it('단두종은 더 낮은 기온부터(26℃에서도 안내)', () => {
    expect(heatThreshold(true)).toBeLessThan(heatThreshold(false));
    expect(evaluateCabin(cab({ outsideTempC: 26, acOn: false }), EMPTY_MEMO, ctx({ brachy: true })).prompt?.kind).toBe('heat');
  });
  it('창문과 더위가 함께면 한 번에 하나(창문 먼저)', () => {
    const r1 = evaluateCabin(cab({ rearWindowOpenPct: 60, outsideTempC: 31, acOn: false }), EMPTY_MEMO, ctx());
    expect(r1.prompt?.kind).toBe('window');
    expect(evaluateCabin(cab({ rearWindowOpenPct: 60, outsideTempC: 31, acOn: false }), r1.memo, ctx()).prompt?.kind).toBe('heat');
  });
});

describe('주차 중 뒷문 열림 → 휴식 시작 확인', () => {
  it('주차 중 뒷문이 열리는 순간 한 번 묻기', () => {
    const p = ctx({ moving: false, parked: true });
    const r = evaluateCabin(cab({ rearDoorOpen: true }), EMPTY_MEMO, p);
    expect(r.prompt).toMatchObject({ kind: 'door-rest', ask: true, text: '휴식 시작할까요?', priority: 'rest' });
    expect(evaluateCabin(cab({ rearDoorOpen: true }), r.memo, p).prompt).toBeNull();
  });
  it('신호 대기(주차 아님)·이미 휴식 중·도착 후에는 묻지 않음', () => {
    expect(evaluateCabin(cab({ rearDoorOpen: true }), EMPTY_MEMO, ctx({ moving: false, parked: false })).prompt).toBeNull();
    expect(evaluateCabin(cab({ rearDoorOpen: true }), EMPTY_MEMO, ctx({ moving: false, parked: true, resting: true })).prompt).toBeNull();
    expect(evaluateCabin(cab({ rearDoorOpen: true }), EMPTY_MEMO, ctx({ moving: false, parked: true, arrived: true })).prompt).toBeNull();
  });
});

describe('내리기 전 확인(반려견을 두고 내리지 않게)', () => {
  const parked = ctx({ moving: false, parked: true });
  it('주차 중 시동을 끄는 순간, 이번 정차에서 뒷문이 열리지 않았으면 확인 + 펫 모드 안내', () => {
    const r = evaluateCabin(cab({ ignitionOn: false }), { ...EMPTY_MEMO, lastIgnitionOn: true }, parked);
    expect(r.prompt).toMatchObject({ kind: 'leave-check', ask: true, priority: 'safety', text: '사슴이를 내리셨나요? 잠깐 차에 두고 내리면 펫 모드를 켜 주세요.' });
  });
  it('뒷문을 열었으면(내렸을 가능성) 묻지 않음', () => {
    let m = evaluateCabin(cab({ ignitionOn: true, rearDoorOpen: true }), EMPTY_MEMO, parked).memo;
    m = evaluateCabin(cab({ ignitionOn: true, rearDoorOpen: false }), m, parked).memo;
    expect(evaluateCabin(cab({ ignitionOn: false }), m, parked).prompt?.kind).not.toBe('leave-check');
  });
  it('목적지 도착 후에도 확인, 펫 모드 사양이 없으면 혼자 두지 말라고만 안내', () => {
    const r = evaluateCabin(cab({ ignitionOn: false }), EMPTY_MEMO, ctx({ moving: false, parked: true, arrived: true, caps: { ...ALL, petMode: false } }));
    expect(r.prompt?.text).toBe('사슴이를 내리셨나요? 차 안에 혼자 두지 마세요.');
  });
});

describe('알림 미루기', () => {
  it('방향지시등 작동·차량 경고 중에는 미룸(지원할 때만)', () => {
    expect(shouldHoldAlerts(cab({ turnSignal: true }), ALL)).toBe(true);
    expect(shouldHoldAlerts(cab({ vehicleWarning: true }), ALL)).toBe(true);
    expect(shouldHoldAlerts(cab({ turnSignal: true }), NO_CABIN)).toBe(false);
    expect(shouldHoldAlerts(cab(), ALL)).toBe(false);
  });
});

import { carAppMetrics, ratioText } from './metrics';
import type { Trip } from './models';

describe('차량 앱 지표', () => {
  it('휴식 알림 응답률·장소 제안 수락률·여행 기록 완료율', () => {
    const t = (o: Partial<Trip>) => o as Trip;
    const m = carAppMetrics([
      t({ status: 'ended', restRecoLog: [{ at: 1, kind: 'due', intervalMinutes: 90, basis: 'guideline', drivenMinutes: 90, response: 'rest' }, { at: 2, kind: 'soon', intervalMinutes: 90, basis: 'guideline', drivenMinutes: 80, response: 'none' }], placeSuggestLog: [{ at: 1, placeId: 'a', accepted: true }, { at: 2, placeId: 'b', accepted: false }] }),
      t({ status: 'driving', restRecoLog: [{ at: 3, kind: 'due', intervalMinutes: 90, basis: 'guideline', drivenMinutes: 90, response: 'later' }] }),
    ]);
    expect(ratioText(m.restResponse)).toBe('50% (1/2)');
    expect(ratioText(m.placeAccept)).toBe('50% (1/2)');
    expect(ratioText(m.completion)).toBe('50% (1/2)');
    expect(ratioText({ num: 0, den: 0 })).toBe('기록 없음');
  });
});
