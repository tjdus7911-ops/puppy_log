// 커뮤니티(향후 확장) 데이터 모델. 현재는 서버가 없으므로 예시 게시물만 로컬에서 보여줍니다.
// 개인정보 원칙: 정확한 실시간 위치·개인 이동 경로는 기본 공개하지 않음(region 은 시·군 단위만).
export type PostKind = 'review' | 'buddy' | 'meetup' | 'place-review';

export interface CommunityAuthor { id: string; nickname: string }

export interface CommunityPost {
  id: string;
  kind: PostKind;
  author: CommunityAuthor;
  createdAt: number;
  title: string;
  body: string;
  region: string | null; // 시·군 단위
  tripId: string | null; // 공유한 여행(경로는 제외하고 요약만)
  likeCount: number;
  commentCount: number;
  isExample: boolean; // 예시 게시물 표시
}

export interface Meetup { postId: string; date: string; placeName: string; capacity: number; joined: number; requiresApproval: boolean }
export interface Report { postId: string; reason: 'spam' | 'abuse' | 'privacy' | 'other'; createdAt: number }
export interface Block { userId: string; createdAt: number }

export const POST_KIND_LABEL: Record<PostKind, string> = {
  review: '여행 후기', buddy: '멍친구 찾기', meetup: '모임', 'place-review': '장소 후기',
};

const H = 3600_000;
export function examplePosts(now = Date.now()): CommunityPost[] {
  return [
    { id: 'ex1', kind: 'buddy', author: { id: 'u1', nickname: '예시·멍여행러' }, createdAt: now - 2 * H, title: '강릉에서 산책할 멍친구 구해요!', body: '오늘 오후 강릉 해변 산책로에서 함께 산책할 친구 있을까요? 소형견도 좋아요!', region: '강릉', tripId: null, likeCount: 32, commentCount: 8, isExample: true },
    { id: 'ex2', kind: 'review', author: { id: 'u2', nickname: '예시·코코네' }, createdAt: now - 26 * H, title: '서울 → 속초, 휴게소 두 번 쉬어간 후기', body: '90분 간격으로 쉬었더니 이동이 한결 편했어요. 휴게소 반려견 쉼터는 방문 전 운영 여부를 꼭 확인하세요.', region: '속초', tripId: null, likeCount: 18, commentCount: 3, isExample: true },
    { id: 'ex3', kind: 'meetup', author: { id: 'u3', nickname: '예시·대형견모임' }, createdAt: now - 50 * H, title: '주말 양평 대형견 산책 모임', body: '토요일 오전, 인원 6명. 참여 신청 후 승인제로 운영해요.', region: '양평', tripId: null, likeCount: 9, commentCount: 5, isExample: true },
  ];
}
