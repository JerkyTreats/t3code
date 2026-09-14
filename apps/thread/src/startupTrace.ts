// @effect-diagnostics nodeBuiltinImport:off -- The Electron shell owns its inherited diagnostic channel.
import * as NodeFS from "node:fs";

export const THREAD_STARTUP_TRACE_ENV = "T3_THREAD_STARTUP_TRACE";
export const THREAD_STARTUP_TRACE_FD = 4;

export const THREAD_RENDERER_STARTUP_MARKS = [
  "renderer.preload-evaluated",
  "renderer.dom-content-loaded",
  "renderer.window-focused",
  "renderer.activation-received",
  "renderer.activation-completed",
  "renderer.composer-mounted",
  "renderer.composer-editable",
  "renderer.composer-enabled",
  "renderer.composer-prepared",
  "renderer.composer-visible",
  "renderer.composer-inputable",
] as const;

export type ThreadRendererStartupMark = (typeof THREAD_RENDERER_STARTUP_MARKS)[number];

const rendererMarks = new Set<string>(THREAD_RENDERER_STARTUP_MARKS);

export function isThreadRendererStartupMark(value: unknown): value is ThreadRendererStartupMark {
  return typeof value === "string" && rendererMarks.has(value);
}

function monotonicEpochMilliseconds(): number {
  return performance.timeOrigin + performance.now();
}

export class ThreadStartupTraceChannel {
  readonly #enabled: boolean;
  readonly #fd: number;
  readonly #seen = new Set<string>();
  #closed = false;

  constructor(environment: NodeJS.ProcessEnv = process.env, fd = THREAD_STARTUP_TRACE_FD) {
    this.#enabled = environment[THREAD_STARTUP_TRACE_ENV] === "1";
    this.#fd = fd;
  }

  get enabled(): boolean {
    return this.#enabled && !this.#closed;
  }

  mark(source: "electron" | "renderer", name: string): void {
    if (!this.enabled || this.#seen.has(name)) return;
    this.#seen.add(name);
    try {
      NodeFS.writeSync(
        this.#fd,
        `${JSON.stringify({ contractVersion: 1, source, name, atMs: monotonicEpochMilliseconds() })}\n`,
      );
    } catch {
      this.#closed = true;
    }
  }

  close(): void {
    if (!this.enabled) return;
    this.#closed = true;
    try {
      NodeFS.closeSync(this.#fd);
    } catch {
      // A diagnostic consumer may have already closed its end of the pipe.
    }
  }
}
