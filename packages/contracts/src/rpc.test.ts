import { describe, expect, it } from "vite-plus/test";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { ORCHESTRATION_WS_METHODS } from "./orchestration.ts";
import { WS_METHODS, WsRpcGroup, WsSubscribeServerConfigRpc } from "./rpc.ts";

const oldServerPayload = Schema.Struct({});
const decodeOldServerPayloadExit = Schema.decodeUnknownExit(oldServerPayload);
const decodeServerConfigSubscription = Schema.decodeUnknownSync(
  WsSubscribeServerConfigRpc.payloadSchema,
);

/**
 * The client always sends `environmentThemes`, including to servers built
 * before the field existed, whose payload schema was an empty struct. What
 * makes that safe is that such a schema accepts the request rather than
 * rejecting it -- an error here would take down the config subscription.
 */
describe("subscribeServerConfig payload compatibility", () => {
  it("is accepted by a server whose schema predates the field", () => {
    const decoded = decodeOldServerPayloadExit({ environmentThemes: true });
    expect(Exit.isSuccess(decoded)).toBe(true);
  });

  it("is carried by a server that declares it", () => {
    const decoded = decodeServerConfigSubscription({
      environmentThemes: true,
    });
    expect(decoded).toEqual({ environmentThemes: true });
  });

  it("stays optional, so a client that never sends it still subscribes", () => {
    const decoded = decodeServerConfigSubscription({});
    expect(decoded).toEqual({});
  });
});

describe("retired access inventory RPC", () => {
  it("does not register the legacy access subscription", () => {
    expect("subscribeAuthAccess" in WS_METHODS).toBe(false);
  });
});

describe("RPC registration inventory", () => {
  it("preserves the established project compatibility names and registers every other method", () => {
    expect(Object.values(WS_METHODS).filter((method) => !WsRpcGroup.requests.has(method))).toEqual([
      WS_METHODS.projectsList,
      WS_METHODS.projectsAdd,
      WS_METHODS.projectsRemove,
    ]);
    expect(
      Object.values(ORCHESTRATION_WS_METHODS).filter((method) => !WsRpcGroup.requests.has(method)),
    ).toEqual([]);
  });
});
