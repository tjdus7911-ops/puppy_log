# Android 앱 실행 가이드 (설치·설정 순서)

> ⚠ 이 저장소의 `android/` 코드는 개발 환경 제약(Android SDK·Gradle·Maven 저장소 차단)으로 **한 번도 컴파일되지 않았습니다.**
> 아래 1~4단계에서 처음 빌드할 때 오류가 나면, Build 창의 오류 로그 전체를 그대로 전달해 주세요. 그 로그를 기준으로 수정합니다.

## 0. 준비물 요약
| 무엇 | 왜 필요한가 | 필수 여부 |
|---|---|---|
| Android Studio (최신 안정판, JDK 17 포함) | 빌드·실행 | 필수 |
| Android SDK Platform 35 | `compileSdk = 35` | 필수 |
| Pleos Connect Emulator (AVD) | 차량 환경·Pleos SDK 실행 | 차량 기능 검증 시 |
| Pleos Playground 계정 | SDK·에뮬레이터·문서 | 차량 기능 검증 시 |
| 카카오디벨로퍼스 앱 (네이티브·JavaScript·REST 키) | 실제 지도, 장소 검색 | 지도·장소 검증 시 |
| ITS 국가교통정보센터 인증키 | 사고·공사 등 돌발 정보 | 도로 위험 정보 검증 시 |
| Node.js 18+ | `server/` 프록시 실행 | 장소·교통·AI 검증 시 |
| Anthropic API 키 | AI 여행 일기 | 선택(없으면 템플릿 일기) |

## 1. Android Studio 설치
1. developer.android.com 에서 Android Studio 최신 안정판을 설치합니다.
2. **Settings › Languages & Frameworks › Android SDK › SDK Platforms**에서 **Android 15 (API 35)** 를 설치합니다.
3. 같은 화면의 **SDK Tools**에서 Android SDK Build-Tools, Android Emulator, Android SDK Platform-Tools 를 설치합니다.

## 2. Pleos Connect Emulator 설치 (차량 환경)
1. pleos.ai(Pleos Playground)에 가입하고 공식 문서의 **Pleos Connect Emulator 설치 가이드**를 엽니다.
2. 가이드대로 **SDK Manager › SDK Update Sites**에 Pleos 시스템 이미지 사이트를 추가하고, Pleos Connect 시스템 이미지를 설치합니다.
   (다른 공모전 저장소들이 인용한 주소: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml` — 반드시 공식 가이드의 최신 주소로 확인하세요)
3. Device Manager 에서 Pleos Connect AVD 를 만들고 실행합니다. 이 에뮬레이터는 Android Automotive(arm64) 이미지예요.

## 3. 프로젝트 열기
```bash
git clone https://github.com/tjdus7911-ops/puppy_log.git
```
1. Android Studio › **Open** › `puppy_log/android` 폴더를 선택합니다(루트 폴더가 아니라 `android`).
2. `android/local.properties.example` 을 `android/local.properties` 로 복사합니다. `sdk.dir` 은 Android Studio 가 자동으로 채웁니다.
3. 처음에는 두 플래그를 그대로 `false` 로 둡니다.
   ```properties
   mungroad.usePleosSdk=false
   mungroad.useKakaoMap=false
   ```
4. **Gradle Sync** → **Run ▶**. Gradle Wrapper(8.10.2)가 자동으로 내려받아집니다.

**1차 목표:** SDK 없이 데모 모드(서울→강릉)로 대시보드·휴식 알림·여행 종료·기록 저장이 동작하는지 확인합니다.
(일반 휴대폰 에뮬레이터 API 28+ 에서도 실행됩니다. 차량 기어·차속은 Automotive 에서만 읽힙니다)

## 4. Pleos SDK 켜기 (NaviHelper·Vehicle)
1. `local.properties` 에 `mungroad.usePleosSdk=true` → Gradle Sync.
   - 의존성: `ai.pleos.playground:Vehicle`, `ai.pleos.playground:NaviHelper` (버전은 `pleos.vehicleVersion`, `pleos.naviHelperVersion` 으로 바꿀 수 있어요)
   - 저장소: `https://nexus-playground.pleos.ai/repository/maven-releases/` (settings.gradle.kts 에 등록됨)
2. Sync 가 끝나면 AAR 의 실제 API 를 출력합니다.
   ```bash
   cd android && ./scripts/dump-pleos-api.sh NaviHelper 3.0.5
   ```
3. 출력 파일을 보고 `app/src/pleos/java/com/mungroad/sdk/PleosBindings.kt` 의 `TODO(verify-sdk)` 3곳(초기화·리스너, 경로 조회, 경유지/목적지 요청)을 채웁니다.
   이 작업을 저에게 맡기실 경우 `pleos-NaviHelper-*-api.txt` 파일을 전달해 주세요.
4. 매니페스트에 Vehicle API 별 `@RequiresPermission` 권한을 추가합니다(문서의 PleosPermission).

## 5. 카카오 키 발급
1. developers.kakao.com › **내 애플리케이션 › 애플리케이션 추가**.
2. 앱 관리 페이지 › **[카카오맵] › [사용 설정] › 상태 ON** — 이걸 안 하면 `disabled OPEN_MAP_AND_LOCAL service` 403 오류가 납니다.
   - 무료 쿼터는 계정에서 **처음 카카오맵을 활성화한 앱**에만 제공됩니다.
3. **[앱] › [플랫폼 키]** 에서 세 가지 키를 확인합니다.
   | 키 | 쓰는 곳 | 추가 등록 |
   |---|---|---|
   | 네이티브 앱 키 | Android 지도 SDK → `local.properties` 의 `KAKAO_NATIVE_APP_KEY` | Android 플랫폼: 패키지명 `com.mungroad` + 키 해시 |
   | JavaScript 키 | 웹 프로토타입 지도 → 마이페이지 › 카카오맵 JavaScript 키 | JavaScript SDK 도메인: `http://localhost:5173`, `http://localhost:4173` |
   | REST API 키 | `server/` 의 `KAKAO_REST_API_KEY` (앱에는 넣지 않음) | — |
4. 디버그 키 해시 확인:
   ```bash
   keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64
   ```
5. `local.properties` 에 `mungroad.useKakaoMap=true` 와 `KAKAO_NATIVE_APP_KEY=...` 를 넣고 Sync.
   - 카카오맵 Android SDK v2 는 **arm64-v8a / armeabi-v7a 만 지원**합니다. x86_64 에뮬레이터에서는 지도가 뜨지 않아요(Pleos 에뮬레이터는 arm64).

## 6. ITS 도로 돌발 정보 키
1. its.go.kr › 오픈데이터 › **돌발상황정보** › Open API 인증키 신청.
2. 발급 메일/페이지의 예시 호출 주소를 확인합니다. 서버 기본값은 `https://openapi.its.go.kr:9443/eventInfo` 이며 다르면 `ITS_EVENT_URL` 로 바꿉니다.

## 7. 프록시 서버 실행
```bash
cd puppy_log
KAKAO_REST_API_KEY=... ITS_API_KEY=... ANTHROPIC_API_KEY=... node server/index.mjs   # :8787
curl "http://localhost:8787/api/places?query=애견동반%20카페&lat=37.75&lng=128.88&radius=5000"
curl "http://localhost:8787/api/traffic?minX=127.0&maxX=129.0&minY=37.0&maxY=38.0"
```
- Android 에뮬레이터에서는 PC 의 localhost 가 `10.0.2.2` 입니다 → `MUNGROAD_API_BASE_URL=http://10.0.2.2:8787`
- 웹 프로토타입: 마이페이지 › 연동 서버에 `http://localhost:8787`

## 8. 확인 체크리스트
- [ ] 플래그 off 데모 빌드 실행 (대시보드·휴식 알림·여행 종료·기록 목록)
- [ ] Pleos AVD 에서 기어(P/D)·차속 수신 → 상태가 '주행/정차'로 바뀌는지
- [ ] NaviHelper 시그니처 반영 후: 내비 목적지·남은 거리 표시, 휴식 장소 경유지 추가
- [ ] 카카오맵 표시(arm64), 경로·마커
- [ ] 서버 경유 장소 검색: 동반 여부가 모두 '확인 필요'로 표시되는지
- [ ] 서버 경유 ITS 돌발 정보: 데모 배지 없이 실제 출처 표시
