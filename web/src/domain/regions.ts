// 오프라인 지역 판정용 시·군 대표 좌표표(근사값).
// 역지오코딩 API 없이도 "출발/도착 지역", "발도장"을 만들기 위한 MVP용 데이터입니다.
// 가장 가까운 대표 좌표를 고르는 방식이라 경계 부근에서는 실제 행정구역과 다를 수 있습니다.
// Android 단계에서는 Geocoder 또는 지도 SDK의 역지오코딩으로 교체합니다.
import type { GeoPoint } from './models';
import { haversineKm } from './geo';

export interface Region {
  id: string;
  province: string;
  name: string; // 표시용 짧은 이름 (예: 강릉)
  latitude: number;
  longitude: number;
}

const R = (id: string, province: string, name: string, latitude: number, longitude: number): Region => ({
  id, province, name, latitude, longitude,
});

export const REGIONS: Region[] = [
  R('seoul', '서울', '서울', 37.5665, 126.978),
  R('incheon', '인천', '인천', 37.4563, 126.7052),
  R('suwon', '경기', '수원', 37.2636, 127.0286),
  R('seongnam', '경기', '성남', 37.42, 127.1267),
  R('goyang', '경기', '고양', 37.6584, 126.832),
  R('yongin', '경기', '용인', 37.2411, 127.1776),
  R('hanam', '경기', '하남', 37.5393, 127.2148),
  R('gwangju-gg', '경기', '경기 광주', 37.4294, 127.2551),
  R('icheon', '경기', '이천', 37.272, 127.435),
  R('yeoju', '경기', '여주', 37.2983, 127.6375),
  R('yangpyeong', '경기', '양평', 37.4917, 127.4875),
  R('gapyeong', '경기', '가평', 37.8315, 127.5105),
  R('paju', '경기', '파주', 37.76, 126.78),
  R('pyeongtaek', '경기', '평택', 36.9921, 127.1129),
  R('anseong', '경기', '안성', 37.008, 127.2797),
  R('namyangju', '경기', '남양주', 37.636, 127.2165),
  R('pocheon', '경기', '포천', 37.8949, 127.2003),
  R('chuncheon', '강원', '춘천', 37.8813, 127.7298),
  R('wonju', '강원', '원주', 37.3422, 127.9202),
  R('hoengseong', '강원', '횡성', 37.4917, 127.985),
  R('hongcheon', '강원', '홍천', 37.6969, 127.8885),
  R('pyeongchang', '강원', '평창', 37.3708, 128.39),
  R('daegwallyeong', '강원', '평창 대관령', 37.6772, 128.7186),
  R('gangneung', '강원', '강릉', 37.7519, 128.8761),
  R('sokcho', '강원', '속초', 38.207, 128.5918),
  R('yangyang', '강원', '양양', 38.0754, 128.6191),
  R('donghae', '강원', '동해', 37.5247, 129.1143),
  R('samcheok', '강원', '삼척', 37.4499, 129.1652),
  R('jeongseon', '강원', '정선', 37.3807, 128.6608),
  R('yeongwol', '강원', '영월', 37.1837, 128.4617),
  R('taebaek', '강원', '태백', 37.1641, 128.9856),
  R('inje', '강원', '인제', 38.0697, 128.1707),
  R('cheongju', '충북', '청주', 36.6424, 127.489),
  R('chungju', '충북', '충주', 36.991, 127.9259),
  R('jecheon', '충북', '제천', 37.1326, 128.191),
  R('danyang', '충북', '단양', 36.9845, 128.3655),
  R('daejeon', '대전', '대전', 36.3504, 127.3845),
  R('sejong', '세종', '세종', 36.48, 127.289),
  R('cheonan', '충남', '천안', 36.8151, 127.1139),
  R('asan', '충남', '아산', 36.7898, 127.0018),
  R('taean', '충남', '태안', 36.7456, 126.2979),
  R('boryeong', '충남', '보령', 36.3333, 126.6128),
  R('gongju', '충남', '공주', 36.4465, 127.119),
  R('jeonju', '전북', '전주', 35.8242, 127.148),
  R('gunsan', '전북', '군산', 35.9676, 126.7366),
  R('namwon', '전북', '남원', 35.4164, 127.3904),
  R('gwangju', '광주', '광주', 35.1595, 126.8526),
  R('mokpo', '전남', '목포', 34.8118, 126.3922),
  R('yeosu', '전남', '여수', 34.7604, 127.6622),
  R('suncheon', '전남', '순천', 34.9507, 127.4872),
  R('damyang', '전남', '담양', 35.3211, 126.9882),
  R('daegu', '대구', '대구', 35.8714, 128.6014),
  R('andong', '경북', '안동', 36.5684, 128.7294),
  R('gyeongju', '경북', '경주', 35.8562, 129.2247),
  R('pohang', '경북', '포항', 36.019, 129.3435),
  R('uljin', '경북', '울진', 36.993, 129.4004),
  R('yeongdeok', '경북', '영덕', 36.415, 129.3655),
  R('busan', '부산', '부산', 35.1796, 129.0756),
  R('ulsan', '울산', '울산', 35.5384, 129.3114),
  R('changwon', '경남', '창원', 35.2281, 128.6811),
  R('tongyeong', '경남', '통영', 34.8544, 128.4331),
  R('geoje', '경남', '거제', 34.8806, 128.6211),
  R('namhae', '경남', '남해', 34.8377, 127.8924),
  R('jinju', '경남', '진주', 35.18, 128.1076),
  R('jeju', '제주', '제주', 33.4996, 126.5312),
  R('seogwipo', '제주', '서귀포', 33.2541, 126.56),
];

/** 반경 maxKm 이내에서 가장 가까운 지역. 해외·바다 한가운데 등은 null */
export function nearestRegion(p: GeoPoint, maxKm = 45): Region | null {
  let best: Region | null = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = haversineKm(p, r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return bestD <= maxKm ? best : null;
}

export function regionLabel(p: GeoPoint | null | undefined): string {
  if (!p) return '알 수 없는 지역';
  const r = nearestRegion(p);
  return r ? (r.province === r.name ? r.name : `${r.province} ${r.name}`) : '알 수 없는 지역';
}

export function regionShort(p: GeoPoint | null | undefined): string {
  if (!p) return '어딘가';
  return nearestRegion(p)?.name ?? '어딘가';
}

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}
