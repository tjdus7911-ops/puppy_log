// 음성 명령 해석과 주행 중 음성 안내 우선순위(기획서 3·5장)
import { describe, expect, it } from 'vitest';
import { parseIntent } from './voice';
import { arbitrate, SPEECH_RANK } from './speech';

describe('음성 명령', () => {
  it.each([
    ['주변 휴식 장소 찾아줘', 'rest-area'],
    ['가까운 휴게소 찾아줘', 'rest-area'],
    ['휴식 시작', 'rest-start'],
    ['나중에 알려줘', 'later'],
    ['다음 휴식까지 얼마나 남았어', 'rest-left'],
    ['근처 카페', 'cafe'],
    ['노래 틀어줘', 'unknown'],
  ])('“%s” → %s', (text, intent) => {
    expect(parseIntent(text)).toBe(intent);
  });
});

describe('알림 우선순위: 안전 → 휴식 → 장소 추천, 한 번에 하나', () => {
  it('재생 중인 안내가 없으면 바로 재생', () => {
    expect(arbitrate(null, SPEECH_RANK.place)).toBe('play');
  });
  it('돌발(안전) 안내 중에는 휴식·장소 안내가 기다림', () => {
    expect(arbitrate(SPEECH_RANK.safety, SPEECH_RANK.rest)).toBe('queue');
    expect(arbitrate(SPEECH_RANK.safety, SPEECH_RANK.place)).toBe('queue');
  });
  it('장소 추천 중 돌발 안내가 오면 끊고 바로 재생', () => {
    expect(arbitrate(SPEECH_RANK.place, SPEECH_RANK.safety)).toBe('play');
    expect(arbitrate(SPEECH_RANK.place, SPEECH_RANK.rest)).toBe('play');
  });
});

import { distancePhrase, hazardVoice } from '../traffic/TrafficInfoProvider';

describe('반려견 동승 기준 돌발 안내', () => {
  it('거리 + 반려견 이름 + 감속 권고', () => {
    expect(hazardVoice({ type: 'construction', provenance: 'real' }, 1.1, '사슴이가')).toBe('1km 앞 공사 구간이에요. 사슴이가 타고 있으니 미리 속도를 줄여 주세요.');
  });
  it('정체 앞에 휴게소가 있으면 쉬어 가기 제안', () => {
    expect(hazardVoice({ type: 'congestion', provenance: 'real' }, 3.2, '초코가', '횡성휴게소')).toContain('정체 전에 횡성휴게소에서 쉬어 가는 건 어떨까요?');
  });
  it('데모 정보는 데모라고 먼저 말함', () => {
    expect(hazardVoice({ type: 'accident', provenance: 'demo' }, 0.6, null)).toMatch(/^데모 정보입니다\. 600m 앞/);
  });
  it('거리 표기', () => {
    expect(distancePhrase(0.04)).toBe('100m 앞');
    expect(distancePhrase(2.3)).toBe('2.5km 앞');
  });
});
