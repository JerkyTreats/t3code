import type { AuthSessionAuthorityClass, ServerAuthSessionMethod } from "@t3tools/contracts";

export const deviceAdministratorHttpRoutes: ReadonlySet<string> = new Set([
  "GET /api/auth/admin/clients",
  "POST /api/auth/admin/client-pairing-codes",
  "POST /api/auth/admin/pairing-codes/revoke",
  "POST /api/auth/admin/clients/enable",
  "POST /api/auth/admin/clients/disable",
  "POST /api/auth/admin/clients/delete",
]);

export const isDeviceAdministratorPath = (pathname: string): boolean =>
  pathname === "/api/auth/admin" || pathname.startsWith("/api/auth/admin/");

export interface DeviceAdministratorRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly credentialSource: "bearer" | "cookie" | "legacy-cookie" | "dpop" | undefined;
}

export interface DeviceAdministratorPrincipal {
  readonly authorityClass: AuthSessionAuthorityClass;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: Iterable<string>;
}

/** The portal is a device-admission root with an exact server-to-server boundary. */
export function permitsDeviceAdministratorRequest(
  request: DeviceAdministratorRequest,
  principal: DeviceAdministratorPrincipal | undefined,
): boolean {
  return (
    principal?.authorityClass === "device-administrator" &&
    principal.method === "bearer-access-token" &&
    Array.from(principal.scopes).length === 0 &&
    request.credentialSource === "bearer" &&
    request.headers.origin === undefined &&
    !Object.keys(request.headers).some((name) => name.toLowerCase().startsWith("sec-fetch-")) &&
    deviceAdministratorHttpRoutes.has(`${request.method} ${request.pathname}`)
  );
}

export function permitsOrdinaryClient(principal: DeviceAdministratorPrincipal): boolean {
  return principal.authorityClass === "client";
}

export function deviceAdministratorHttpDecision(
  request: DeviceAdministratorRequest,
  principal: DeviceAdministratorPrincipal | undefined,
): "ordinary" | "portal" | "deny" {
  if (
    principal?.authorityClass === "device-administrator" ||
    isDeviceAdministratorPath(request.pathname)
  ) {
    return permitsDeviceAdministratorRequest(request, principal) ? "portal" : "deny";
  }
  return "ordinary";
}

export type DeviceAdministratorRateState = ReadonlyMap<
  string,
  { readonly windowStartedAt: number; readonly count: number }
>;
export function admitDeviceAdministratorOperation(
  state: DeviceAdministratorRateState,
  sessionId: string,
  operationClass: "read" | "write",
  now: number,
): readonly [boolean, DeviceAdministratorRateState] {
  const windowMs = 60_000;
  const limit = operationClass === "read" ? 120 : 30;
  const key = `${sessionId}:${operationClass}`;
  const existing = state.get(key);
  const next = new Map([...state].filter(([, entry]) => now - entry.windowStartedAt < windowMs));
  if (existing === undefined || now - existing.windowStartedAt >= windowMs) {
    next.set(key, { windowStartedAt: now, count: 1 });
    return [true, next];
  }
  if (existing.count >= limit) return [false, next];
  next.set(key, { ...existing, count: existing.count + 1 });
  return [true, next];
}
