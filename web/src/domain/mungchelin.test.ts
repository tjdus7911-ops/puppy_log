// 멍슐랭 후기: 요약·집계·공식 정보 보완(공식 값 우선)
import { describe, expect, it } from 'vitest';
import { aggregateReviews, EMPTY_REVIEW, hasReview, reviewLine, supplement, type MungReview } from './mungchelin';

const r = (o: Partial<MungReview>): MungReview => ({ ...EMPTY_REVIEW, at: 1, ...o });

describe('멍슐랭 후기', () => {
  it('아무것도 고르지 않으면 후기가 아님', () => {
    expect(hasReview(EMPTY_REVIEW)).toBe(false);
    expect(hasReview({ ...EMPTY_REVIEW, comment: '테라스만 가능' })).toBe(true);
  });
  it('한 줄 요약', () => {
    expect(reviewLine(r({ smallDog: true, indoor: false, parking: true }))).toBe('소형견 가능 · 실내 불가 · 주차 편리');
  });
  it('장소 이름으로 집계(공백 무시)', () => {
    const list = [
      { placeName: '꼬순내 화덕', review: r({ smallDog: true, parking: true, comment: '테라스 좋아요' }) },
      { placeName: '꼬순내화덕', review: r({ smallDog: true, parking: false }) },
      { placeName: '다른 곳', review: r({ smallDog: false }) },
    ];
    const a = aggregateReviews(list, '꼬순내 화덕')!;
    expect(a.count).toBe(2);
    expect(a.items.smallDog).toEqual({ yes: 2, no: 0 });
    expect(a.comments).toEqual(['테라스 좋아요']);
  });
  it('공식 정보가 있으면 공식 값, 없을 때만 보호자 후기로 보완', () => {
    const a = aggregateReviews([{ placeName: 'A', review: r({ parking: true }) }], 'A');
    expect(supplement(false, a, 'parking')).toEqual({ label: '불가', from: 'official' });
    expect(supplement(null, a, 'parking')).toEqual({ label: '가능 (보호자 후기 1건)', from: 'review' });
    expect(supplement(null, null, 'parking')).toEqual({ label: '확인 필요', from: 'none' });
  });
});
