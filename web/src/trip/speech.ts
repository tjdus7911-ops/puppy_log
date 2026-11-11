// 음성 안내. 웹: Web Speech API / Android: Pleos TextToSpeech SDK(또는 Android TextToSpeech)로 교체합니다.
export function speak(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // 음성 안내 실패는 화면 안내로 대체되므로 무시합니다.
  }
}
