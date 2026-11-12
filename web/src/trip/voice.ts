// 음성 명령. 지원 브라우저(Web Speech API SpeechRecognition)에서는 실제 인식, 아니면 데모 버튼으로 같은 명령 실행.
// Android(Pleos)에서는 SpeechToText SDK 또는 Android SpeechRecognizer 로 교체합니다.
// 기획서 5장 SpeechToText 예시: "응 / 괜찮아"(장소 제안 응답, autoReco.parseYesNo), "휴식 시작", "나중에 알려줘", "주변 휴식 장소 찾아줘"
export type VoiceIntent = 'rest-area' | 'cafe' | 'rest-left' | 'rest-start' | 'later' | 'unknown';

export function parseIntent(text: string): VoiceIntent {
  const t = text.replace(/\s/g, '');
  if (/휴식.*(얼마|남|언제)/.test(t)) return 'rest-left';
  if (/나중에|이따|조금있다|좀있다/.test(t)) return 'later';
  if (/휴식(을)?(시작|할게|하자)|쉬자|쉴게/.test(t)) return 'rest-start';
  if (/휴식(장소|지)|쉴곳|쉬어갈곳/.test(t)) return 'rest-area';
  if (/휴게소|쉼터/.test(t)) return 'rest-area';
  if (/카페|커피/.test(t)) return 'cafe';
  return 'unknown';
}

type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};

export function speechRecognitionSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return typeof window !== 'undefined' && !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function listenOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { reject(new Error('unsupported')); return; }
    const r = new Ctor();
    r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
    let done = false;
    r.onresult = (e) => { done = true; resolve(e.results[0][0].transcript); };
    r.onerror = (e) => { done = true; reject(new Error(e.error)); };
    r.onend = () => { if (!done) reject(new Error('no-speech')); };
    try { r.start(); } catch (e) { reject(e as Error); }
  });
}
