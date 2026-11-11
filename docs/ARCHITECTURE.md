# 아키텍처

```
VehicleDataProvider (Demo | DeviceLocation | Manual | Pleos)   ← 세션당 1개, 섞이지 않음
        │ VehicleSample(timestamp, lat/lng, accuracy, speed, motion)
        ▼
TripEngine (순수 함수 · 단위 테스트)
  - 경과 시간 / 실제 주행 시간 분리, GPS 필터, 거리 누적
  - 휴식 알림(예고·도달·스누즈), 명시적 휴식만 기록
        │ events(point, restSoon, restDue, statusChanged)
        ▼
TripController (웹) / TripSessionManager (Android 예정)
  - 저장소 기록(경로 배치 저장, 스냅샷 → 재실행 복원), 음성 안내, 중복 시작 방지
        ▼
Repository: IndexedDB (웹) / Room (Android)   ── 데모 기록 isDemo=true, 통계에서 제외
        ▼
UI 화면 (홈 · 주변 탐색 · 여행 기록 · 마이페이지 + 여행 중)
```

외부 연동도 같은 방식으로 인터페이스 뒤에 둡니다.
- `PlaceSearchProvider`: `SamplePlaceProvider`(가상 데이터, '샘플' 표시) / `ProxyPlaceProvider`(server → 카카오 로컬)
- 일기 생성: 서버 `/api/diary`(AI) → 실패 시 `templateDiary()`
- 내비 연결: 웹은 카카오맵 링크, Android는 NaviHelper SDK

## 웹 소스 구조 (`web/src`)
| 경로 | 역할 |
|---|---|
| `domain/` | 모델, 지리 계산·GPS 필터, 지역 판정, TripEngine, 제목·일기 텍스트 |
| `vehicle/` | VehicleDataProvider 인터페이스와 구현체, 데모 경로 |
| `trip/` | TripController, 음성 안내 |
| `places/` | 장소 검색 Provider, 필터, 내비 연결 |
| `diary/` | AI 일기 호출 + 안전 점검 + 템플릿 대체 |
| `data/` | IndexedDB 스키마(버전·마이그레이션)와 저장소 |
| `screens/`, `ui/`, `app/` | 화면, 공통 컴포넌트·SVG 일러스트·지도, 라우터·전역 상태·공유 이미지 |
