// @effect-diagnostics nodeBuiltinImport:off -- Synthetic streams exercise inherited activation bytes.
import * as NodeStream from "node:stream";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  readThreadAppActivation,
  ThreadAppReadyChannel,
  writeThreadAppReadyAck,
} from "./activation.ts";

import conformance from "../../../packages/contracts/test-fixtures/thread-app-activation.json" with { type: "json" };

const launchId = "01234567-89ab-4def-8abc-0123456789ab" as const;

describe("thread activation", () => {
  it("accepts one strict bounded JSON document and preserves a draft without sending it", async () => {
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(
          JSON.stringify({ contractVersion: 1, launchId, draft: "Review this" }),
        ),
      ),
    ).resolves.toEqual({ contractVersion: 1, launchId, draft: "Review this" });
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(
          JSON.stringify({ contractVersion: 1, launchId, projectId: "private" }),
        ),
      ),
    ).rejects.toThrow();
  });

  it("rejects empty, malformed UTF-8, and oversized activation", async () => {
    await expect(readThreadAppActivation(NodeStream.Readable.from([]))).rejects.toThrow("empty");
    await expect(
      readThreadAppActivation(NodeStream.Readable.from([Buffer.from([0xff])])),
    ).rejects.toThrow();
    await expect(
      readThreadAppActivation(NodeStream.Readable.from([Buffer.alloc(64 * 1024 + 1, 0x20)])),
    ).rejects.toThrow("byte bound");
  });

  it("handles chunking and rejects invalid identity, multiple documents, and draft byte overflow", async () => {
    const document = JSON.stringify({ contractVersion: 1, launchId, draft: "chunked" });
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from([document.slice(0, 11), document.slice(11)]),
      ),
    ).resolves.toEqual({ contractVersion: 1, launchId, draft: "chunked" });
    await expect(
      readThreadAppActivation(NodeStream.Readable.from(`${document}\n${document}`)),
    ).rejects.toThrow();
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(JSON.stringify({ contractVersion: 1, launchId: "not-a-uuid" })),
      ),
    ).rejects.toThrow();
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(
          JSON.stringify({ contractVersion: 1, launchId, draft: "x".repeat(32 * 1024) }),
        ),
      ),
    ).resolves.toHaveProperty("draft");
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(
          JSON.stringify({ contractVersion: 1, launchId, draft: "x".repeat(32 * 1024 + 1) }),
        ),
      ),
    ).rejects.toThrow();
  });

  it("writes exactly one strict newline ack through partial writes", () => {
    const output: Array<Buffer> = [];
    const close = vi.fn();
    writeThreadAppReadyAck({ contractVersion: 1, launchId, ready: true }, 9, {
      write: ((_fd: number, buffer: Uint8Array, offset: number, length: number) => {
        const count = Math.min(3, length);
        output.push(Buffer.from(buffer).subarray(offset, offset + count));
        return count;
      }) as unknown as typeof import("node:fs").writeSync,
      close,
    });
    expect(Buffer.concat(output).toString("utf8")).toBe(
      `${JSON.stringify({ contractVersion: 1, launchId, ready: true })}\n`,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes a stalled readiness write without marking it successful", () => {
    const close = vi.fn();
    expect(() =>
      writeThreadAppReadyAck({ contractVersion: 1, launchId, ready: true }, 9, {
        write: (() => 0) as unknown as typeof import("node:fs").writeSync,
        close,
      }),
    ).toThrow("stalled");
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes once after a partial acknowledgement write throws", () => {
    const close = vi.fn();
    let calls = 0;
    const channel = new ThreadAppReadyChannel(9, {
      write: (() => {
        calls += 1;
        if (calls === 1) return 2;
        throw new Error("pipe failed");
      }) as unknown as typeof import("node:fs").writeSync,
      close,
    });
    expect(() => channel.acknowledge({ contractVersion: 1, launchId, ready: true })).toThrow(
      "pipe failed",
    );
    channel.closeWithoutAck();
    expect(channel.written).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes a failed pre-ready launch exactly once with zero output bytes", () => {
    const output: Uint8Array[] = [];
    const close = vi.fn();
    const channel = new ThreadAppReadyChannel(9, {
      write: ((_fd: number, bytes: Uint8Array) => {
        output.push(bytes);
        return bytes.byteLength;
      }) as unknown as typeof import("node:fs").writeSync,
      close,
    });
    channel.closeWithoutAck();
    channel.closeWithoutAck();
    expect(output).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    expect(channel.written).toBe(false);
  });
});

describe("shared activation conformance and raw byte boundaries", () => {
  it.each(conformance)("$name", async ({ value, valid }) => {
    const result = readThreadAppActivation(
      NodeStream.Readable.from([Buffer.from(JSON.stringify(value))]),
    );
    if (valid) await expect(result).resolves.toEqual(value);
    else await expect(result).rejects.toThrow();
  });

  it("preserves split UTF-8 and whitespace at the exact envelope limit", async () => {
    const activation = { contractVersion: 1, launchId, draft: "  雪😀\r\n " };
    const bytes = Buffer.from(JSON.stringify(activation));
    const bounded = Buffer.concat([bytes, Buffer.alloc(64 * 1024 - bytes.length, 0x20)]);
    await expect(
      readThreadAppActivation(
        NodeStream.Readable.from(Array.from(bounded, (byte) => Buffer.from([byte]))),
      ),
    ).resolves.toEqual(activation);
    await expect(
      readThreadAppActivation(NodeStream.Readable.from([bounded, Buffer.from(" ")])),
    ).rejects.toThrow("byte bound");
  });

  it("uses inherited fd3 by default and closes it after the exact acknowledgement", () => {
    const writes: Buffer[] = [];
    const write = vi.fn((fd: number, bytes: Uint8Array, offset: number, length: number) => {
      expect(fd).toBe(3);
      writes.push(Buffer.from(bytes).subarray(offset, offset + length));
      return length;
    });
    const close = vi.fn();
    const channel = new ThreadAppReadyChannel(undefined, {
      write: write as unknown as typeof import("node:fs").writeSync,
      close,
    });
    channel.acknowledge({ contractVersion: 1, launchId, ready: true });
    expect(Buffer.concat(writes).toString()).toBe(
      `${JSON.stringify({ contractVersion: 1, launchId, ready: true })}\n`,
    );
    expect(close).toHaveBeenCalledExactlyOnceWith(3);
    expect(() => channel.acknowledge({ contractVersion: 1, launchId, ready: true })).toThrow(
      "closed",
    );
  });
});
