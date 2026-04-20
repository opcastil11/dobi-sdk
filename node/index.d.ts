// Type definitions for @dobi/sdk 0.1.0

export interface DobiDeviceConfig {
  /** Base URL of the DOBI platform, e.g. https://dobi.guru */
  platform: string;
  /** Stable device identifier. Used as id_asset on the platform. */
  deviceId: string;
  /** Human-readable name. Defaults to deviceId. */
  deviceName?: string;
  /** One of: charger | battery | solar_panel | wind_turbine | smart_meter | iot_sensor */
  deviceType?: string;
  /** Shared secret for registration. Keep it on the device; don't commit. */
  provisionKey: string;
  /** Heartbeat cadence in milliseconds. Default 30_000. */
  heartbeatInterval?: number;
  /** Optional: link this device to a DAM cluster on register. */
  damId?: string | null;
}

export interface Metric {
  name: string;
  value: number | string;
  unit?: string | null;
}

export type MetricCollector = () => Metric[] | Promise<Metric[]>;
export type ActionHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

export class DobiDevice {
  constructor(config: DobiDeviceConfig);

  /** Replace the metric function. Called once per heartbeat tick. */
  setMetricCollector(fn: MetricCollector): void;

  /** Register a handler for an RPC action_type. */
  onAction(actionType: string, handler: ActionHandler): void;

  /** Explicitly register with the platform. Idempotent. */
  register(): Promise<unknown>;

  /** Send one heartbeat with the supplied metrics (or the collector's output). */
  heartbeat(metrics?: Metric[]): Promise<unknown>;

  /** Pull pending RPC commands from the platform's queue. */
  pollActions(): Promise<unknown[]>;

  /** Start the lifecycle loop (register + heartbeat + poll). Returns when stop() is called. */
  start(): Promise<void>;

  /** Stop the loop cleanly. */
  stop(): void;
}
