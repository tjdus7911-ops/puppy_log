# Pleos Connect SDK 조사 메모

> 2026-11-12: 실제 AAR 의 public API 로 시그니처를 확인했어요 → [PLEOS_SDK_API.md](PLEOS_SDK_API.md). 아래 'TODO(verify-sdk)' 항목 중 NaviHelper·Vehicle(창문·문·에어컨·방향지시등)·TTS 는 해결됐습니다.

조사일 2026-11-11. 공식 문서(document.pleos.ai, pleos.ai/playground) 중 이 개발 환경에서 열람 가능했던 범위만 정리했습니다.
**문서에서 확인하지 못한 함수·필드는 코드에 쓰지 않았고**, 필요한 곳은 `TODO(verify-sdk)`로 남겼습니다.

## 공식 문서에서 확인한 사항
| 항목 | 내용 | 출처 |
|---|---|---|
| 구성 | Vehicle, NaviHelper, TextToSpeech, SpeechToText, ADAS, Fused Location SDK | document.pleos.ai/en/api-reference/connect-sdk-pleos/ |
| API 정책 | AAOS에 같은/유사 API가 있으면 표준 API 사용 권장(AAOS Alignment), Pleos는 표준으로 불가능한 영역만 제공 | …/vehicle-app-planning-guide/pleos-connect-sdk-api |
| 차종별 호환 | Vehicle SDK: 차종별 상이 → 도메인별 `checkXXXCapabilities`로 확인 / NaviHelper: 내비 탑재 차량에서 호환 / TTS·STT: 호환 / FusedLocation: 차종별 상이 → `isSupported`로 확인 | …/api-compatibility-availability |
| 개발 환경 | minSdk API 28 이상, Gradle 8.0 이상, Kotlin/Java | …/getting-started, emulator setup |
| Maven | `https://nexus-playground.pleos.ai/repository/maven-releases/`, `ai.pleos.playground:Vehicle:2.3.x` | …/Vehicle/project-setup |
| Vehicle 사용 패턴 | `Vehicle(context)` → `initialize()` → 도메인 객체(예: `getDoor()`)의 비동기 `onComplete`/`onFailed` 콜백 → 사용 종료 시 `release()` | …/getting-started |
| 권한 | Vehicle API별 `@RequiresPermission`(PleosPermission)을 매니페스트에 선언 | …/Vehicle/vehicle-permission |
| Fused Location | `initialize`/`release`, `registerFusedLocationCallback`/`unregisterFusedLocationCallback` 제공 | …/FusedLocation/intro |
| 클라우드 API | Vehicle Data API: `/v1/vehicles/{vin}/locations`, `/driving`(시동·누적 주행거리·주차 상태) 등 — 차량 앱이 아닌 서버 연동용 | …/vehicle-data-api/intro |

## 멍로드 데이터 → 출처 매핑
| 필요한 데이터 | 1순위 | 대체 |
|---|---|---|
| 기어(P 여부, 주차 상태) | AAOS `VehiclePropertyIds.GEAR_SELECTION` (CarPropertyManager) | 없으면 Motion.UNKNOWN → 속도로 판단 |
| 차속 | AAOS `PERF_VEHICLE_SPEED` (m/s) | 위치 변화량으로 계산 |
| 현재 위치 | Pleos FusedLocation (`isSupported`일 때) — TODO(verify-sdk) | Android LocationManager |
| 주행 시간 | 앱 로직(엔진): 주행 상태 누적 | — |
| 이동 거리 | 앱 로직: 필터링한 좌표 사이 거리 합 | — |
| 음성 안내 | Pleos TextToSpeech SDK — TODO(verify-sdk) | Android TextToSpeech |
| 내비 연결 | NaviHelper SDK(목적지·경유지 설정) — TODO(verify-sdk) | 외부 지도 앱 Intent |

## 아직 확인하지 못한 것
- 이 환경에서 `docs/pleos-only/...` 상세 API 레퍼런스 페이지가 열리지 않아, FusedLocation·NaviHelper·TTS의 패키지명과 정확한 메서드 시그니처를 확인하지 못했습니다.
- AAOS 속성 중 Pleos 차량에서 실제로 READ 가능한 목록(API Compatibility 문서의 표)은 페이지 본문이 열리지 않아 확인하지 못했습니다. 속성을 읽지 못하면(onErrorEvent·미수신) 이동 상태를 UNKNOWN으로 두고 속도·위치로 판단하도록 구현했습니다.
