import { expect, it } from "@effect/vitest";
import {
  admitDeviceAdministratorOperation,
  deviceAdministratorHttpDecision,
  deviceAdministratorHttpRoutes,
  permitsOrdinaryClient,
  type DeviceAdministratorPrincipal,
  type DeviceAdministratorRateState,
  type DeviceAdministratorRequest,
} from "./DeviceAdministratorPolicy.ts";

const portal: DeviceAdministratorPrincipal = {
  authorityClass: "device-administrator",
  method: "bearer-access-token",
  scopes: [],
};
const request: DeviceAdministratorRequest = {
  method: "GET",
  pathname: "/api/auth/admin/clients",
  headers: {},
  credentialSource: "bearer",
};

it("admits exactly six portal method and path pairs after host replacement", () => {
  expect([...deviceAdministratorHttpRoutes]).toEqual([
    "GET /api/auth/admin/clients",
    "POST /api/auth/admin/client-pairing-codes",
    "POST /api/auth/admin/pairing-codes/revoke",
    "POST /api/auth/admin/clients/enable",
    "POST /api/auth/admin/clients/disable",
    "POST /api/auth/admin/clients/delete",
  ]);
  const hosts = [
    (method: string, pathname: string) =>
      deviceAdministratorHttpDecision({ ...request, method, pathname }, portal),
    (method: string, pathname: string) => {
      const input = new Request(`https://service.example.test${pathname}`, { method });
      return deviceAdministratorHttpDecision(
        { ...request, method: input.method, pathname: new URL(input.url).pathname },
        portal,
      );
    },
  ];
  for (const host of hosts) {
    for (const route of deviceAdministratorHttpRoutes) {
      const [method, pathname] = route.split(" ") as [string, string];
      expect(host(method, pathname)).toBe("portal");
      expect(host("DELETE", pathname)).toBe("deny");
      expect(host(method, `${pathname}/`)).toBe("deny");
    }
    for (const pathname of [
      "/api/auth/session",
      "/api/auth/ws-ticket",
      "/api/auth/admin/pairing-codes",
      "/api/auth/clients",
      "/api/projects",
      "/api/git",
      "/api/providers",
      "/api/files",
      "/oauth/token",
      "/api/cloud",
      "/ws",
      "/",
    ]) {
      expect(host("GET", pathname)).toBe("deny");
    }
  }
  expect(permitsOrdinaryClient(portal)).toBe(false);
});

it("rejects ordinary, administrative-scoped, browser, missing, and proof-bound principals", () => {
  for (const principal of [
    undefined,
    { ...portal, authorityClass: "client" as const },
    { ...portal, scopes: ["access:read", "access:write"] },
    { ...portal, method: "browser-session-cookie" as const },
    { ...portal, method: "dpop-access-token" as const },
  ]) {
    expect(deviceAdministratorHttpDecision(request, principal)).toBe("deny");
  }
  for (const credentialSource of [undefined, "cookie", "legacy-cookie", "dpop"] as const) {
    expect(deviceAdministratorHttpDecision({ ...request, credentialSource }, portal)).toBe("deny");
  }
  for (const headers of [
    { origin: "https://service.example.test" },
    { "sec-fetch-site": "none" },
    { "sec-fetch-mode": "cors" },
    { "sec-fetch-dest": "empty" },
  ]) {
    expect(deviceAdministratorHttpDecision({ ...request, headers }, portal)).toBe("deny");
  }
  expect(deviceAdministratorHttpDecision({ ...request, pathname: "/oauth/token" }, undefined)).toBe(
    "ordinary",
  );
});

it("bounds read and write rates and expires dormant limiter state", () => {
  let state: DeviceAdministratorRateState = new Map();
  for (const operation of ["read", "write"] as const) {
    for (let index = 0; index < (operation === "read" ? 120 : 30); index++) {
      const [allowed, next] = admitDeviceAdministratorOperation(
        state,
        "synthetic-operator",
        operation,
        0,
      );
      expect(allowed).toBe(true);
      state = next;
    }
    expect(admitDeviceAdministratorOperation(state, "synthetic-operator", operation, 0)[0]).toBe(
      false,
    );
  }
  const [allowed, next] = admitDeviceAdministratorOperation(
    state,
    "replacement-operator",
    "write",
    60_000,
  );
  expect(allowed).toBe(true);
  expect(next.size).toBe(1);
});
