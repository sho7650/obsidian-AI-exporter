/**
 * Shared types for the CDP daemon.
 */

export type DaemonCommand = 'start' | 'stop' | 'status';

export interface TabInfo {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly webSocketDebuggerUrl: string;
}

export interface KeepAliveResult {
  readonly timestamp: string;
  readonly reloaded: number;
  readonly errors: number;
}
