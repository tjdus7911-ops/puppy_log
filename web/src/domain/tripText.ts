// 자동 여행 제목과 기본 템플릿 여행 일기.
// 원칙: 실제 기록에 없는 장소를 만들지 않고, 반려견의 감정·건강을 단정하지 않습니다.
import { CATEGORY_LABEL, type PlaceCategory } from './models';
import { formatDuration, formatKoreanDate } from './format';

/** 받침 유무로 "와/과", "이/가" 등을 고릅니다. */
export function josa(word: string, withBatchim: string, without: string): string {
  const last = word.trim().charCodeAt(word.trim().length - 1);
  if (last < 0xac00 || last > 0xd7a3) return without;
  return (last - 0xac00) % 28 !== 0 ? withBatchim : without;
}

/** "사슴" → "사슴이", "코코" → "코코" (부르는 이름) */
export function callName(name: string): string {
  return josa(name, `${name}이`, name);
}

export function petNames(names: string[]): string {
  const called = names.map(callName);
  if (called.length <= 1) return called[0] ?? '우리 강아지';
  if (called.length === 2) return `${called[0]}${josa(called[0], '과', '와')} ${called[1]}`;
  return `${called.slice(0, -1).join(', ')}, ${called[called.length - 1]}`;
}

const COAST = ['강릉', '속초', '양양', '동해', '삼척', '부산', '여수', '통영', '거제', '태안', '보령', '포항', '울진', '영덕', '제주', '서귀포', '남해', '목포'];

export interface TitleInput {
  petNames: string[];
  destinationName: string | null;
  endRegionShort: string | null;
  startTime: number;
}

export function autoTitle(t: TitleInput): string {
  const who = petNames(t.petNames);
  const withJosa = `${who}${josa(who, '과', '와')}`;
  const place = (t.destinationName?.trim() || t.endRegionShort || '').trim();
  if (place && place !== '어딘가') {
    const theme = COAST.some((c) => place.includes(c)) ? ' 바다 여행' : ' 여행';
    return `${withJosa} ${place}${theme}`;
  }
  return `${formatKoreanDate(t.startTime)}, ${withJosa} 달린 길`;
}

export interface DiaryInput {
  petNames: string[];
  startTime: number;
  startRegion: string | null;
  endRegion: string | null;
  distanceKm: number;
  drivingSec: number;
  elapsedSec: number;
  restCount: number;
  places: { name: string; category: PlaceCategory; isSample: boolean }[];
  photoCount: number;
  memo: string;
  /** v2: 돌아오는 길을 기록했는지와 그 거리 */
  returnLeg?: { distanceKm: number; drivingSec: number } | null;
  /** v2: 사용자가 직접 쓴 장소 메모·사진 메모(사실 그대로 인용) */
  placeNotes?: { name: string; memo: string }[];
  photoNotes?: string[];
}

export function templateDiary(d: DiaryInput): string {
  const who = petNames(d.petNames);
  const withJosa = `${who}${josa(who, '과', '와')}`;
  const lines: string[] = [];
  const dest = d.endRegion && d.endRegion !== '어딘가' ? d.endRegion : null;
  const from = d.startRegion && d.startRegion !== '어딘가' ? d.startRegion : null;

  if (dest && from && dest !== from) lines.push(`${formatKoreanDate(d.startTime)}, ${withJosa} 함께 ${from}에서 ${dest}까지 달렸다.`);
  else if (dest) lines.push(`${formatKoreanDate(d.startTime)}, ${withJosa} 함께 ${dest}${josa(dest, '으로', '로')} 떠났다.`);
  else lines.push(`${formatKoreanDate(d.startTime)}, ${withJosa} 함께 길을 나섰다.`);

  const dist = d.distanceKm >= 1 ? `${Math.round(d.distanceKm)}km` : `${(d.distanceKm * 1000).toFixed(0)}m`;
  const restPart =
    d.restCount === 0
      ? '중간에 따로 쉬어가지는 않았다'
      : d.restCount === 1
        ? '중간에 한 번 쉬어갔다'
        : `중간에 ${d.restCount}번 쉬어갔다`;
  lines.push(`차를 타고 ${dist}를 이동하는 동안 실제로 달린 시간은 ${formatDuration(d.drivingSec)}이었고, ${restPart}.`);

  const real = d.places.filter((p) => !p.isSample);
  if (real.length > 0) {
    const list = real.slice(0, 4).map((p) => `${p.name}(${CATEGORY_LABEL[p.category]})`).join(', ');
    lines.push(`이번 여행에서 ${list}에 들렀다.`);
  }
  const notes = (d.placeNotes ?? []).filter((n) => n.memo.trim());
  if (notes.length) lines.push(notes.slice(0, 3).map((n) => `${n.name}에서 남긴 메모: “${n.memo.trim()}”`).join('\n'));
  if (d.photoCount > 0) lines.push(`함께 남긴 사진은 ${d.photoCount}장이다.`);
  const pn = (d.photoNotes ?? []).filter((x) => x.trim());
  if (pn.length) lines.push(`사진에 적어 둔 말: ${pn.slice(0, 3).map((x) => `“${x.trim()}”`).join(', ')}`);
  if (d.memo.trim()) lines.push(`여행 메모: ${d.memo.trim()}`);
  if (d.returnLeg) {
    const rd = d.returnLeg.distanceKm >= 1 ? `${Math.round(d.returnLeg.distanceKm)}km` : `${Math.round(d.returnLeg.distanceKm * 1000)}m`;
    lines.push(`돌아오는 길도 ${rd}를 기록하며 집까지 함께 왔다.`);
  }
  lines.push(`${withJosa} 함께한 오늘의 길도 오래 기억하고 싶은 하루로 남겨 둔다.`);
  return lines.join('\n\n');
}
