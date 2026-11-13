// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite config runs before any Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite config runs before any Effect runtime.
import * as NodePath from "node:path";

import type { Plugin } from "vite-plus";

// ExcalidrawBoard sets window.EXCALIDRAW_ASSET_PATH to "/excalidraw/", and Excalidraw asks
// for "fonts/<family>/<file>.woff2" below it.
const FONTS_URL_PATH = "/excalidraw/fonts";
// Resolved like any import, so it holds however the package was installed. The package's
// default entry is dist/prod/index.js, beside its fonts.
const FONTS_DIR = NodePath.join(
  NodePath.dirname(NodeModule.createRequire(import.meta.url).resolve("@excalidraw/excalidraw")),
  "fonts",
);

// Serves Excalidraw's fonts from the dev server and emits them into the build, which the
// server and the desktop app serve as the client. Only the package's own font files are
// served, so a request can never reach outside the fonts directory.
export function excalidrawFontsPlugin(): Plugin {
  const fontFiles = new Set(
    NodeFS.readdirSync(FONTS_DIR, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".woff2"))
      .map((file) => file.split(NodePath.sep).join("/")),
  );

  return {
    name: "t3code:excalidraw-fonts",
    configureServer(server) {
      server.middlewares.use(FONTS_URL_PATH, (req, res, next) => {
        const file = (req.url ?? "").split("?", 1)[0]!.slice(1);
        if (!fontFiles.has(file)) return next();
        res.setHeader("Content-Type", "font/woff2");
        NodeFS.createReadStream(NodePath.join(FONTS_DIR, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of fontFiles) {
        this.emitFile({
          type: "asset",
          fileName: `${FONTS_URL_PATH.slice(1)}/${file}`,
          source: NodeFS.readFileSync(NodePath.join(FONTS_DIR, file)),
        });
      }
    },
  };
}
