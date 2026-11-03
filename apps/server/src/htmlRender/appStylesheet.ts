import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Record(
      Schema.String,
      Schema.Struct({ css: Schema.optional(Schema.Array(Schema.String)) }),
    ),
  ),
);

const FONT_URL = /url\(\/(assets\/[\w.-]+\.woff2)\)/g;

/**
 * The web client's own stylesheet, with its fonts inlined, so a headless page lays text out as
 * the board does. Null when the server has no built client, as in development and tests.
 */
export const loadAppStylesheet = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const staticDir = config.staticDir;
  if (staticDir === undefined) return null;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = yield* fileSystem
    .readFileString(path.join(staticDir, ".vite", "manifest.json"))
    .pipe(Effect.flatMap(decodeManifest));
  const sheets = manifest["src/main.tsx"]?.css ?? [];
  if (sheets.length === 0) return null;
  const css = (yield* Effect.forEach(sheets, (sheet) =>
    fileSystem.readFileString(path.join(staticDir, sheet)),
  )).join("\n");
  const fonts = new Map<string, string>();
  for (const [, asset] of css.matchAll(FONT_URL)) {
    if (asset === undefined || fonts.has(asset)) continue;
    const bytes = yield* fileSystem.readFile(path.join(staticDir, asset));
    fonts.set(asset, `data:font/woff2;base64,${Buffer.from(bytes).toString("base64")}`);
  }
  return css.replace(FONT_URL, (match, asset: string) => {
    const data = fonts.get(asset);
    return data === undefined ? match : `url(${data})`;
  });
}).pipe(Effect.orElseSucceed(() => null));
