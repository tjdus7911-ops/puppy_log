// 반려견 맞춤 휴식 추천(케어) — 정책 모듈
//
// 원칙(docs/REST_CARE.md):
//  1) 기획서의 '휴식 간격 기준표'(초안)로 나이 단계·단두종·건강 상태에 맞는 간격을 추천합니다.
//     기준표 숫자는 공개 자료를 바탕으로 멍로드가 정한 초안이며(출처를 규칙마다 기록), 출시 전 수의사 자문으로
//     확정합니다. 화면에는 항상 '기준표 추천(초안)'으로 표시하고 진단이 아님을 밝힙니다.
//  2) 적용 순서: 수의사에게 안내받은 간격(보호자 입력) → 보호자가 직접 고친 간격 → 기준표 추천 → 앱 기본값
//     여러 조건이 겹치거나 여러 마리면 그중 가장 짧은 간격을 쓰고 이유를 남깁니다.
//  3) 멀미·이동 불안·건강 메모는 '확인 안내'와 음성 문구에만 쓰이고, 간격 숫자는 바꾸지 않습니다.
//  4) 피로도·건강 상태를 측정한 것처럼 말하지 않고, 진단·치료 지시로 오인될 문구를 쓰지 않습니다.
import type { Pet } from './models';
import { callName, josa } from './tripText';

export type Freq = 'none' | 'sometimes' | 'often';

/** 반려견 여행 케어 정보(모두 선택 입력). 건강 메모는 이 기기에만 저장하고 언제든 지울 수 있습니다. */
export interface PetCare {
  /** 노령견 여부 — 보호자 확인값. null 이면 나이·체급으로 제안한 값을 씀(suggestSenior) */
  senior: boolean | null;
  /** 단두종(퍼그·불독 등) — 보호자 확인값. null 이면 견종 이름으로 제안 */
  brachycephalic?: boolean | null;
  /** 건강 상태(보호자 선택). 휴식 간격 추천에만 쓰고 공유·커뮤니티에 표시하지 않음 */
  condition?: HealthCondition | null;
  /** 보호자가 추천값 대신 휴식 간격을 직접 정했는지 */
  guardianInterval?: boolean;
  motionSickness: Freq | null;
  travelAnxiety: Freq | null;
  /** 건강 관련 특이사항(선택) */
  healthNotes: string;
  /** 수의사에게 안내받은 이동·휴식 주의사항(선택) */
  vetAdvice: string;
  /** 수의사에게 안내받은 휴식 간격(분, 선택) — 있으면 최우선 */
  vetRestIntervalMinutes: number | null;
  updatedAt: number;
}

export type HealthCondition = 'none' | 'joint-heart-resp' | 'kidney-diabetes';
export const CONDITION_LABEL: Record<HealthCondition, string> = { none: '질환 없음', 'joint-heart-resp': '관절·심장·호흡기', 'kidney-diabetes': '신장 질환·당뇨' };

export const EMPTY_CARE: PetCare = { senior: null, brachycephalic: null, condition: null, motionSickness: null, travelAnxiety: null, healthNotes: '', vetAdvice: '', vetRestIntervalMinutes: null, updatedAt: 0 };
export const FREQ_LABEL: Record<Freq, string> = { none: '없음', sometimes: '가끔', often: '자주' };

/** 앱 기본 간격 — 의학적 권장 기준이 아니라 보호자가 바꾸기 전 출발점 */
export const APP_DEFAULT_INTERVAL = 90;
export const MIN_INTERVAL = 30;
export const MAX_INTERVAL = 240;

export type RestBasis = 'vet' | 'guardian' | 'guideline' | 'app-default';
export const BASIS_LABEL: Record<RestBasis, string> = { vet: '수의사 안내', guardian: '보호자 설정', guideline: '기준표 추천(초안)', 'app-default': '앱 기본값' };
export const GUIDELINE_NOTE = '기준표는 공개 자료를 바탕으로 한 초안이며 출시 전 수의사 자문으로 확정해요. 진단이 아니며 언제든 고칠 수 있어요.';

// ── 휴식 간격 기준표(기획서 3장, 초안) ──
const SRC_MAFRA = '농림축산식품부 반려동물 동반 차량 이동 권고 — 장거리 이동 시 최소 2시간마다 휴게소에서 배변·휴식';
const SRC_AKC_PUPPY = 'AKC — 강아지는 월령 1개월당 약 1시간 배변을 참는다는 경험칙(한계보다 여유 있게 적용)';
const SRC_AKC_SENIOR = 'AKC — 노령견은 배변 기회를 늘리는 것이 도움 / PetMD — 노령 시작 나이는 체급별로 다름';
const SRC_RVC = 'RVC VetCompass(Hall 외, 2020) — 얼굴이 납작한 견종은 열사병 위험이 약 2배';
const SRC_AAHA_DM = 'AAHA·PetPlace 당뇨 안내 — 당뇨·신장 질환은 갈증과 배뇨가 늘어 배변 기회가 더 자주 필요';

export interface GuidelineItem { id: string; label: string; minutes: number; tip: string; source: string }

const BRACHY_RE = /퍼그|불독|불도그|프렌치|시추|시츄|페키니즈|보스턴\s*테리어|복서|브뤼셀|그리폰|친|라사|카발리에|pug|bulldog|shih|pekingese|boston|boxer/i;
export function breedLooksBrachy(breed: string | null | undefined): boolean {
  return !!breed && BRACHY_RE.test(breed);
}

/** 나이(개월). 생년월일이 있으면 그 값, 없으면 나이(살) */
export function ageMonths(p: Pet, now = Date.now()): number | null {
  if (p.birthDate) {
    const b = new Date(p.birthDate + 'T00:00:00');
    if (!isNaN(b.getTime())) {
      const d = new Date(now);
      return Math.max(0, (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()) - (d.getDate() < b.getDate() ? 1 : 0));
    }
  }
  return p.ageYears != null ? p.ageYears * 12 : null;
}

/** 노령 시작 나이(살) — PetMD 체급별 기준(소형 10~12세, 대형·초대형 6~7세)을 앱 체급 3단계로 단순화 */
export const SENIOR_FROM_YEARS: Record<Pet['size'], number> = { small: 10, medium: 8, large: 7 };

/** 나이·체급으로 노령견 여부 제안(보호자가 확인). 나이를 모르면 null */
export function suggestSenior(p: Pet, now = Date.now()): boolean | null {
  const m = ageMonths(p, now);
  return m == null ? null : m >= SENIOR_FROM_YEARS[p.size] * 12;
}

export type AgeStage = 'puppy' | 'adult' | 'senior';
export const AGE_STAGE_LABEL: Record<AgeStage, string> = { puppy: '어린 강아지', adult: '성견', senior: '노령견' };
export function ageStage(p: Pet, now = Date.now()): AgeStage | null {
  const c = careOf(p);
  const m = ageMonths(p, now);
  if (c.senior === true) return 'senior';
  if (m != null && m < 12) return 'puppy';
  const sug = suggestSenior(p, now);
  if (c.senior == null && sug) return 'senior';
  return m != null || c.senior === false ? 'adult' : null;
}

/** 기준표에서 이 반려견에 해당하는 항목들(가장 짧은 간격이 추천값) */
export function guidelineItems(p: Pet, now = Date.now()): GuidelineItem[] {
  const c = careOf(p);
  const items: GuidelineItem[] = [];
  const stage = ageStage(p, now);
  const m = ageMonths(p, now);
  if (stage === 'puppy') {
    const min = m != null && m < 4 ? 60 : m != null && m < 8 ? 75 : 90;
    items.push({ id: 'puppy', label: '어린 강아지(1살 미만)', minutes: min, tip: '배변을 참을 수 있는 시간이 짧아요', source: SRC_AKC_PUPPY });
  } else if (stage === 'senior') {
    items.push({ id: 'senior', label: '노령견', minutes: 90, tip: '짧은 산책으로 관절이 굳지 않게', source: SRC_AKC_SENIOR });
  }
  const brachy = c.brachycephalic ?? breedLooksBrachy(p.breed);
  if (brachy) items.push({ id: 'brachy', label: '단두종', minutes: 90, tip: '더운 날 차 안 온도 확인 · 그늘에서 휴식', source: SRC_RVC });
  if (c.condition === 'joint-heart-resp') items.push({ id: 'cond-jhr', label: '질환 있음(관절·심장·호흡기)', minutes: 90, tip: '수의사가 정한 간격이 있으면 직접 입력해 최우선 적용', source: SRC_AAHA_DM });
  if (c.condition === 'kidney-diabetes') items.push({ id: 'cond-kd', label: '질환 있음(신장 질환·당뇨)', minutes: 60, tip: '수의사가 정한 간격이 있으면 직접 입력해 최우선 적용', source: SRC_AAHA_DM });
  if (items.length === 0 && stage === 'adult' && (c.condition === 'none' || c.condition == null)) {
    items.push({ id: 'adult', label: '성견 · 특이사항 없음', minutes: 120, tip: '배변 · 물 · 짧은 산책', source: SRC_MAFRA });
  }
  return items;
}

/** 기준표 추천값(해당 항목이 없으면 null) */
export function guidelineInterval(p: Pet, now = Date.now()): { minutes: number; items: GuidelineItem[] } | null {
  const items = guidelineItems(p, now);
  if (items.length === 0) return null;
  return { minutes: Math.min(...items.map((i) => i.minutes)), items };
}

/** 보호자가 직접 정한 간격인지(이전 버전 데이터: 기본값 90이 아니면 보호자 설정으로 간주) */
export function isGuardianInterval(p: Pet): boolean {
  const g = p.care?.guardianInterval;
  return g != null ? g : p.restIntervalMinutes > 0 && p.restIntervalMinutes !== APP_DEFAULT_INTERVAL;
}

/** 규칙 표: 추천 근거와 출처를 관리. effect가 'prompt'인 규칙은 간격을 바꾸지 않고 확인 안내만 합니다. */
export interface RestRule {
  id: string;
  when: (c: PetCare, p: Pet) => boolean;
  /** 'prompt' = 확인 안내만 / 'interval' = 간격 조정(전문가 검토 후에만 사용) */
  effect: 'prompt';
  message: (name: string) => string;
  source: string;
  /** 전문가(수의사) 검토 완료 여부 — false 인 규칙은 숫자 조정에 쓰지 않음 */
  expertReviewed: boolean;
}

const SRC_AAHA = 'AAHA “The Ultimate Guide to Traveling Safely with Your Pet” — 장거리 이동 시 몇 시간마다 쉬어 가기';
const SRC_AVMA = 'AVMA 반려동물 여행 안내 — 정해진 간격으로 정차, 멀미가 있으면 수의사와 상의';
const SRC_GUARDIAN = '보호자 입력';

export const REST_RULES: RestRule[] = [
  { id: 'vet-advice', when: (c) => !!c.vetAdvice.trim() || c.vetRestIntervalMinutes != null, effect: 'prompt', message: (n) => `${n}의 수의사 안내 내용을 출발 전에 한 번 더 확인해 주세요.`, source: SRC_GUARDIAN, expertReviewed: true },
  { id: 'health-notes', when: (c) => !!c.healthNotes.trim(), effect: 'prompt', message: (n) => `${n}의 건강 특이사항이 기록돼 있어요. 휴식 간격은 수의사와 상의해 정하는 걸 권해요.`, source: SRC_AAHA, expertReviewed: false },
  { id: 'motion-sickness', when: (c) => c.motionSickness === 'sometimes' || c.motionSickness === 'often', effect: 'prompt', message: (n) => `${n}${josa(n, '이', '가')} 차멀미를 한다고 기록했어요. 멀미 관리와 휴식 간격은 수의사와 상의해 보세요.`, source: SRC_AVMA, expertReviewed: false },
  { id: 'travel-anxiety', when: (c) => c.travelAnxiety === 'sometimes' || c.travelAnxiety === 'often', effect: 'prompt', message: (n) => `${n}${josa(n, '이', '가')} 차 이동을 불안해한다고 기록했어요. 필요하면 간격을 짧게 조정할 수 있어요.`, source: SRC_GUARDIAN, expertReviewed: false },
  { id: 'senior', when: (c, p) => (c.senior ?? suggestSenior(p)) === true, effect: 'prompt', message: (n) => `${n}${josa(n, '은', '는')} 노령견 기준으로 안내해요. 휴게소에서 짧게 걸으며 쉬어 가세요.`, source: SRC_AKC_SENIOR, expertReviewed: false },
  { id: 'brachy', when: (c, p) => (c.brachycephalic ?? breedLooksBrachy(p.breed)) === true, effect: 'prompt', message: (n) => `${n}${josa(n, '은', '는')} 단두종으로 기록돼 있어요. 더운 날에는 차 안 온도를 확인하고 그늘에서 쉬어 가세요.`, source: SRC_RVC, expertReviewed: false },
  { id: 'condition', when: (c) => c.condition === 'joint-heart-resp' || c.condition === 'kidney-diabetes', effect: 'prompt', message: (n) => `${n}의 건강 상태를 기록했어요. 수의사가 정한 간격이 있으면 그 간격을 입력해 주세요.`, source: SRC_GUARDIAN, expertReviewed: false },
];

export function careOf(p: Pet): PetCare {
  return { ...EMPTY_CARE, ...(p.care ?? {}) };
}

/** 케어 정보가 하나라도 있으면 true(음성 문구에 '여행 케어 설정' 표현 사용) */
export function hasCare(p: Pet): boolean {
  const c = careOf(p);
  return REST_RULES.some((r) => r.when(c, p));
}

export interface RestPolicy {
  intervalMinutes: number;
  basis: RestBasis;
  /** 간격을 정한 반려견(여러 마리 중 가장 짧은 간격) */
  petId: string | null;
  /** 사람이 읽는 결정 이유(기록용) */
  reasons: string[];
  /** 출발 전 확인 안내(간격을 바꾸지 않음) */
  prompts: { petId: string; ruleId: string; text: string; source: string }[];
  decidedAt: number;
}

const clamp = (m: number) => Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Math.round(m)));

/** 한 마리의 적용 간격과 근거 */
export function petInterval(p: Pet, now = Date.now()): { minutes: number; basis: RestBasis } {
  const c = careOf(p);
  if (c.vetRestIntervalMinutes != null && c.vetRestIntervalMinutes > 0) return { minutes: clamp(c.vetRestIntervalMinutes), basis: 'vet' };
  if (isGuardianInterval(p)) return { minutes: clamp(p.restIntervalMinutes), basis: 'guardian' };
  const g = guidelineInterval(p, now);
  if (g) return { minutes: clamp(g.minutes), basis: 'guideline' };
  return { minutes: APP_DEFAULT_INTERVAL, basis: 'app-default' };
}

/** 이번 여행의 휴식 정책: 함께하는 반려견 중 가장 짧은 간격, 이유·확인 안내 포함 */
export function resolveRestPolicy(pets: Pet[], now = Date.now()): RestPolicy {
  if (pets.length === 0) return { intervalMinutes: APP_DEFAULT_INTERVAL, basis: 'app-default', petId: null, reasons: ['반려견 정보가 없어 앱 기본값 사용'], prompts: [], decidedAt: now };
  const each = pets.map((p) => ({ p, ...petInterval(p, now) }));
  const pick = each.reduce((a, b) => (b.minutes < a.minutes || (b.minutes === a.minutes && b.basis === 'vet' && a.basis !== 'vet') ? b : a));
  const reasons = [`${pick.p.name}: ${BASIS_LABEL[pick.basis]} ${pick.minutes}분`];
  if (pick.basis === 'guideline') reasons.push(`기준표 항목: ${guidelineItems(pick.p, now).map((i) => `${i.label} ${i.minutes}분`).join(', ')}`);
  if (pets.length > 1) reasons.push(`함께하는 ${pets.length}마리 중 가장 짧은 간격 적용(${each.map((x) => `${x.p.name} ${x.minutes}분`).join(', ')})`);
  const prompts = pets.flatMap((p) => {
    const c = careOf(p);
    return REST_RULES.filter((r) => r.when(c, p)).map((r) => ({ petId: p.id, ruleId: r.id, text: r.message(callName(p.name)), source: r.source }));
  });
  return { intervalMinutes: pick.minutes, basis: pick.basis, petId: pick.p.id, reasons, prompts, decidedAt: now };
}

// ── 음성 안내 문구(측정·진단처럼 들리지 않게) ──
const subj = (name: string) => { const n = callName(name); return `${n}${josa(n, '이', '가')}`; };

export function restSoonVoice(petName: string): string {
  return `곧 ${subj(petName)} 쉬어갈 시간이에요.`;
}

export function restDueVoice(petName: string, care: boolean): string {
  return care
    ? `${callName(petName)}의 여행 케어 설정을 고려하면 잠시 쉬어가는 게 좋겠어요. 가까운 휴식지를 안내할까요?`
    : `${subj(petName)} 쉬어갈 시간이네요. 가까운 휴식 장소를 찾아볼까요?`;
}

/** 경로 근처 장소 안내 — 동반 가능이 확인된 경우에만 '동반 가능'이라고 말함 */
export function placeFoundVoice(petFriendlyConfirmed: boolean): string {
  return petFriendlyConfirmed
    ? '경로 근처에 반려견 동반이 가능한 휴식 장소가 있어요. 경유지로 추가할까요?'
    : '경로 근처에 휴식 장소가 있어요. 반려견 동반 여부는 확인이 필요해요.';
}

/** 화면 문구(주행 중 최소 정보) */
export function restDueTitle(petName: string): string {
  return `${subj(petName)} 쉬어갈 시간이에요`;
}

// ── 기록 ──
export type RestRecoResponse = 'find' | 'later' | 'rest' | 'none';
export interface RestRecoEntry { at: number; kind: 'soon' | 'due'; intervalMinutes: number; basis: RestBasis; drivenMinutes: number; response: RestRecoResponse }
export type IntervalChangeReason = 'pet-condition' | 'vet' | 'schedule' | 'other';
export const CHANGE_REASON_LABEL: Record<IntervalChangeReason, string> = { 'pet-condition': '반려견 상태', vet: '수의사 안내', schedule: '도로·일정', other: '기타' };
export interface IntervalChange { at: number; from: number; to: number; reason: IntervalChangeReason }
