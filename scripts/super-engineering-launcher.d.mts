export declare const BACKEND_PORT: number;
export declare const READINESS_URL: string;

export declare class LauncherError extends Error {
  constructor(message: string);
}

export interface ReadinessOptions {
  url?: string;
  timeoutMs?: number;
  pollMs?: number;
}

export interface ChildLike {
  pid?: number;
  kill(signal?: string): void;
  once(event: "exit", listener: () => void): unknown;
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  spawnFn?: (command: string, args: string[], options: Record<string, unknown>) => ChildLike;
  fetchFn?: (url: string, init?: { method?: string }) => Promise<{ status: number }>;
  registerSignal?: (signal: string, handler: () => void) => void;
  log?: (message: string) => void;
  readiness?: ReadinessOptions;
}

export interface RunResult {
  ok: boolean;
  exitCode: number;
  cleanup: (signal: string) => number;
}

export declare function resolveWorkspace(env: Record<string, string | undefined>): string;

export declare function waitForReadiness(options?: ReadinessOptions & {
  fetchFn?: (url: string, init?: { method?: string }) => Promise<{ status: number }>;
  log?: (message: string) => void;
}): Promise<boolean>;

export declare function run(options?: RunOptions): Promise<RunResult>;
