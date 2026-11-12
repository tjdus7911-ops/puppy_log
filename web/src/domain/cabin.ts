// 반려견 탑승 안전 안내(기획서 3장 '반려견 탑승 안전 안내', 5장 Vehicle SDK·AAOS 속성)
//
// 차량 상태: AAOS 속성(속도·기어·시동·외기 온도 ENV_OUTSIDE_TEMPERATURE)과
// Vehicle SDK 도메인(Window·Door·HVAC·Odometer·Brake·TurnSignal·Safety).
// Vehicle SDK 는 차종별 지원이 달라 여행 시작 때 도메인별로 확인하고(checkXXXCapability),
// 지원하지 않는 도메인의 안내는 끄고 나머지 기능은 그대로 씁니다.
//
// 원칙:
//  - 창문·문은 상태만 읽고 움직이지 않습니다. 차량 제어는 '에어컨 켜기' 하나뿐이며 보호자가 동의할 때만 실행합니다.
//  - 창문·더위 안내는 보호자의 확인을 돕는 보조 안내이며 차량의 기본 안전 기능을 대신하지 않습니다.
//  - 더위 기준 온도는 휴식 간격과 함께 출시 전 수의사 자문으로 확정합니다(초안).

/** 차량에서 읽은 탑승 공간 상태. 지원하지 않거나 아직 모르면 null */
export interface CabinState {
  /** 뒷좌석 창문 중 가장 많이 열린 비율(0~100) */
  rearWindowOpenPct: number | null;
  /** 뒷문 중 하나라도 열림 */
  rearDoorOpen: boolean | null;
  /** 에어컨(냉방) 켜짐 */
  acOn: boolean | null;
  /** 바깥 기온(℃) */
  outsideTempC: number | null;
  /** 방향지시등 작동(차로 변경·회전 중) */
  turnSignal: boolean | null;
  /** 차량 경고 표시 중(Safety 도메인) */
  vehicleWarning: boolean | null;
  /** 시동 켜짐 */
  ignitionOn: boolean | null;
  /** 주차 브레이크 */
  parkingBrake: boolean | null;
  /** 주행 거리계(km) */
  odometerKm: number | null;
}

export const EMPTY_CABIN: CabinState = {
  rearWindowOpenPct: null, rearDoorOpen: null, acOn: null, outsideTempC: null, turnSignal: null,
  vehicleWarning: null, ignitionOn: null, parkingBrake: null, odometerKm: null,
};

/** 도메인별 지원 여부(여행 시작 때 한 번 확인해 여행에 저장) */
export interface CabinCapabilities {
  window: boolean;
  door: boolean;
  hvac: boolean;
  /** 에어컨 켜기 제어(권한 승인·지원 차종) */
  hvacControl: boolean;
  outsideTemp: boolean;
  turnSignal: boolean;
  safety: boolean;
  odometer: boolean;
  ignition: boolean;
  brake: boolean;
  /** 차량에 펫 모드 사양이 있음(멍로드는 켜는 방법만 안내, 직접 실행하지 않음) */
  petMode: boolean;
}

export const NO_CABIN: CabinCapabilities = {
  window: false, door: false, hvac: false, hvacControl: false, outsideTemp: false,
  turnSignal: false, safety: false, odometer: false, ignition: false, brake: false, petMode: false,
};

export const CAPABILITY_LABEL: Record<keyof CabinCapabilities, string> = {
  window: '창문 상태(Window)', door: '문 상태(Door)', hvac: '공조 상태(HVAC)', hvacControl: '에어컨 켜기(HVAC 제어)',
  outsideTemp: '외기 온도(AAOS)', turnSignal: '방향지시등(TurnSignal)', safety: '차량 경고(Safety)',
  odometer: '주행 거리계(Odometer)', ignition: '시동(AAOS)', brake: '주차 브레이크(Brake)', petMode: '펫 모드 사양',
};

// ── 기준값(초안 · 수의사 자문 전) ──
/** 이만큼 넘게 열리면 '많이 열림' */
export const WINDOW_OPEN_PCT = 50;
/** 다시 안내할 수 있게 되는 닫힘 기준 */
export const WINDOW_CLOSED_PCT = 20;
/** 더위 안내 기준 온도 */
export const HEAT_TEMP_C = 28;
/** 더위에 약한 단두종은 더 낮은 기온부터 */
export const HEAT_TEMP_C_BRACHY = 25;

export type CabinPromptKind = 'window' | 'heat' | 'door-rest' | 'leave-check';

export interface CabinPrompt {
  kind: CabinPromptKind;
  /** 음성·화면 문구 */
  text: string;
  /** 예/아니요로 답을 받는 안내 */
  ask: boolean;
  /** 음성 우선순위: 창문·더위 = 안전, 뒷문 휴식 확인 = 휴식 */
  priority: 'safety' | 'rest';
  at: number;
}

/** 안내를 반복하지 않기 위한 구간(leg)별 기억 */
export interface CabinMemo {
  windowNotified: boolean;
  heatAsked: boolean;
  /** 이번 정차에서 뒷문 휴식 확인을 이미 했는지(다시 움직이면 초기화) */
  doorAskedThisStop: boolean;
  lastDoorOpen: boolean;
  /** 이번 정차에서 뒷문이 한 번이라도 열렸는지(반려견을 내렸을 가능성) */
  doorOpenedThisStop?: boolean;
  lastIgnitionOn?: boolean;
}

export const EMPTY_MEMO: CabinMemo = { windowNotified: false, heatAsked: false, doorAskedThisStop: false, lastDoorOpen: false, doorOpenedThisStop: false, lastIgnitionOn: true };

export interface CabinContext {
  /** 주행 중(움직이는 중) */
  moving: boolean;
  /** 주차(P 기어·시동 끔·주차 브레이크 등) */
  parked: boolean;
  resting: boolean;
  arrived: boolean;
  /** 조사를 붙이지 않은 부르는 이름(예: '사슴이') */
  petCall: string;
  /** 함께 탄 반려견 중 단두종이 있으면 true */
  brachy: boolean;
  caps: CabinCapabilities;
  now: number;
}

/** 더위 안내 기준 온도 */
export function heatThreshold(brachy: boolean): number {
  return brachy ? HEAT_TEMP_C_BRACHY : HEAT_TEMP_C;
}

export function isHot(c: CabinState, brachy: boolean): boolean {
  return c.outsideTempC != null && c.outsideTempC >= heatThreshold(brachy);
}

/** 방향지시등 작동·차량 경고 중에는 알림을 미룸(기획서 3장 '겹치지 않게') */
export function shouldHoldAlerts(c: CabinState, caps: CabinCapabilities): boolean {
  return (caps.turnSignal && c.turnSignal === true) || (caps.safety && c.vehicleWarning === true);
}

export function windowText(petCall: string): string {
  // petCall 은 부르는 이름(받침이 있으면 '이'가 붙어 항상 모음으로 끝남) → 조사는 '가'
  return `뒷좌석 창문이 많이 열려 있어요. ${petCall}가 머리를 내밀 수 있으니 조금 닫아 주세요.`;
}

export function heatText(tempC: number, petCall: string, canControl: boolean): string {
  const t = Math.round(tempC);
  return canControl ? `바깥이 ${t}도예요. ${petCall}를 위해 에어컨을 켤까요?` : `바깥이 ${t}도예요. ${petCall}를 위해 에어컨을 켜 주세요.`;
}

export const DOOR_REST_TEXT = '휴식 시작할까요?';

/** 시동을 껐는데 이번 정차에서 뒷문이 열리지 않았을 때(반려견을 두고 내리지 않도록) */
export function leaveCheckText(petCall: string, petMode: boolean): string {
  return petMode
    ? `${petCall}를 내리셨나요? 잠깐 차에 두고 내리면 펫 모드를 켜 주세요.`
    : `${petCall}를 내리셨나요? 차 안에 혼자 두지 마세요.`;
}

/** 펫 모드 켜는 방법(현대·기아 인포테인먼트 매뉴얼 기준 요약). 멍로드는 실행하지 않고 안내만 함 */
export const PET_MODE_STEPS = [
  "기어를 'P'(주차)로 두세요. 주행 중에는 펫 모드가 실행되지 않아요.",
  '차량 홈 화면에서 펫 모드를 누르고 작동 온도를 정하세요.',
  '대기 화면에서 설정 온도를 확인한 뒤 내리세요.',
] as const;
export const PET_MODE_NOTES = [
  '사양 적용 차량에서만 쓸 수 있고, 마이현대(블루링크) 가입과 통합계정 연동이 필요해요.',
  '배터리를 쓰는 기능이라 잔량이 낮으면 꺼질 수 있어요. 짧은 시간만 사용하세요.',
  '더운 날 장시간 두고 내리지 마세요.',
] as const;

/** 휴식 중 더운 날 함께 보여 줄 안내 */
export function restHeatCare(petCall: string): string {
  return `더운 날이에요. ${petCall}에게 물을 주고 그늘에서 쉬어 가세요.`;
}

/**
 * 차량 상태가 바뀔 때마다 호출. 새로 보여 줄 안내(한 번에 최대 하나)와 갱신된 기억을 돌려줍니다.
 * 우선순위: 창문(안전) → 더위(안전) → 뒷문 휴식 확인(휴식)
 */
export function evaluateCabin(c: CabinState, memo: CabinMemo, ctx: CabinContext): { prompt: CabinPrompt | null; memo: CabinMemo } {
  const m: CabinMemo = { ...memo };
  if (ctx.moving) { m.doorAskedThisStop = false; m.doorOpenedThisStop = false; }
  if (c.rearDoorOpen === true) m.doorOpenedThisStop = true;
  const ignitionOff = c.ignitionOn === false && memo.lastIgnitionOn !== false;
  if (c.ignitionOn != null) m.lastIgnitionOn = c.ignitionOn;
  // 창문이 거의 닫히면 다시 안내할 수 있게 함
  if (c.rearWindowOpenPct != null && c.rearWindowOpenPct <= WINDOW_CLOSED_PCT) m.windowNotified = false;
  const doorOpened = c.rearDoorOpen === true && !memo.lastDoorOpen;
  m.lastDoorOpen = c.rearDoorOpen === true;
  // 내리기 전 확인: 도착 후에도 동작(목적지·집에서 시동을 끄는 순간)
  if (ctx.caps.ignition && ctx.caps.door && ignitionOff && !m.doorOpenedThisStop && (ctx.parked || ctx.arrived)) {
    return { prompt: { kind: 'leave-check', text: leaveCheckText(ctx.petCall, ctx.caps.petMode), ask: true, priority: 'safety', at: ctx.now }, memo: m };
  }
  if (ctx.arrived) return { prompt: null, memo: m };

  if (ctx.caps.window && ctx.moving && !m.windowNotified && (c.rearWindowOpenPct ?? 0) > WINDOW_OPEN_PCT) {
    m.windowNotified = true;
    return { prompt: { kind: 'window', text: windowText(ctx.petCall), ask: false, priority: 'safety', at: ctx.now }, memo: m };
  }
  if (ctx.caps.outsideTemp && ctx.caps.hvac && ctx.moving && !m.heatAsked && isHot(c, ctx.brachy) && c.acOn === false) {
    m.heatAsked = true;
    return { prompt: { kind: 'heat', text: heatText(c.outsideTempC!, ctx.petCall, ctx.caps.hvacControl), ask: ctx.caps.hvacControl, priority: 'safety', at: ctx.now }, memo: m };
  }
  if (ctx.caps.door && ctx.parked && !ctx.resting && doorOpened && !m.doorAskedThisStop) {
    m.doorAskedThisStop = true;
    return { prompt: { kind: 'door-rest', text: DOOR_REST_TEXT, ask: true, priority: 'rest', at: ctx.now }, memo: m };
  }
  return { prompt: null, memo: m };
}
