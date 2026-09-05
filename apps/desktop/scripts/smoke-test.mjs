import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { resolveElectronLaunchCommand } from "./electron-launcher.mjs";

const fatalPatterns = [
  "Cannot find module",
  "MODULE_NOT_FOUND",
  "Refused to execute",
  "Uncaught Error",
  "Uncaught TypeError",
  "Uncaught ReferenceError",
  "Unable to load preload script",
];

export function evaluateDesktopSmokeResult({ output, code, timedOut }) {
  const failures = fatalPatterns.filter((pattern) => output.includes(pattern));
  if (!timedOut) failures.push("Desktop exited before the smoke observation window completed");
  if (code !== null && code !== 0) failures.push(`Desktop exited with status ${code}`);
  return [...new Set(failures)];
}

export function runDesktopSmokeTest() {
  const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
  const desktopDir = NodePath.resolve(__dirname, "..");
  const mainJs = NodePath.resolve(desktopDir, "dist-electron/main.cjs");

  console.log("\nLaunching Electron smoke test...");

  const electronCommand = resolveElectronLaunchCommand([mainJs]);
  const child = NodeChildProcess.spawn(electronCommand.electronPath, electronCommand.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "",
      ELECTRON_ENABLE_LOGGING: "1",
    },
  });

  let output = "";
  let timedOut = false;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 8_000);

  child.on("exit", (code) => {
    clearTimeout(timeout);
    const failures = evaluateDesktopSmokeResult({ output, code, timedOut });
    if (failures.length > 0) {
      console.error("\nDesktop smoke test failed:");
      for (const failure of failures) {
        console.error(` - ${failure}`);
      }
      console.error("\nFull output:\n" + output);
      process.exitCode = 1;
      return;
    }

    console.log("Desktop smoke test passed.");
  });
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  runDesktopSmokeTest();
}
