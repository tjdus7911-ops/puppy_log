# 외부 데이터 연동 조사 (2026-11-11)

원칙: **확인되지 않은 데이터는 실제 정보처럼 표시하지 않는다.** 데모·샘플은 항상 배지로 구분한다.

## 1. 차량·내비게이션 (Pleos Connect SDK)
| 필요한 데이터 | 제공 여부(공식 문서 기준) | 멍로드 구현 |
|---|---|---|
| 목적지 설정·확인·취소 | **제공** — NaviHelper | Android: `PleosBindings` 호출부 TODO(verify-sdk) / 웹: 앱에서 목적지 직접 설정 |
| 경유지 추가·조회·삭제 | **제공** — NaviHelper | 휴식 장소 선택 시 경유지 추가 → 실패 시 목적지 전달 → 실패 시 카카오맵 앱 |
| 경로·주행 상태 이벤트 | **제공** — NaviHelper 이벤트(NaviHelperEventListener) | 동일(TODO) |
| 남은 거리·예상 도착 | 데이터 클래스 `RouteInfo`, `DrivingInfo`, `TBTInfo` 존재 확인, **필드 미확인** | 데모: 남은 경로 거리/평균 속도로 '추정' 표기 |
| 교통 이벤트·정체 | 데이터 클래스 `TrafficEventInfo`, `TrafficCongestionInfo`, `TrafficStatus` 존재 확인, **필드·제공 범위 미확인** | AAR 확인 후 `TrafficInfoProvider` 구현체로 추가 예정 |
| 주행 거리·시간 | Vehicle SDK `Odometer` 도메인: 총 거리, 트립 거리/시간 조회 | 현재는 앱 엔진이 GPS 로 계산(신호 대기·정체는 주행 시간에서 제외) |
| 기어(주차 상태)·차속 | AAOS 표준 `GEAR_SELECTION`, `PERF_VEHICLE_SPEED` (Pleos 정책: 표준 API 우선) | `PleosVehicleDataProvider` (CarPropertyManager) |
| 현재 위치 | FusedLocation SDK (차종별 `isSupported`) | 현재는 Android LocationManager |
| 음성 합성/인식 | TextToSpeech / SpeechToText SDK | 현재는 Android TTS·SpeechRecognizer(웹: Web Speech API) |

출처: document.pleos.ai — NaviHelper Introduction, API Compatibility & Availability, Vehicle SDK Introduction, Pleos Connect SDK Overview.
NaviHelper 의 클래스 목록은 공식 API Reference 사이드바에서 확인했고, 메서드 시그니처는 이 환경에서 열람하지 못해 `scripts/dump-pleos-api.sh` 로 AAR 에서 확인하도록 했습니다.

## 2. 도로 위험 정보
| 출처 | 사고 | 공사 | 낙하물 | 정체 | 방식 | 비고 |
|---|---|---|---|---|---|---|
| **ITS 국가교통정보센터 돌발상황정보** | ✅ acc | ✅ cor | △ 별도 유형 없음 → ete(기타돌발)·세부유형/메시지에 포함될 때만 | ✗ | REST, 경위도 범위 조회 | 요청: type, eventType, minX~maxY / 출력: eventType, eventDetailType, coordX/Y, roadName, lanesBlockType, lanesBlocked, message, startDate, endDate. **서버 `/api/traffic` 구현** |
| ITS 교통소통정보 | | | | ✅ 링크별 속도 | REST | 정체 구간 표시용 후보(미구현) |
| 국토교통부 재난상황정보(data.go.kr) | | | | | REST | 침수·땅꺼짐 등 통제 정보, 차단 차로 |
| 지자체 돌발정보(서울 TOPIS, 대구 등) | ✅ | ✅ | | ✅ | REST | 지역 한정 |
| **카카오맵 JS 교통정보 레이어** | | | | ✅ 지도 위 표시 | 지도 SDK 레이어 | 웹 대시보드 지도 도구의 '교통' 버튼(키 설정 시). 데이터 추출은 불가, 표시만 |
| Pleos NaviHelper `TrafficEventInfo` 등 | ? | ? | ? | ? | 차량 SDK | 필드 확인 필요 — 확인되면 1순위 |

확인해야 할 것(인증키 발급 후): 갱신 주기, 공공누리 유형(상업적 이용·재표시 허용 여부), 일일 호출 한도.
**낙하물**은 공개 API 에서 독립 유형으로 확인하지 못했습니다 → 실데이터 모드에서는 메시지·세부유형에 '낙하물'이 있을 때만 낙하물로 분류하고, 없으면 표시하지 않습니다.

## 3. 반려견 동반 장소
| 출처 | 동반 가능 여부 | 비고 |
|---|---|---|
| 카카오 로컬 키워드 검색 | **제공 안 함** | 키워드 '애견동반 카페'로 찾아도 동반 가능으로 표시하지 않고 '확인 필요'. 결과의 별도 저장은 약관상 제한될 수 있음(실시간 호출 원칙) → 방문 기록은 사용자가 '들렀어요'를 누른 장소 이름만 저장, 정책 확인 필요 |
| 한국관광공사 반려동물 동반여행 공공 API(후보) | 제공(동반 유형·조건 필드) | 미구현. 동반 조건 표시의 실데이터 후보 |
| 샘플 데이터 | 가상 | 개발·데모 전용, '샘플' 배지 |

## 4. 지도
| 플랫폼 | SDK | 키 | 상태 |
|---|---|---|---|
| 웹 | 카카오맵 JavaScript SDK | JavaScript 키 + SDK 도메인 등록 | 코드 구현, **키 없이 미검증** (키가 없거나 실패하면 '개요 지도' 배지와 함께 대체) |
| Android | 카카오맵 Android SDK v2 (`com.kakao.maps.open:android`) | 네이티브 앱 키 + 패키지명·키 해시 | 코드 구현(플래그), **미빌드** · arm64/armv7 전용 |
