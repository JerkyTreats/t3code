import { expect, it } from "@effect/vitest";

import { parseAuthorizationCredential } from "./authorizationCredential.ts";

it("normalizes bearer and DPoP schemes and separators without changing token bytes", () => {
  for (const header of ["Bearer Token", "Bearer   Token  ", "bearer\tToken", " bEaReR Token "]) {
    expect(parseAuthorizationCredential(header)).toEqual({ source: "bearer", token: "Token" });
  }
  for (const header of ["DPoP Token", "dpop   Token", "DPOP\tToken "]) {
    expect(parseAuthorizationCredential(header)).toEqual({ source: "dpop", token: "Token" });
  }
  for (const header of [undefined, "", "Bearer", "Bearer ", "Basic Token", "Bearer One Two"]) {
    expect(parseAuthorizationCredential(header)).toBeUndefined();
  }
});
