import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  EnvironmentAdminHttpApi,
  EnvironmentAuthInvalidError,
  EnvironmentHttpApi,
  EnvironmentInternalError,
  EnvironmentOperationForbiddenError,
  EnvironmentRequestInvalidError,
  EnvironmentResourceNotFoundError,
  EnvironmentScopeRequiredError,
} from "./environmentHttp.ts";

const traceId = "trace-1";
const decodeEnvironmentAuthInvalidError = Schema.decodeUnknownSync(EnvironmentAuthInvalidError);

describe("environment HTTP errors", () => {
  // A client squashes the cause and shows `message`; an empty one becomes a generic
  // "The environment request failed." that names nothing the reader can act on.
  it("each carries a message that names its reason", () => {
    const errors = [
      new EnvironmentRequestInvalidError({
        code: "invalid_request",
        reason: "invalid_command",
        traceId,
      }),
      new EnvironmentAuthInvalidError({
        code: "auth_invalid",
        reason: "missing_credential",
        traceId,
      }),
      new EnvironmentScopeRequiredError({
        code: "insufficient_scope",
        requiredScope: "orchestration:read",
        traceId,
      }),
      new EnvironmentOperationForbiddenError({
        code: "operation_forbidden",
        reason: "current_client_change_not_allowed",
        traceId,
      }),
      new EnvironmentResourceNotFoundError({
        code: "not_found",
        reason: "thread_not_found",
        traceId,
      }),
      new EnvironmentInternalError({
        code: "internal_error",
        reason: "orchestration_snapshot_failed",
        traceId,
      }),
    ] as const;
    const details = [
      "invalid_command",
      "missing_credential",
      "orchestration:read",
      "current_client_change_not_allowed",
      "thread_not_found",
      "orchestration_snapshot_failed",
    ];
    errors.forEach((error, index) => {
      expect(error.message).toContain(details[index]);
    });
  });

  it("retains the optional privacy-safe DPoP failure reason", () => {
    const withoutReason = decodeEnvironmentAuthInvalidError({
      _tag: "EnvironmentAuthInvalidError",
      code: "auth_invalid",
      reason: "invalid_credential",
      traceId,
    });
    const withReason = decodeEnvironmentAuthInvalidError({
      _tag: "EnvironmentAuthInvalidError",
      code: "auth_invalid",
      reason: "invalid_credential",
      dpopFailureReason: "replay",
      traceId,
    });

    expect(withoutReason.dpopFailureReason).toBeUndefined();
    expect(withReason.dpopFailureReason).toBe("replay");
  });
});

describe("environment Admin HTTP contract", () => {
  it("exposes exactly the six external administration routes", () => {
    const routes = Object.values(EnvironmentAdminHttpApi.endpoints)
      .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
      .sort();

    expect(routes).toEqual(
      [
        "GET /api/auth/admin/clients",
        "POST /api/auth/admin/client-pairing-codes",
        "POST /api/auth/admin/clients/delete",
        "POST /api/auth/admin/clients/disable",
        "POST /api/auth/admin/clients/enable",
        "POST /api/auth/admin/pairing-codes/revoke",
      ].sort(),
    );
  });

  it("retains the current pull request and cloud groups", () => {
    expect(Object.keys(EnvironmentHttpApi.groups)).toEqual(
      expect.arrayContaining(["admin", "pullRequests", "connect"]),
    );
  });
});
