import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  AuthReviewWriteScope,
  AuthTerminalOperateScope,
  EnvironmentAuthInvalidError,
  type EnvironmentAuthInvalidReason,
  EnvironmentHttpApi,
  EnvironmentHttpConflictError,
  EnvironmentRateLimitError,
  EnvironmentInternalError,
  type EnvironmentInternalErrorReason,
  EnvironmentOperationForbiddenError,
  EnvironmentRequestInvalidError,
  type EnvironmentRequestInvalidReason,
  EnvironmentResourceNotFoundError,
  type EnvironmentResourceNotFoundReason,
  EnvironmentScopeRequiredError,
  EnvironmentAuthenticatedAuth,
  EnvironmentAuthenticatedPrincipal,
} from "@t3tools/contracts";
import type { AuthEnvironmentScope, DpopFailureReason } from "@t3tools/contracts";
import { parseAllowedOAuthScope } from "@t3tools/shared/oauthScope";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Ref from "effect/Ref";
import * as AdminAccess from "./AdminAccess.ts";
import * as DeviceAdministratorPolicy from "./DeviceAdministratorPolicy.ts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Cookies from "effect/unstable/http/Cookies";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as SessionStore from "./SessionStore.ts";
import { traceAuthenticatedRelayRequest, traceRelayRequest } from "../cloud/traceRelayRequest.ts";
import { deriveAuthClientMetadata } from "./utils.ts";
import { verifyRequestDpopProof } from "./dpop.ts";
import { parseAuthorizationCredential } from "./authorizationCredential.ts";

const CREDENTIAL_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  pragma: "no-cache",
} as const;

const appendCredentialResponseHeaders = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(HttpServerResponse.setHeaders(response, CREDENTIAL_RESPONSE_HEADERS)),
);

const appendDpopChallengeHeader = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", "DPoP")),
);

const appendDpopChallengeOnUnauthorized = (error: EnvironmentAuthInvalidError) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const usesDpop =
      (request.originalUrl.startsWith("/oauth/token") && request.headers.dpop !== undefined) ||
      parseAuthorizationCredential(request.headers.authorization)?.source === "dpop";
    if (usesDpop) {
      yield* appendDpopChallengeHeader;
    }
    return yield* error;
  });

export const currentEnvironmentTraceId = Effect.currentParentSpan.pipe(
  Effect.map((span) => span.traceId),
  Effect.orElseSucceed(() => "unavailable"),
);

export function annotateEnvironmentRequest(endpoint: string) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const traceId = yield* currentEnvironmentTraceId;

    yield* Effect.addFinalizer((exit) =>
      exit._tag === "Failure"
        ? Effect.logWarning("environment api request failed", {
            endpoint,
            traceId,
            errorTag: causeErrorTag(exit.cause),
            cause: exit.cause,
          })
        : Effect.void,
    );
    yield* Effect.annotateLogsScoped({ "environment.endpoint": endpoint, traceId });
    yield* Effect.annotateCurrentSpan({
      "environment.endpoint": endpoint,
      "http.request.method": request.method,
      "url.path": url._tag === "Some" ? url.value.pathname : "unknown",
    });
  });
}

export function failEnvironmentAuthInvalid(
  reason: EnvironmentAuthInvalidReason,
  dpopFailureReason?: DpopFailureReason,
) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(
        new EnvironmentAuthInvalidError({
          code: "auth_invalid",
          reason,
          ...(dpopFailureReason === undefined ? {} : { dpopFailureReason }),
          traceId,
        }),
      ),
    ),
  );
}

export function failEnvironmentInvalidRequest(reason: EnvironmentRequestInvalidReason) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(new EnvironmentRequestInvalidError({ code: "invalid_request", reason, traceId })),
    ),
  );
}

export function failEnvironmentScopeRequired(requiredScope: AuthEnvironmentScope) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(
        new EnvironmentScopeRequiredError({
          code: "insufficient_scope",
          requiredScope,
          traceId,
        }),
      ),
    ),
  );
}

function failEnvironmentOperationForbidden(
  reason: "current_client_change_not_allowed" | "authority_not_allowed",
) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(
        new EnvironmentOperationForbiddenError({
          code: "operation_forbidden",
          reason,
          traceId,
        }),
      ),
    ),
  );
}

export function failEnvironmentNotFound(reason: EnvironmentResourceNotFoundReason) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(new EnvironmentResourceNotFoundError({ code: "not_found", reason, traceId })),
    ),
  );
}

export function failEnvironmentInternal(reason: EnvironmentInternalErrorReason, error?: unknown) {
  return Effect.gen(function* () {
    const traceId = yield* currentEnvironmentTraceId;
    if (error !== undefined) {
      yield* Effect.logError("environment api operation failed", {
        reason,
        traceId,
        errorTag:
          typeof error === "object" && error !== null && "_tag" in error ? error._tag : "unknown",
      });
    }
    return yield* new EnvironmentInternalError({ code: "internal_error", reason, traceId });
  });
}

const appendSessionCookie = (cookieName: string, token: string, expiresAt: DateTime.DateTime) =>
  Effect.fromResult(
    Cookies.set(Cookies.empty, cookieName, token, {
      expires: DateTime.toDate(expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    }),
  ).pipe(
    Effect.catch(() => failEnvironmentInternal("browser_session_cookie_failed")),
    Effect.flatMap((cookies) =>
      HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(HttpServerResponse.mergeCookies(response, cookies)),
      ),
    ),
  );

export const requireEnvironmentScope = Effect.fn("environment.auth.requireScope")(function* (
  scope: AuthEnvironmentScope,
) {
  const session = yield* EnvironmentAuthenticatedPrincipal;
  if (!session.scopes.has(scope)) {
    return yield* failEnvironmentScopeRequired(scope);
  }
  return session;
});

export const environmentAuthenticatedAuthLayer = Layer.effect(
  EnvironmentAuthenticatedAuth,
  Effect.gen(function* () {
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const sessions = yield* SessionStore.SessionStore;
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        yield* guardDeviceAdministratorHttpRequest.pipe(
          Effect.provideService(SessionStore.SessionStore, sessions),
          Effect.catchTag("EnvironmentOperationForbiddenError", () =>
            failEnvironmentAuthInvalid("invalid_credential"),
          ),
        );
        const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
            failEnvironmentAuthInvalid(
              EnvironmentAuth.serverAuthCredentialReason(error),
              EnvironmentAuth.serverAuthDpopFailureReason(error),
            ),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("internal_error", error),
          ),
        );
        return yield* httpEffect.pipe(
          Effect.provideService(EnvironmentAuthenticatedPrincipal, {
            ...session,
            scopes: new Set(session.scopes),
          }),
          session.subject === "cloud-connect" ? traceAuthenticatedRelayRequest : identity,
        );
      }).pipe(Effect.catchTag("EnvironmentAuthInvalidError", appendDpopChallengeOnUnauthorized));
  }),
);

export const authHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "auth",
  Effect.fnUntraced(function* (handlers) {
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const sessions = yield* SessionStore.SessionStore;

    return handlers
      .handle(
        "session",
        Effect.fn("environment.auth.session")(
          function* (args) {
            yield* annotateEnvironmentRequest(args.endpoint.name);
            const request = yield* HttpServerRequest.HttpServerRequest;
            const result = yield* serverAuth.getSessionState(request);
            const credential = EnvironmentAuth.selectRequestCredential(
              request,
              sessions.cookieName,
              sessions.legacyCookieName,
            );
            if (
              credential?.source === "legacy-cookie" &&
              result.authenticated &&
              result.sessionMethod === "browser-session-cookie" &&
              result.expiresAt
            ) {
              yield* appendSessionCookie(sessions.cookieName, credential.token, result.expiresAt);
              yield* appendCredentialResponseHeaders;
            }
            return result;
          },
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("internal_error", error),
          ),
        ),
      )
      .handle(
        "browserSession",
        Effect.fn("environment.auth.browserSession")(
          function* (args) {
            yield* annotateEnvironmentRequest(args.endpoint.name);
            const request = yield* HttpServerRequest.HttpServerRequest;
            const result = yield* serverAuth.createBrowserSession(
              args.payload.credential,
              deriveAuthClientMetadata({ request }),
            );
            yield* appendSessionCookie(
              sessions.cookieName,
              result.sessionToken,
              result.response.expiresAt,
            );
            yield* appendCredentialResponseHeaders;
            return result.response;
          },
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
            failEnvironmentAuthInvalid(
              EnvironmentAuth.serverAuthCredentialReason(error),
              EnvironmentAuth.serverAuthDpopFailureReason(error),
            ),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("browser_session_issuance_failed", error),
          ),
        ),
      )
      .handle(
        "token",
        Effect.fn("environment.auth.token")(
          function* (args) {
            yield* annotateEnvironmentRequest(args.endpoint.name);
            const request = yield* HttpServerRequest.HttpServerRequest;
            const requestedScopes =
              args.payload.scope === undefined
                ? undefined
                : parseAllowedOAuthScope({
                    value: args.payload.scope,
                    allowedScopes: new Set<AuthEnvironmentScope>([
                      AuthOrchestrationReadScope,
                      AuthOrchestrationOperateScope,
                      AuthTerminalOperateScope,
                      AuthReviewWriteScope,
                      AuthAccessReadScope,
                      AuthAccessWriteScope,
                      AuthRelayReadScope,
                      AuthRelayWriteScope,
                    ]),
                  });
            if (requestedScopes === null) {
              return yield* failEnvironmentInvalidRequest("invalid_scope");
            }
            const proofKeyThumbprint = args.headers.dpop
              ? yield* verifyRequestDpopProof({ request }).pipe(
                  Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
                    appendDpopChallengeHeader.pipe(
                      Effect.andThen(
                        failEnvironmentAuthInvalid(
                          "invalid_credential",
                          EnvironmentAuth.serverAuthDpopFailureReason(error),
                        ),
                      ),
                    ),
                  ),
                  Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
                    failEnvironmentInternal("access_token_issuance_failed", error),
                  ),
                )
              : undefined;
            yield* appendCredentialResponseHeaders;
            return yield* serverAuth.exchangeBootstrapCredentialForAccessToken(
              args.payload.subject_token,
              requestedScopes,
              deriveAuthClientMetadata({
                request,
                presented: {
                  ...(args.payload.client_label ? { label: args.payload.client_label } : {}),
                  ...(args.payload.client_device_type
                    ? { deviceType: args.payload.client_device_type }
                    : {}),
                  ...(args.payload.client_os ? { os: args.payload.client_os } : {}),
                },
              }),
              proofKeyThumbprint ? { proofKeyThumbprint } : undefined,
            );
          },
          traceRelayRequest,
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
            failEnvironmentAuthInvalid(
              EnvironmentAuth.serverAuthCredentialReason(error),
              EnvironmentAuth.serverAuthDpopFailureReason(error),
            ),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInvalidRequestError, (error) =>
            failEnvironmentInvalidRequest(EnvironmentAuth.serverAuthInvalidRequestReason(error)),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("access_token_issuance_failed", error),
          ),
        ),
      )
      .handle(
        "webSocketTicket",
        Effect.fn("environment.auth.webSocketTicket")(
          function* (args) {
            yield* annotateEnvironmentRequest(args.endpoint.name);
            const session = yield* EnvironmentAuthenticatedPrincipal;
            yield* appendCredentialResponseHeaders;
            return yield* serverAuth.issueWebSocketTicket(session);
          },
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("websocket_ticket_issuance_failed", error),
          ),
        ),
      )
      .handle(
        "pairingCredential",
        Effect.fn("environment.auth.pairingCredential")(function* () {
          yield* appendCredentialResponseHeaders;
          return yield* failEnvironmentAuthInvalid("invalid_credential");
        }),
      );
  }),
);
const mapAdminMutationErrors = <A, R>(
  effect: Effect.Effect<A, AdminAccess.AdminAccessMutationError, R>,
  internalReason: EnvironmentInternalErrorReason,
) =>
  effect.pipe(
    Effect.catchTags({
      AdminAccessRevisionConflictError: (error) =>
        failEnvironmentConflict(`Access state changed at revision ${error.revision}.`),
      AdminAccessNotFoundError: (error) =>
        failEnvironmentNotFound(
          error.resource === "client" ? "client_not_found" : "pairing_code_not_found",
        ),
      AdminAccessInternalError: () => failEnvironmentInternal(internalReason),
    }),
  );

export const adminHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "admin",
  Effect.fnUntraced(function* (handlers) {
    const adminAccess = yield* AdminAccess.AdminAccess;
    const rateLimitState = yield* Ref.make<DeviceAdministratorPolicy.DeviceAdministratorRateState>(
      new Map(),
    );
    const enforceRateLimit = Effect.fn("environment.admin.enforceRateLimit")(function* (
      sessionId: string,
      operationClass: "read" | "write",
    ) {
      const now = yield* DateTime.now;
      const allowed = yield* Ref.modify(rateLimitState, (current) =>
        DeviceAdministratorPolicy.admitDeviceAdministratorOperation(
          current,
          sessionId,
          operationClass,
          now.epochMilliseconds,
        ),
      );
      if (!allowed) {
        return yield* failEnvironmentRateLimited(60);
      }
    });

    return handlers
      .handle(
        "listClientPresence",
        Effect.fn("environment.admin.listClientPresence")(
          function* () {
            const session = yield* requireDeviceAdministratorAuthority();
            yield* enforceRateLimit(session.sessionId, "read");
            yield* appendCredentialResponseHeaders;
            return yield* adminAccess.snapshot(session.clientId);
          },
          Effect.catchTag("AdminAccessInternalError", () =>
            failEnvironmentInternal("admin_access_load_failed"),
          ),
        ),
      )
      .handle(
        "createClientPairingCode",
        Effect.fn("environment.admin.createClientPairingCode")(
          function* (args) {
            const session = yield* requireDeviceAdministratorAuthority();
            yield* enforceRateLimit(session.sessionId, "write");
            yield* appendCredentialResponseHeaders;
            return yield* adminAccess.createPairingCode({
              ...(args.payload.label === undefined ? {} : { label: args.payload.label }),
              ttlSeconds: args.payload.ttlSeconds,
            });
          },
          Effect.catchTags({
            AdminAccessInternalError: () =>
              failEnvironmentInternal("pairing_credential_issuance_failed"),
            AdminAccessOutstandingPairingLimitError: (error) =>
              failEnvironmentConflict(
                `At most ${error.limit} outstanding device pairing codes are allowed.`,
              ),
          }),
        ),
      )
      .handle(
        "revokePairingCode",
        Effect.fn("environment.admin.revokePairingCode")(function* (args) {
          const session = yield* requireDeviceAdministratorAuthority();
          yield* enforceRateLimit(session.sessionId, "write");
          yield* appendCredentialResponseHeaders;
          return yield* mapAdminMutationErrors(
            adminAccess.revokePairingCode(args.payload),
            "admin_pairing_code_mutation_failed",
          );
        }),
      )
      .handle(
        "enableClient",
        Effect.fn("environment.admin.enableClient")(function* (args) {
          const session = yield* requireDeviceAdministratorAuthority();
          yield* enforceRateLimit(session.sessionId, "write");
          yield* appendCredentialResponseHeaders;
          return yield* mapAdminMutationErrors(
            adminAccess.setClientEnabled({
              currentClientId: session.clientId,
              ...args.payload,
              enabled: true,
            }),
            "admin_client_mutation_failed",
          );
        }),
      )
      .handle(
        "disableClient",
        Effect.fn("environment.admin.disableClient")(function* (args) {
          const session = yield* requireDeviceAdministratorAuthority();
          yield* enforceRateLimit(session.sessionId, "write");
          yield* appendCredentialResponseHeaders;
          return yield* mapAdminMutationErrors(
            adminAccess.setClientEnabled({
              currentClientId: session.clientId,
              ...args.payload,
              enabled: false,
            }),
            "admin_client_mutation_failed",
          );
        }),
      )
      .handle(
        "deleteClient",
        Effect.fn("environment.admin.deleteClient")(function* (args) {
          const session = yield* requireDeviceAdministratorAuthority();
          yield* enforceRateLimit(session.sessionId, "write");
          yield* appendCredentialResponseHeaders;
          return yield* mapAdminMutationErrors(
            adminAccess.deleteClient({
              currentClientId: session.clientId,
              ...args.payload,
            }),
            "admin_client_mutation_failed",
          );
        }),
      );
  }),
);

function failEnvironmentRateLimited(retryAfterSeconds: number) {
  return currentEnvironmentTraceId.pipe(
    Effect.flatMap((traceId) =>
      Effect.fail(
        new EnvironmentRateLimitError({ code: "rate_limited", retryAfterSeconds, traceId }),
      ),
    ),
  );
}

function failEnvironmentConflict(message: string) {
  return Effect.fail(new EnvironmentHttpConflictError({ message }));
}

const policyRequest = (
  request: HttpServerRequest.HttpServerRequest,
  sessions: SessionStore.SessionStore["Service"],
) => ({
  method: request.method,
  pathname: new URL(request.url, "http://environment.test").pathname,
  headers: request.headers,
  credentialSource: EnvironmentAuth.selectRequestCredential(
    request,
    sessions.cookieName,
    sessions.legacyCookieName,
  )?.source,
});

export const requireDeviceAdministratorAuthority = Effect.fn(
  "environment.auth.requireDeviceAdministratorAuthority",
)(function* () {
  yield* appendCredentialResponseHeaders;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const sessions = yield* SessionStore.SessionStore;
  const principal = yield* EnvironmentAuthenticatedPrincipal;
  if (
    !DeviceAdministratorPolicy.permitsDeviceAdministratorRequest(
      policyRequest(request, sessions),
      principal,
    )
  ) {
    return yield* failEnvironmentOperationForbidden("authority_not_allowed");
  }
  return principal;
});

/** Install before every HTTP dispatch, including unauthenticated application endpoints. */
export const guardDeviceAdministratorHttpRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const sessions = yield* SessionStore.SessionStore;
  const input = policyRequest(request, sessions);
  const isPortalPath = DeviceAdministratorPolicy.isDeviceAdministratorPath(input.pathname);
  if (isPortalPath) yield* appendCredentialResponseHeaders;
  const selected = EnvironmentAuth.selectRequestCredential(
    request,
    sessions.cookieName,
    sessions.legacyCookieName,
  );
  // Inspect every presented session so a cookie cannot hide a portal bearer token.
  const tokens = new Set(
    [
      selected?.token,
      request.cookies[sessions.cookieName],
      sessions.legacyCookieName === undefined
        ? undefined
        : request.cookies[sessions.legacyCookieName],
      parseAuthorizationCredential(request.headers.authorization)?.token,
    ].filter((token): token is string => token !== undefined),
  );
  let portalSeen = false;
  for (const token of tokens) {
    const authority = yield* sessions.identifySignedAuthority(token).pipe(Effect.option);
    if (authority._tag === "Some" && authority.value === "device-administrator") {
      yield* appendCredentialResponseHeaders;
      if (selected?.token !== token || !isPortalPath)
        return yield* failEnvironmentOperationForbidden("authority_not_allowed");
      const verified = yield* sessions.verify(token).pipe(Effect.option);
      if (
        verified._tag !== "Some" ||
        DeviceAdministratorPolicy.deviceAdministratorHttpDecision(input, verified.value) !==
          "portal"
      ) {
        return yield* failEnvironmentOperationForbidden("authority_not_allowed");
      }
      portalSeen = true;
    }
  }

  if (isPortalPath && !portalSeen)
    return yield* failEnvironmentOperationForbidden("authority_not_allowed");
});
