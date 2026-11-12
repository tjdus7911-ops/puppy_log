# Pleos Connect SDK — 멍로드에서 쓰는 API (검증본, 2026-11-12)

공개 Maven(`https://nexus-playground.pleos.ai/repository/maven-releases/`)의 AAR 을 GitHub Actions(`.github/workflows/pleos-api.yml`)에서 내려받아
`javap -public` 으로 확인한 시그니처입니다. CI `build-pleos` 잡이 `-Pmungroad.usePleosSdk=true` 로 실제 SDK 와 함께 컴파일합니다.
**실제 동작(콜백 값·단위·권한 승인)은 Pleos Connect Emulator·차량에서 확인이 필요합니다.**

| 모듈 | 버전 | 의존 |
|---|---|---|
| `ai.pleos.playground:NaviHelper` | 3.0.5 | navi-data 3.0.4, navi-aidl 3.0.1 |
| `ai.pleos.playground:Vehicle` | 2.3.2 | vehicle-data 1.1.11, vehicle-aidl 1.1.1 |
| `ai.pleos.playground:TextToSpeech` | 3.3.1 | security:universal-access 0.6.0 |
| `ai.pleos.playground:SpeechToText` | 3.3.1 | (미사용 — 다음 단계) |
| `ai.pleos.playground:FusedLocation` | 1.1.3 | (미사용 — 문서상 준비 중) |
| `ai.pleos.playground:LLM` | 2.1.3.2 | (AI 일기 검토용) |

## NaviHelper (`ai.pleos.playground.navi.helper.NaviHelper`)
- `NaviHelper(context)` → `initialize(onSuccess, onError)` → `addListener(NaviHelperEventListener)` → … → `removeListener` / `release()`
- `requestRoute(RouteInfo)`, `requestRouteWithWaypoints(RouteWithWaypointsRequest)`, `cancelRoute()`, `requestReRoute()`
- `addWaypoint(RequestWaypointInfo)`, `removeWaypoint(WaypointIndex)` — 경유지 최대 2개(`FIRST`, `SECOND`)
- `changeRouteOption(RouteOption)` — `RECOMMENDED, SHORT_DISTANCE, SHORT_TIME, FREE, HIGHWAY, COMFORTABLE, SCHOOL_ZONE`
  - **멍로드 '편한 길' = `RouteOption.COMFORTABLE`**
- 조회(결과는 리스너): `getRouteStateInfo, getCurrentLocationInfo, getDestinationInfo, getWaypointInfo, getTBTInfo …`
- `RouteInfo(latitude, longitude, displayLatitude?, displayLongitude?, poiName, poiId, address, poiSubId, routeOption, poiProvider, …)`
- `RequestWaypointInfo(latitude, longitude, poiName, waypointIndex, poiId, address, poiSubId, poiProvider)`
- 리스너(기본 구현 있음): `onRouteStarted, onRoutingCompleted, onRouteCancelled, onRouteOptionChanged, onWaypointChanged, onDestinationArrived(DestinationArrivedInfo), onWayPointArrived, onDrivingInfo(DrivingInfo), onNavigationStatus, onCurrentLocationInfo, onError(NaviErrorCode)` 등
- `DrivingInfo.destination: DrivingState(name, duration, distance, …)` — 단위(초·m)는 에뮬레이터에서 확인
- 권한: `pleos.car.permission.NAVI_ROUTE`, `NAVI_ROUTE_SEARCH`

## Vehicle (`ai.pleos.playground.vehicle.Vehicle`)
- `Vehicle(context)` → `initialize()` → 도메인 `getWindow() getDoor() getHVAC() getTurnSignal() getBrake() getGear() getOdometer() getSafety() getFuel() getEvBattery() …` → `release()`
- 비동기 콜백 `(onComplete, onFailed: (Exception) -> Unit)`, 리스너는 `VehicleListener.onFailed(Exception)` 상속
- 지원 확인: 도메인별 `checkXXXCapabilities(...)` (차종별로 다름)
- 영역: `WindowArea(WindowValue.ROW_2_LEFT…)`, `DoorArea(DoorValue.ROW_2_LEFT…)`, `SeatArea(SeatValue.ROW_1_LEFT…)`
- 멍로드 사용
  - Window: `checkWindowPositionCapabilities`, `getCurrentWindowPosition(area, onValue, onFail)` (변경 리스너 없음 → 5초 조회)
  - Door: `checkDoorPositionCapabilities`, `registerDoorPosition(area, DoorPositionListener.onPositionUpdated(Int?))`
  - HVAC: `checkHvacAcCapabilities`, `registerHvacAcState(seat, HvacAcStateListener.onHvacAcStateUpdated(Boolean?))`, `setHvacAc(seat, on, onDone, onFail)`
  - TurnSignal: `checkTurnSignalStateCapabilities`, `registerTurnSignalState(TurnSignalStateListener.onTurnSignalStateUpdated(TurnSignalValue?))` — `OFF/LEFT/RIGHT`
  - (다음 단계) Odometer `getTripCurrentDrivingDistance`, Gear `registerGearSelection`, Brake `registerBrakePedalStatus`, EvBattery `getEvBatteryLevel`, Fuel `getFuelPercent`
- 외기 온도는 Vehicle SDK 에 없음 → AAOS `ENV_OUTSIDE_TEMPERATURE` (`android.car.permission.CAR_EXTERIOR_ENVIRONMENT`)
- 권한(`PleosPermission`): 읽기 `CAR_*`, 제어 `CONTROL_CAR_*` — 선언: `CAR_DOORS, CAR_WINDOWS, CAR_CLIMATE, CONTROL_CAR_CLIMATE, CAR_LIGHTS`

## TextToSpeech (`ai.pleos.playground.tts.TextToSpeech`)
- `TextToSpeech(context, Mode.HYBRID)` → `initialize(OnInitializeListener)` → `speak(text, interrupt)` / `stop()` / `release()`
- `Mode`: `SERVER, ON_DEVICE, HYBRID` · `addEventListener(EventListener: onStart/onReady/onDone/onError/onStop)` · `setLocale`, `setAudioAttributes`
- 서버 모드는 `registerApp(...)` 필요(키는 코드에 넣지 않음) — 멍로드는 HYBRID 로 시작
