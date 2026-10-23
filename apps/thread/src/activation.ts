// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off -- This boundary validates bounded inherited descriptors before Electron startup.
import * as NodeFS from "node:fs";

import type {
  ThreadAppActivation,
  ThreadAppReadyAck,
} from "@t3tools/contracts/threadAppActivation";

import { decodeThreadAppActivation } from "./activationContract.ts";

const MAX_ACTIVATION_BYTES = 64 * 1024;
const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });

export async function readThreadAppActivation(
  input: NodeJS.ReadableStream = process.stdin,
): Promise<ThreadAppActivation> {
  const chunks: Array<Uint8Array> = [];
  let byteLength = 0;
  for await (const unknownChunk of input) {
    const chunk =
      typeof unknownChunk === "string" ? Buffer.from(unknownChunk) : Buffer.from(unknownChunk);
    byteLength += chunk.byteLength;
    if (byteLength > MAX_ACTIVATION_BYTES) {
      throw new Error("T3 Thread activation exceeded its byte bound.");
    }
    chunks.push(chunk);
  }
  if (byteLength === 0) throw new Error("T3 Thread activation was empty.");
  return decodeThreadAppActivation(JSON.parse(fatalUtf8.decode(Buffer.concat(chunks))));
}

export function writeThreadAppReadyAck(
  ack: ThreadAppReadyAck,
  fd = 3,
  io: {
    readonly write?: typeof NodeFS.writeSync;
    readonly close?: typeof NodeFS.closeSync;
  } = {},
): void {
  const bytes = Buffer.from(`${JSON.stringify(ack)}\n`, "utf8");
  const write = io.write ?? NodeFS.writeSync;
  let written = 0;
  try {
    while (written < bytes.byteLength) {
      const count = write(fd, bytes, written, bytes.byteLength - written);
      if (count <= 0) throw new Error("T3 Thread readiness acknowledgement stalled.");
      written += count;
    }
  } finally {
    (io.close ?? NodeFS.closeSync)(fd);
  }
}

export class ThreadAppReadyChannel {
  readonly #fd: number;
  readonly #io: {
    readonly write?: typeof NodeFS.writeSync;
    readonly close?: typeof NodeFS.closeSync;
  };
  #closed = false;
  #written = false;

  constructor(
    fd = 3,
    io: {
      readonly write?: typeof NodeFS.writeSync;
      readonly close?: typeof NodeFS.closeSync;
    } = {},
  ) {
    this.#fd = fd;
    this.#io = io;
  }

  get written(): boolean {
    return this.#written;
  }

  acknowledge(ack: ThreadAppReadyAck): void {
    if (this.#closed) throw new Error("T3 Thread readiness channel is closed.");
    try {
      writeThreadAppReadyAck(ack, this.#fd, this.#io);
      this.#written = true;
    } finally {
      this.#closed = true;
    }
  }

  closeWithoutAck(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      (this.#io.close ?? NodeFS.closeSync)(this.#fd);
    } catch {
      // Direct diagnostic launches may omit the inherited readiness channel.
    }
  }
}
