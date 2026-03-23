/**
 * Shared types for the CDP daemon.
 */

export type DaemonCommand = 'start' | 'stop' | 'status';

export interface KeepAliveResult {
  readonly timestamp: string;
  readonly reloaded: number;
  readonly errors: number;
}
