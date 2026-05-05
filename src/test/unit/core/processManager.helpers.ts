import { vi } from "vitest";

export interface MockChildProcess {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

export interface SpawnCall {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

export function createMockChild(pid = 1234): MockChildProcess {
  return {
    pid,
    kill: vi.fn().mockReturnValue(true),
    stderr: { on: vi.fn() },
    on: vi.fn(),
    exitCode: null,
  };
}

/** Flush microtask queue so async lockExists resolves. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
