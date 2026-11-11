# 여행 라이프사이클 (v0.3)

웹(`web/src/trip/TripController.ts`)이 기준 구현이고, Android(Room v2)는 같은 구조를 따릅니다(Android는 아직 미빌드).

## 단계
```
PREPARING ──출발──▶ OUTBOUND(가는 길) ──목적지 도착──▶ AT_DESTINATION(여행지 활동)
                                                       │  ▲
                                   다른 장소로 이동 ───┘  └── 도착 (OUTBOUND, leg=EXTRA)
AT_DESTINATION ──돌아가는 길 기록 시작──▶ RETURNING ──집 도착──▶ COMPLETED
AT_DESTINATION ──여행 마무리(돌아오는 길 생략)──────────────────▶ COMPLETED
OUTBOUND ──여기서 여행 완료(편도)───────────────────────────────▶ COMPLETED
```
- **도착은 종료가 아닙니다.** 여행지에서 사진·장소·메모를 남기고, 필요하면 추가 이동이나 돌아오는 길을 기록합니다.
- COMPLETED 이후에도 사진·메모·일기·제목은 계속 수정할 수 있으며, 이동 통계는 바뀌지 않습니다.
- 진행 중 여행은 하나만 허용합니다(중복 시작 방지).

## 데이터 구조
| 엔티티 | 핵심 필드 |
|---|---|
| Trip(여행) | `phase`, `status`('ended' = 완료), `arrivedAt`, `returnStartedAt`, `endLocation`(= **목적지**, 발도장 기준), 합계(`totalDistanceKm`, `drivingDurationSeconds`) = 완료된 구간 합, `syncState: 'local-only'` |
| DriveLeg(주행 구간) | `kind`: outbound · extra · return, 구간별 거리·주행/전체 시간·휴식 수·시작/끝 위치 |
| RestSession | `legId`(어느 구간의 휴식인지). 휴식은 사용자가 명시적으로 시작할 때만 |
| VisitedPlace | `source`: search(검색) · user(여행지에서 직접 기록), `memo` |
| TripPhoto | `order`(앨범 순서), `memo` |
| ActiveTripSnapshot | `phase`, `leg`, 엔진 상태, 데모 시뮬레이터 상태, `meta.base`(끝난 구간 합계), `lastPosition` → 재실행 복원 |

### 합계 규칙
진행 중 표시 = `meta.base`(끝난 구간 합) + 현재 엔진 값. 구간을 닫는 순간 base 에 더하고 **엔진을 즉시 분리**합니다(자동 저장과 겹쳐 이중 합산되던 문제를 v0.3 테스트에서 발견·수정).

## 저장소 버전
- 웹 IndexedDB v2 / Android Room v2. v1 데이터는 지우지 않고 변환합니다: 종료된 여행 → `completed` + `migrated-<id>` 가는 길 구간 1개, 사진 순서 = 촬영 순.

## 동기화
차량 앱 ↔ 모바일 앱 동기화는 **미구현**입니다(서버 없음). 서버를 붙일 때는 `updatedAt` 기준 병합, `syncState` 를 'local-only' → 'synced' 로 바꾸는 방식을 전제로 필드만 마련해 두었습니다.
