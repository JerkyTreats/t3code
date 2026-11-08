// @effect-diagnostics nodeBuiltinImport:off -- The entrypoint loads the CLI before its runtime exists.
import * as NodeModule from "node:module";
import * as NodeSea from "node:sea";
import * as NodeURL from "node:url";

import { isEntrypoint } from "./entrypoint.ts";

// Loads the CLI module graph. Packaged builds embed it as a raw asset.
async function loadCliMain(): Promise<typeof import("./binMain.ts")> {
  if (!NodeSea.isSea()) return import("./binMain.ts");

  // Keep the executable's module URL so the CLI finds the web client and native packages beside it.
  const require = NodeModule.createRequire(import.meta.url);
  // require() resolves links in the executable path, such as a Windows junction.
  const cliUrl = NodeURL.pathToFileURL(require.resolve(process.execPath)).href;
  const hook = NodeModule.registerHooks({
    load(url, context, next) {
      if (url !== cliUrl) return next(url, context);
      return {
        format: "module",
        source: new Uint8Array(NodeSea.getRawAsset("binMain.mjs")),
        shortCircuit: true,
      };
    },
  });
  try {
    return require(process.execPath) as typeof import("./binMain.ts");
  } finally {
    hook.deregister();
  }
}

if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: process.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  const { runCliCommand } = await loadCliMain();
  await runCliCommand();
}
