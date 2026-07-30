import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopConnectionCatalogStore from "../../app/DesktopConnectionCatalogStore.ts";
import { setConnectionCatalog } from "./connectionCatalog.ts";

function catalogStoreLayer(stored: boolean) {
  return Layer.succeed(
    DesktopConnectionCatalogStore.DesktopConnectionCatalogStore,
    DesktopConnectionCatalogStore.DesktopConnectionCatalogStore.of({
      get: Effect.succeed(Option.none()),
      set: () => Effect.succeed(stored),
      clear: Effect.void,
    }),
  );
}

describe("setConnectionCatalog", () => {
  it.effect("returns true when secure persistence succeeds", () =>
    Effect.gen(function* () {
      expect(yield* setConnectionCatalog.handler("{}")).toBe(true);
    }).pipe(Effect.provide(catalogStoreLayer(true))),
  );

  it.effect("returns false when secure storage is unavailable", () =>
    Effect.gen(function* () {
      expect(yield* setConnectionCatalog.handler("{}")).toBe(false);
    }).pipe(Effect.provide(catalogStoreLayer(false))),
  );
});
