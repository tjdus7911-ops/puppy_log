// 내비게이션 연결. 웹 프로토타입은 카카오맵 길찾기 링크를 새 창으로 엽니다.
// Android(Pleos Connect)에서는 NaviHelper SDK 로 내장 내비에 목적지/경유지를 넘기도록 교체합니다.
export function openNavigation(name: string, lat: number, lng: number, isSample: boolean): { ok: boolean; message?: string } {
  if (isSample) return { ok: false, message: '샘플 장소라 실제 길 안내는 할 수 없어요.' };
  const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  const w = window.open(url, '_blank', 'noopener');
  return w ? { ok: true } : { ok: false, message: '새 창을 열 수 없어요. 팝업 차단을 확인해 주세요.' };
}
