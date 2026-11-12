// 음성 안내. 웹: Web Speech API / Android: Pleos TextToSpeech SDK(또는 Android TextToSpeech)로 교체합니다.
//
// 주행 중 알림 원칙(기획서 3장): 안전(돌발) → 반려견 휴식 → 동반 장소 추천 순으로, 한 번에 하나만 말합니다.
//  - 더 중요한 안내가 재생 중이면 덜 중요한 안내는 기다렸다가 재생하고, 30초가 지나면 버립니다.
//  - 같거나 더 중요한 안내는 지금 안내를 끊고 바로 재생합니다.
//  - 방향지시등 작동·차량 경고 중에는 새 안내를 미루고(setSpeechHold), 끝나면 이어서 재생합니다.
//  - 내비 음성과 겹치지 않게 하는 처리는 차량에서 Pleos 오디오 포커스 정책으로 합니다(웹은 해당 없음).
export type SpeechPriority = 'safety' | 'rest' | 'place' | 'info';
export const SPEECH_RANK: Record<SpeechPriority, number> = { safety: 0, rest: 1, place: 2, info: 3 };
export const QUEUE_TTL_MS = 30_000;

/** 지금 재생 중인 안내(rank)가 있을 때 새 안내를 바로 재생할지, 기다릴지 */
export function arbitrate(playingRank: number | null, nextRank: number): 'play' | 'queue' {
  return playingRank == null || nextRank <= playingRank ? 'play' : 'queue';
}

interface Pending { text: string; rank: number; at: number }
let playing: { u: SpeechSynthesisUtterance; rank: number } | null = null;
let queue: Pending[] = [];
/** 방향지시등 작동·차량 경고 중에는 새 안내를 미룸(기획서 3장) */
let held = false;

/** 휴대폰 화면에서는 주행 안내 음성을 내지 않음(차량 앱이 안내) */
let muted = false;
export function setSpeechMuted(m: boolean) {
  muted = m;
  if (m) { queue = []; synth()?.cancel(); playing = null; }
}

export function setSpeechHold(hold: boolean) {
  if (held === hold) return;
  held = hold;
  const s = synth();
  if (!hold && s && !s.speaking) playNext();
}

export function isSpeechHeld(): boolean {
  return held;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function play(text: string, rank: number) {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 1;
  const done = () => { if (playing?.u !== u) return; playing = null; playNext(); };
  u.onend = done;
  u.onerror = done;
  playing = { u, rank };
  s.cancel();
  s.speak(u);
}

function playNext() {
  if (held) return;
  const now = Date.now();
  queue = queue.filter((q) => now - q.at < QUEUE_TTL_MS).sort((a, b) => a.rank - b.rank);
  const n = queue.shift();
  if (n) play(n.text, n.rank);
}

export function speak(text: string, priority: SpeechPriority = 'info') {
  try {
    const s = synth();
    if (!s || muted) return;
    const rank = SPEECH_RANK[priority];
    const playingRank = playing && s.speaking ? playing.rank : null;
    if (held || arbitrate(playingRank, rank) === 'queue') {
      queue = [...queue.filter((q) => q.text !== text), { text, rank, at: Date.now() }].slice(-3);
      return;
    }
    play(text, rank);
  } catch {
    // 음성 안내 실패는 화면 안내로 대체되므로 무시합니다.
  }
}
