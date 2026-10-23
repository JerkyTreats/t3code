import * as NodeFS from "node:fs";

const mainPath = new URL("../dist-electron/main.cjs", import.meta.url);
const mapPath = new URL("../dist-electron/main.cjs.map", import.meta.url);
const preloadPath = new URL("../dist-electron/preload.cjs", import.meta.url);
const preloadMapPath = new URL("../dist-electron/preload.cjs.map", import.meta.url);
const main = NodeFS.readFileSync(mainPath, "utf8");
const preload = NodeFS.readFileSync(preloadPath, "utf8");
const map = JSON.parse(NodeFS.readFileSync(mapPath, "utf8"));
const preloadMap = JSON.parse(NodeFS.readFileSync(preloadMapPath, "utf8"));

for (const value of [
  "child_process",
  "msgpackr-extract",
  "node-gyp-build",
  "detect-libc",
  "codex app-server",
  "thread-adapter-handoff",
  "DesktopThreadHandoffOwner",
  "requestSingleInstanceLock",
  "second-instance",
]) {
  if (main.includes(value)) {
    throw new Error(`Packed T3 Thread main contains forbidden bytes: ${value}`);
  }
}

for (const source of map.sources) {
  if (/\/apps\/(?:server|desktop)\//.test(source)) {
    throw new Error(`Packed T3 Thread main contains a forbidden owner: ${source}`);
  }
}

for (const value of [
  "x-t3-thread-ticket",
  "webSocketEndpoint",
  "adapterBearer",
  "desktopBootstrapCredential",
  "desktopBridge",
  "access_token",
  "oauth/token",
  "safeStorage",
  "encryptString",
  "decryptString",
  "getLocalEnvironmentBearerToken",
  "bearerCredential",
  'require("./',
]) {
  if (preload.includes(value)) {
    throw new Error(`Packed T3 Thread preload contains forbidden authority bytes: ${value}`);
  }
}

for (const source of preloadMap.sources) {
  if (/\/apps\/(?:server|desktop)\//.test(source)) {
    throw new Error(`Packed T3 Thread preload contains a forbidden owner: ${source}`);
  }
}

for (const required of [
  "t3-thread-client",
  "mkdtempSync",
  "t3ThreadBridge",
  "submitPairingCredential",
]) {
  if (!`${main}\n${preload}`.includes(required)) {
    throw new Error(`Packed T3 Thread client is missing required ownership bytes: ${required}`);
  }
}
