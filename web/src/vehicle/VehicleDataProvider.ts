// 차량 데이터 접근 계층(요청서 15장).
// 앱 나머지는 이 인터페이스만 알고, 실제 SDK·기기 위치·데모 시뮬레이션은 구현체에서 교체합니다.
// 한 여행 세션에는 정확히 하나의 Provider만 연결되므로 실제 데이터와 시뮬레이션이 섞이지 않습니다.
import type { DataSource } from '../domain/models';
import type { VehicleSample } from '../domain/tripEngine';

export interface ProviderCapabilities {
  location: boolean;
  speed: boolean;
  motionState: boolean; // 기어/주차 상태 등 차량이 직접 주는 이동 상태
  parkingState: boolean;
}

export type ProviderStartResult =
  | { ok: true }
  | { ok: false; reason: 'permission-denied' | 'unsupported' | 'unavailable'; message: string };

export interface VehicleDataProvider {
  readonly source: DataSource;
  readonly isSimulated: boolean;
  readonly capabilities: ProviderCapabilities;
  /** 데모는 시뮬레이션 시각, 그 외는 실제 시각 */
  now(): number;
  start(onSample: (s: VehicleSample) => void): Promise<ProviderStartResult>;
  stop(): void;
  /** 사용자가 휴식을 시작/종료했음을 알려줍니다(데모는 이때 차를 세움). */
  onRestChanged?(resting: boolean): void;
  /** 직렬화 가능한 진행 상태(앱 재실행 후 복원용) */
  snapshot?(): unknown;
}

export type ProviderKind = 'demo' | 'device-location' | 'manual' | 'pleos-vehicle';
