# 멍로드 (MUNG ROAD)

> 우리 강아지와 함께 달린 모든 길이 추억이 된다.

반려견과의 자동차 여행을 자동으로 기록하고, 주행 시간에 따른 휴식 알림, 주변 반려동물 동반 장소 검색,
여행 앨범·AI 여행 일기를 제공하는 **스마트 펫 트래블 로그** 서비스입니다.
현대자동차 차량용 앱 개발 공모전(패밀리 & 동승자 케어 / 모빌리티 & 라이프 편의) 출품작입니다.

## 저장소 구성

| 폴더 | 내용 | 상태 |
|---|---|---|
| [`web/`](web) | **실제 동작하는 웹 프로토타입** (React + TypeScript + Vite). 블루 시안 UI·차량 가로 대시보드·데모 시나리오 | ✅ 빌드·단위 테스트 17개·E2E(모바일+차량 가로) 통과 |
| [`android/`](android) | 최종 목표인 Pleos Connect용 Android 앱 (Kotlin, Compose, Room, Provider 구조, 카카오맵·Pleos 플래그) | ⚠ 코드 작성, **컴파일 미검증** → [설치·실행 가이드](docs/ANDROID_SETUP.md) |
| [`server/`](server) | AI 일기·장소 검색 프록시 (API 키를 서버에만 보관) | ✅ 라우팅 확인 / ⚠ 외부 API 실호출 미검증 |
| [`docs/`](docs) | [구현 현황](docs/IMPLEMENTATION_STATUS.md) · [Android 설치 가이드](docs/ANDROID_SETUP.md) · [외부 데이터 조사](docs/DATA_SOURCES.md) · 아키텍처 · Pleos 조사 | |

> 개발 환경에서 Android SDK·Gradle 저장소에 접근할 수 없어, 요청서 2장 방침에 따라 **웹 프로토타입을 먼저 완성**했습니다.
> 실제 구현 범위와 미구현 범위는 [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)에 정리했습니다.

## 웹 프로토타입 실행

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # 도메인 단위 테스트 (vitest)
npm run build      # dist/ 정적 파일 (상대 경로라 어디서든 호스팅 가능)
```

E2E 데모 시나리오 점검(Chrome 필요):

```bash
npm run build && npx vite preview --port 4173 &
node e2e/demo-scenario.mjs /path/to/chrome   # e2e/screenshots/ 에 화면 캡처 저장
```

### 공모전 시연 순서 (데모 모드, 기본 켜짐)
1. 온보딩 3장 → 반려견 등록(예: 사슴)
2. 홈 → **여행 시작하기** → 시뮬레이션 속도(예: 60배속) 선택 → 여행 시작
3. 서울 → 영동고속도로 → 강릉 가상 주행: 주행 시간·거리 증가, 경로 표시
   - 신호 대기·정체 정차는 '일시 정차'로만 표시되고 휴식으로 세지 않음
   - 일부러 넣은 비정상 GPS 좌표(순간 이동, 저정확도, 0,0)가 걸러짐 (‘여행 기록’ 버튼에서 확인)
4. 주행 80분 예고 → 90분 휴식 알림 (음성 안내 포함) → 주변 휴식 장소(샘플) → 휴식 시작/종료
5. 도착 → 여행 종료 → 자동 제목("사슴이와 강릉 경포해변 바다 여행") → 사진·메모 → 여행 일기 생성 → 공유 이미지
6. 여행 기록 › 데모 기록 / 발도장 지도 확인. 데모 기록은 홈·마이페이지 누적 통계에 포함되지 않음

### 실제 데이터 연결 (선택)
```bash
KAKAO_REST_API_KEY=... ITS_API_KEY=... ANTHROPIC_API_KEY=... node server/index.mjs   # :8787
```
- 앱 › 설정(마이페이지) › 연동 서버: `http://localhost:8787` → 장소 검색(카카오)·도로 돌발 정보(ITS)·AI 일기
- 앱 › 설정 › 카카오맵 JavaScript 키 → 실제 도로 지도 (카카오디벨로퍼스에 `http://localhost:5173` 도메인 등록)
- 키가 없거나 실패하면 샘플 장소·데모 위험 정보(데모 여행 한정)·템플릿 일기·개요 지도로 대체되고, 화면에 출처 배지가 붙습니다.
- 키 발급 순서는 [docs/ANDROID_SETUP.md](docs/ANDROID_SETUP.md) 5~7단계.

## 기술 스택
- Web: React 19, TypeScript, Vite, IndexedDB(idb), Lucide 아이콘, Pretendard 폰트, Natural Earth 해안선 SVG 지도
- Android(목표): Kotlin, Jetpack Compose, MVVM, Room, Coroutines/Flow, AAOS Car API, Pleos Connect SDK

## 라이선스 고지
Pretendard(OFL-1.1), Lucide(ISC), Natural Earth(퍼블릭 도메인) / world-atlas(ISC). 일러스트는 자체 제작 SVG이며, 반려견·여행 사진은 사용자가 직접 등록한 사진만 사용합니다.

## 화면 (E2E 자동 캡처)
**차량 가로 화면 — 주행 대시보드 (데모)**

![](docs/screenshots/05b-dashboard-wide.png)

| 홈 | 여행 중(모바일) | 휴식 알림 | 정차 중 여행 기록 |
|---|---|---|---|
| ![](docs/screenshots/03-home-empty.png) | ![](docs/screenshots/05-live-driving.png) | ![](docs/screenshots/07-reminder-due.png) | ![](docs/screenshots/11-trip-detail-new.png) |
| **주변 탐색** | **AI 여행 일기** | **커뮤니티(준비 중)** | **위치 권한 거부** |
| ![](docs/screenshots/16-explore.png) | ![](docs/screenshots/11b-diary.png) | ![](docs/screenshots/19b-community.png) | ![](docs/screenshots/20-permission-denied.png) |
