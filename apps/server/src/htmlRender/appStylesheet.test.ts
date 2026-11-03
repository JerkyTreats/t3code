import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import { loadAppStylesheet } from "./appStylesheet.ts";

const withStaticDir = (staticDir: string | undefined) =>
  Effect.provide(
    Layer.effect(
      ServerConfig.ServerConfig,
      ServerConfig.ServerConfig.pipe(
        Effect.map((config) => ServerConfig.make({ ...config, staticDir })),
      ),
    ).pipe(
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-app-stylesheet-test-" })),
    ),
  );

it.effect("inlines the main entry's stylesheet and its fonts", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fileSystem.makeTempDirectoryScoped();
    yield* fileSystem.makeDirectory(path.join(dir, ".vite"));
    yield* fileSystem.makeDirectory(path.join(dir, "assets"));
    yield* fileSystem.writeFileString(
      path.join(dir, ".vite", "manifest.json"),
      JSON.stringify({ "src/main.tsx": { file: "assets/main.js", css: ["assets/main.css"] } }),
    );
    yield* fileSystem.writeFileString(
      path.join(dir, "assets", "main.css"),
      "@font-face{src:url(/assets/inter.woff2)format('woff2')}.chat-markdown{font-size:14px}",
    );
    yield* fileSystem.writeFile(path.join(dir, "assets", "inter.woff2"), new Uint8Array([1, 2, 3]));

    const css = yield* loadAppStylesheet.pipe(withStaticDir(dir));
    expect(css).toBe(
      "@font-face{src:url(data:font/woff2;base64,AQID)format('woff2')}.chat-markdown{font-size:14px}",
    );
    expect(yield* loadAppStylesheet.pipe(withStaticDir(undefined))).toBeNull();
    expect(yield* loadAppStylesheet.pipe(withStaticDir(path.join(dir, "missing")))).toBeNull();
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
