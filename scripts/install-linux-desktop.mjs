import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  LAUNCHER_CONTRACT_VERSION,
  OFFICIAL_LINUX_LAUNCHER_IDENTITY,
} from "./linux-desktop-launcher.mjs";
import {
  linuxDesktopReleaseDescriptorPath,
  readAndVerifyLinuxDesktopReleaseDescriptor,
} from "./linux-desktop-release-artifact.ts";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone installer has no Effect runtime.
const HOST_ARCHITECTURE = NodeOS.arch();
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone installer has no Effect runtime.
const HOST_PLATFORM = NodeOS.platform();

const scriptDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const repositoryRoot = NodePath.resolve(scriptDirectory, "..");
const STAGING_PRODUCT_NAME = "T3 Code (Staging)";
const PRODUCTION_PRODUCT_NAME = "T3 Code";
const URL_HANDLER_NAME = "t3code-url-handler.desktop";
const OMARCHY_ADAPTER_CONTRACT_VERSION = 1;
const OMARCHY_STOCK_BIN_DIRECTORY = "/usr/bin";
const OMARCHY_HYPR_MARKER_START = "-- >>> T3 Code managed Omarchy adapter >>>";
const OMARCHY_HYPR_MARKER_END = "-- <<< T3 Code managed Omarchy adapter <<<";
const OMARCHY_MENU_MARKER_START = "  // >>> T3 Code managed Omarchy adapter >>>";
const OMARCHY_MENU_MARKER_END = "  // <<< T3 Code managed Omarchy adapter <<<";
const OMARCHY_MENU_ENTRY_ID = "setup.default.agent.t3code";

export function resolveInstallPaths(environment = process.env) {
  const home = environment.HOME || NodeOS.homedir();
  const dataHome = environment.XDG_DATA_HOME || NodePath.join(home, ".local", "share");
  const configHome = environment.XDG_CONFIG_HOME || NodePath.join(home, ".config");
  const installRoot = NodePath.join(dataHome, "t3code-desktop");
  return {
    installRoot,
    artifactsRoot: NodePath.join(installRoot, "artifacts"),
    launcherPath: NodePath.join(installRoot, "bin", "linux-desktop-launcher.mjs"),
    currentPath: NodePath.join(installRoot, "current"),
    servicePath: NodePath.join(configHome, "systemd", "user", "t3code-desktop.service"),
    stagingServicePath: NodePath.join(
      configHome,
      "systemd",
      "user",
      "t3code-desktop-staging.service",
    ),
    legacyProductionServicePath: NodePath.join(
      configHome,
      "systemd",
      "user",
      "t3code-desktop-production.service",
    ),
    desktopEntryPath: NodePath.join(dataHome, "applications", "t3code.desktop"),
    stagingDesktopEntryPath: NodePath.join(dataHome, "applications", "t3code-staging.desktop"),
    urlHandlerPath: NodePath.join(dataHome, "applications", URL_HANDLER_NAME),
    iconPath: NodePath.join(installRoot, "icon.png"),
    ownershipManifestPath: NodePath.join(installRoot, "install-manifest.json"),
    omarchyAdapterBinRoot: NodePath.join(installRoot, "omarchy", "bin"),
    omarchyCommandPath: NodePath.join(installRoot, "omarchy", "bin", "omarchy"),
    omarchyAgentPath: NodePath.join(installRoot, "omarchy", "bin", "omarchy-agent"),
    omarchyDefaultAgentPath: NodePath.join(installRoot, "omarchy", "bin", "omarchy-default-agent"),
    omarchyHyprModulePath: NodePath.join(configHome, "hypr", "t3code_omarchy.lua"),
    omarchyHyprConfigPath: NodePath.join(configHome, "hypr", "hyprland.lua"),
    omarchyUwsmEnvironmentPath: NodePath.join(configHome, "uwsm", "env.d", "90-t3code"),
    omarchyMenuPath: NodePath.join(configHome, "omarchy", "extensions", "omarchy-menu.jsonc"),
    stagingT3Home: NodePath.join(dataHome, "t3code-staging", "state"),
    stagingXdgConfigHome: NodePath.join(configHome, "t3code-staging"),
    productionT3Home: NodePath.join(dataHome, "t3code-production", "state"),
    productionXdgConfigHome: NodePath.join(configHome, "t3code-production"),
  };
}

function shellSingleQuote(value) {
  requireSingleLineArgument(value, "Shell");
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function markerRange(content, startMarker, endMarker, label) {
  // Shared configuration ownership is limited to one complete paired marker block.
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 !== end < 0) throw new Error(`${label} has an incomplete managed marker.`);
  if (start < 0) return null;
  if (
    content.indexOf(startMarker, start + startMarker.length) >= 0 ||
    content.indexOf(endMarker, end + endMarker.length) >= 0 ||
    end < start
  ) {
    throw new Error(`${label} has conflicting managed markers.`);
  }
  const lineEnd = content.indexOf("\n", end + endMarker.length);
  return { start, end: lineEnd < 0 ? content.length : lineEnd + 1 };
}

function removeMarkedBlock(content, startMarker, endMarker, label) {
  const range = markerRange(content, startMarker, endMarker, label);
  return range ? `${content.slice(0, range.start)}${content.slice(range.end)}` : content;
}

function readMarkedBlock(content, startMarker, endMarker, label) {
  const range = markerRange(content, startMarker, endMarker, label);
  return range ? content.slice(range.start, range.end) : null;
}

function renderMarkedHyprConfig(content) {
  const range = markerRange(
    content,
    OMARCHY_HYPR_MARKER_START,
    OMARCHY_HYPR_MARKER_END,
    "Hyprland configuration",
  );
  const block = `${OMARCHY_HYPR_MARKER_START}\nrequire("hypr.t3code_omarchy")\n${OMARCHY_HYPR_MARKER_END}\n`;
  if (range) return `${content.slice(0, range.start)}${block}${content.slice(range.end)}`;
  if (content.includes('require("hypr.t3code_omarchy")')) {
    throw new Error("Hyprland configuration already has an unmanaged T3 Code adapter require.");
  }
  const anchor = 'require("default.hypr.omarchy")';
  const anchorIndex = content.indexOf(anchor);
  if (anchorIndex < 0 || content.indexOf(anchor, anchorIndex + anchor.length) >= 0) {
    throw new Error("Hyprland configuration must have one stock Omarchy require anchor.");
  }
  const anchorLineEnd = content.indexOf("\n", anchorIndex + anchor.length);
  const insertion = anchorLineEnd < 0 ? content.length : anchorLineEnd + 1;
  const separator = anchorLineEnd < 0 ? "\n" : "";
  return `${content.slice(0, insertion)}${separator}${block}${content.slice(insertion)}`;
}

function inspectJsoncOuterObject(content) {
  let significant = "";
  let rootDepth = 0;
  let rootStarted = false;
  let rootEnd = -1;
  let beforeRootEnd = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (current === '"') {
      if (rootEnd >= 0) throw new Error("Omarchy menu JSONC has content after its outer object.");
      inString = true;
      significant = current;
    } else if (!/\s/.test(current)) {
      if (rootEnd >= 0) throw new Error("Omarchy menu JSONC has content after its outer object.");
      if (!rootStarted) {
        if (current !== "{") throw new Error("Omarchy menu extension must be a JSONC object.");
        rootStarted = true;
      }
      if (current === "{") rootDepth += 1;
      if (current === "}") {
        rootDepth -= 1;
        if (rootDepth < 0) throw new Error("Omarchy menu JSONC has an unmatched closing brace.");
        if (rootDepth === 0) {
          beforeRootEnd = significant;
          rootEnd = index;
        }
      }
      significant = current;
    }
  }
  if (inString || blockComment || !rootStarted || rootDepth !== 0 || rootEnd < 0) {
    throw new Error("Omarchy menu JSONC is incomplete.");
  }
  return { rootEnd, beforeRootEnd };
}

function renderMarkedOmarchyMenu(content, paths) {
  const range = markerRange(
    content,
    OMARCHY_MENU_MARKER_START,
    OMARCHY_MENU_MARKER_END,
    "Omarchy menu extension",
  );
  const contentWithoutOwnedBlock = range
    ? `${content.slice(0, range.start)}${content.slice(range.end)}`
    : content;
  if (contentWithoutOwnedBlock.includes(`"${OMARCHY_MENU_ENTRY_ID}"`)) {
    throw new Error("Omarchy menu already has an unmanaged T3 Code default-agent row.");
  }
  const { rootEnd: closingIndex, beforeRootEnd: significant } =
    inspectJsoncOuterObject(contentWithoutOwnedBlock);
  const beforeClosing = contentWithoutOwnedBlock.slice(0, closingIndex);
  if (significant === "") {
    throw new Error("Omarchy menu extension has an unsupported outer object shape.");
  }
  const prefix = significant === "{" || significant === "," ? "" : ",";
  const checkedCommand = `[[ "$(${shellSingleQuote(paths.omarchyDefaultAgentPath)})" == "t3code" ]]`;
  const action = `${shellSingleQuote(paths.omarchyDefaultAgentPath)} t3code`;
  const row = JSON.stringify({ icon: "󰚩", label: "T3 Code", checked: checkedCommand, action });
  const block = `${OMARCHY_MENU_MARKER_START}\n${prefix}  ${JSON.stringify(OMARCHY_MENU_ENTRY_ID)}: ${row}\n${OMARCHY_MENU_MARKER_END}\n`;
  return `${beforeClosing}${beforeClosing.endsWith("\n") ? "" : "\n"}${block}${contentWithoutOwnedBlock.slice(closingIndex)}`;
}

function mergePriorMenuMarkerPayload(currentBlock, priorBlock) {
  const entryToken = `${JSON.stringify(OMARCHY_MENU_ENTRY_ID)}:`;
  const currentLines = currentBlock.split("\n");
  const priorLines = priorBlock.split("\n");
  const currentIndexes = currentLines.flatMap((line, index) =>
    line.includes(entryToken) ? [index] : [],
  );
  const priorRows = priorLines.filter((line) => line.includes(entryToken));
  if (currentIndexes.length !== 1 || priorRows.length !== 1) {
    throw new Error("Omarchy menu marker does not contain one managed T3 Code row.");
  }
  const currentIndex = currentIndexes[0];
  const currentRow = currentLines[currentIndex];
  const priorRow = priorRows[0];
  const currentEntryIndex = currentRow.indexOf(entryToken);
  const priorEntryIndex = priorRow.indexOf(entryToken);
  currentLines[currentIndex] =
    `${currentRow.slice(0, currentEntryIndex)}${priorRow.slice(priorEntryIndex)}`;
  return currentLines.join("\n");
}

function requireSingleLineArgument(value, formatName) {
  if (value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new Error(`${formatName} arguments must be a single line.`);
  }
  return value;
}

export function quoteSystemdUnitPath(value) {
  const escapedSpecifiers = requireSingleLineArgument(value, "Systemd").replaceAll("%", "%%");
  if (/^[A-Za-z0-9_./:@+-]+$/.test(escapedSpecifiers)) return escapedSpecifiers;
  return `"${escapedSpecifiers.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function quoteSystemdArgument(value) {
  const escaped = requireSingleLineArgument(value, "Systemd")
    .replaceAll("%", "%%")
    .replaceAll("$", () => "$$");
  if (/^[A-Za-z0-9_./:@+-]+$/.test(escaped)) return escaped;
  return `"${escaped.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function requireEnvironmentVariableName(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error("Environment variable names must use uppercase ASCII identifiers.");
  }
  return name;
}

export function quoteSystemdEnvironmentAssignment(name, value) {
  return quoteSystemdUnitPath(`${requireEnvironmentVariableName(name)}=${value}`);
}

export function quoteDesktopExecArgument(value) {
  return `"${requireSingleLineArgument(value, "Desktop Exec")
    .replaceAll("%", "%%")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$")}"`;
}

export function quoteDesktopEnvironmentAssignment(name, value) {
  return quoteDesktopExecArgument(`${requireEnvironmentVariableName(name)}=${value}`);
}

function escapeDesktopStringValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
}

function quoteUrlHandlerExecArgument(value) {
  const quoted = requireSingleLineArgument(value, "URL handler Desktop Exec")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%");
  return escapeDesktopStringValue(`"${quoted}"`);
}

function renderCanonicalProductionUrlHandler(input) {
  const environment = [
    ["T3CODE_HOME", input.productionT3Home],
    ["XDG_CONFIG_HOME", input.productionXdgConfigHome],
    ["T3CODE_DESKTOP_DISPLAY_NAME", PRODUCTION_PRODUCT_NAME],
    ["T3CODE_DESKTOP_SERVER_URL", input.productionServerUrl],
    ["T3CODE_DESKTOP_CHANNEL", "production"],
    ["T3CODE_DISABLE_AUTO_UPDATE", "true"],
  ].map(([name, value]) => quoteUrlHandlerExecArgument(`${name}=${value}`));
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${PRODUCTION_PRODUCT_NAME}`,
    `Exec=env ${environment.join(" ")} ${quoteUrlHandlerExecArgument(input.launcherPath)} ${quoteUrlHandlerExecArgument("protocol")} ${quoteUrlHandlerExecArgument(input.artifactSha256)} %U`,
    "Terminal=false",
    "NoDisplay=true",
    "StartupNotify=false",
    "MimeType=x-scheme-handler/t3code;",
    "",
  ].join("\n");
}

export function renderTemplate(template, replacements) {
  return template.replaceAll(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!(name in replacements)) throw new Error(`Missing template replacement ${name}.`);
    return replacements[name];
  });
}

function noFollowOpenFlags(baseFlags) {
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("This platform cannot safely open managed files without following links.");
  }
  return baseFlags | noFollow;
}

async function openManagedRegularFile(filePath, label) {
  let handle;
  try {
    handle = await NodeFSP.open(filePath, noFollowOpenFlags(NodeFS.constants.O_RDONLY));
  } catch (error) {
    throw new Error(`${label} could not be opened as a physical regular file.`, { cause: error });
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`${label} must be a physical regular file.`);
    }
    return { handle, stat };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertOpenFileStillOwnsPath(filePath, opened, label) {
  const current = await NodeFSP.lstat(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (
    current === null ||
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== opened.stat.dev ||
    current.ino !== opened.stat.ino
  ) {
    throw new Error(`${label} changed during physical file validation.`);
  }
}

async function sha256FileHandle(handle) {
  const hash = NodeCrypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1_024);
  let position = 0;
  while (true) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

async function copyFileToHandleAndHash(sourcePath, destinationHandle) {
  const sourceHandle = await NodeFSP.open(sourcePath, NodeFS.constants.O_RDONLY);
  const hash = NodeCrypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1_024);
  let sourcePosition = 0;
  let destinationPosition = 0;
  try {
    while (true) {
      const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, sourcePosition);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      sourcePosition += bytesRead;
      let writtenFromChunk = 0;
      while (writtenFromChunk < bytesRead) {
        const { bytesWritten } = await destinationHandle.write(
          buffer,
          writtenFromChunk,
          bytesRead - writtenFromChunk,
          destinationPosition,
        );
        if (bytesWritten === 0) throw new Error("Staged desktop artifact write made no progress.");
        writtenFromChunk += bytesWritten;
        destinationPosition += bytesWritten;
      }
    }
    return hash.digest("hex");
  } finally {
    await sourceHandle.close();
  }
}

class ManagedSharedPathChangedError extends Error {}
class ManagedInstalledPathChangedError extends ManagedSharedPathChangedError {}

function snapshotsMatch(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "missing") return true;
  if (left.kind === "symlink") {
    return left.target === right.target && left.dev === right.dev && left.ino === right.ino;
  }
  return (
    left.mode === right.mode &&
    left.content.equals(right.content) &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
}

async function writeFileIfChanged(
  filePath,
  content,
  mode,
  dependencies = {},
  expectedSnapshot,
  recordInstalled,
) {
  const observedSnapshot = await snapshotManagedPath(filePath);
  if (expectedSnapshot && !snapshotsMatch(expectedSnapshot, observedSnapshot)) {
    throw new ManagedSharedPathChangedError(
      `Managed installer destination changed before replacement: ${filePath}`,
    );
  }
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (
    observedSnapshot.kind === "file" &&
    observedSnapshot.mode === mode &&
    observedSnapshot.content.equals(next)
  ) {
    return null;
  }
  await dependencies.beforeManagedFileReplace?.(filePath);
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  let temporaryHandle;
  try {
    temporaryHandle = await NodeFSP.open(
      temporaryPath,
      noFollowOpenFlags(
        NodeFS.constants.O_CREAT | NodeFS.constants.O_EXCL | NodeFS.constants.O_WRONLY,
      ),
      mode,
    );
    await temporaryHandle.writeFile(next);
    if (mode !== undefined) await temporaryHandle.chmod(mode);
    await temporaryHandle.sync();
    const installedStat = await temporaryHandle.stat();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    const currentSnapshot = await snapshotManagedPath(filePath);
    if (!snapshotsMatch(expectedSnapshot ?? observedSnapshot, currentSnapshot)) {
      throw new ManagedSharedPathChangedError(
        `Shared managed path changed during installation: ${filePath}`,
      );
    }
    await NodeFSP.rename(temporaryPath, filePath);
    const installedSnapshot = {
      filePath,
      kind: "file",
      content: next,
      mode,
      dev: installedStat.dev,
      ino: installedStat.ino,
    };
    recordInstalled?.(installedSnapshot);
    if (dependencies.afterManagedFileRename) {
      await dependencies.afterManagedFileRename(filePath);
    }
    const installedPath = await snapshotManagedPath(filePath);
    if (!snapshotsMatch(installedSnapshot, installedPath)) {
      throw new ManagedInstalledPathChangedError(
        `Managed installer destination changed after replacement: ${filePath}`,
      );
    }
    return installedSnapshot;
  } finally {
    await temporaryHandle?.close();
    await NodeFSP.rm(temporaryPath, { force: true });
  }
}

function commandResult(command, args, options = {}) {
  return new Promise((resolveResult) => {
    const child = NodeChildProcess.spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => resolveResult({ code: null, stdout, stderr, error }));
    child.once("exit", (code) => resolveResult({ code, stdout, stderr }));
  });
}

async function snapshotManagedPath(filePath, allowSymbolicLink = false) {
  try {
    const stat = await NodeFSP.lstat(filePath);
    if (stat.isSymbolicLink()) {
      if (!allowSymbolicLink) {
        throw new Error(`Managed installer path must not be a symbolic link: ${filePath}`);
      }
      const target = await NodeFSP.readlink(filePath);
      const current = await NodeFSP.lstat(filePath);
      if (!current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) {
        throw new Error(`Managed installer symbolic link changed during snapshot: ${filePath}`);
      }
      return { filePath, kind: "symlink", target, dev: stat.dev, ino: stat.ino };
    }
    if (!stat.isFile()) throw new Error(`Managed installer path is not a file: ${filePath}`);
    const opened = await openManagedRegularFile(filePath, "Managed installer snapshot path");
    try {
      const content = await opened.handle.readFile();
      await assertOpenFileStillOwnsPath(filePath, opened, "Managed installer snapshot path");
      return {
        filePath,
        kind: "file",
        content,
        mode: opened.stat.mode & 0o777,
        dev: opened.stat.dev,
        ino: opened.stat.ino,
      };
    } finally {
      await opened.handle.close();
    }
  } catch (error) {
    if (error?.code === "ENOENT") return { filePath, kind: "missing" };
    throw error;
  }
}

async function replaceMarkedSharedFile(input, dependencies = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await snapshotManagedPath(input.filePath);
    if (input.skipMissing && snapshot.kind === "missing") {
      return { snapshot, written: false };
    }
    if (input.requireExisting && snapshot.kind !== "file") {
      throw new Error(`${input.label} is required for adapter setup.`);
    }
    const source = snapshot.kind === "file" ? snapshot.content.toString("utf8") : input.fallback;
    const rendered = input.render(source);
    if (snapshot.kind === "file" && rendered === source) {
      return { snapshot, written: false };
    }
    try {
      await writeFileIfChanged(
        input.filePath,
        rendered,
        input.mode,
        dependencies,
        snapshot,
        (installedSnapshot) => {
          input.recordInstalled?.({ snapshot, rendered, installedSnapshot });
        },
      );
      return { snapshot, rendered, written: true };
    } catch (error) {
      if (
        !(error instanceof ManagedSharedPathChangedError) ||
        error instanceof ManagedInstalledPathChangedError ||
        attempt === 2
      ) {
        throw error;
      }
    }
  }
  throw new Error(`${input.label} changed too often during installation.`);
}

async function removeManagedPathIfUnchanged(snapshot, dependencies = {}) {
  if (snapshot.kind === "missing") return false;
  await dependencies.beforeManagedFileReplace?.(snapshot.filePath);
  const current = await snapshotManagedPath(snapshot.filePath);
  if (!snapshotsMatch(snapshot, current)) {
    throw new ManagedSharedPathChangedError(
      `Managed path changed during integration removal: ${snapshot.filePath}`,
    );
  }
  await NodeFSP.rm(snapshot.filePath, { force: true });
  return true;
}

async function restoreMarkedSharedPath(rollback) {
  const current = await snapshotManagedPath(rollback.filePath);
  if (current.kind === "file" && current.content.equals(Buffer.from(rollback.installedContent))) {
    await restoreManagedPath(rollback.priorSnapshot);
    return;
  }
  if (current.kind !== "file") return;
  const priorSource =
    rollback.priorSnapshot.kind === "file" ? rollback.priorSnapshot.content.toString("utf8") : "";
  const priorBlock = readMarkedBlock(
    priorSource,
    rollback.markerStart,
    rollback.markerEnd,
    rollback.label,
  );
  await replaceMarkedSharedFile({
    filePath: rollback.filePath,
    label: rollback.label,
    requireExisting: false,
    skipMissing: true,
    fallback: "",
    render: (content) => {
      const range = markerRange(content, rollback.markerStart, rollback.markerEnd, rollback.label);
      if (!range) {
        if (priorBlock === null || !rollback.insertMissingMarker) return content;
        const inserted = rollback.insertMissingMarker(content);
        const insertedRange = markerRange(
          inserted,
          rollback.markerStart,
          rollback.markerEnd,
          rollback.label,
        );
        if (!insertedRange) return inserted;
        const insertedBlock = inserted.slice(insertedRange.start, insertedRange.end);
        const restoredBlock = rollback.mergePriorBlock
          ? rollback.mergePriorBlock(insertedBlock, priorBlock)
          : priorBlock;
        return `${inserted.slice(0, insertedRange.start)}${restoredBlock}${inserted.slice(insertedRange.end)}`;
      }
      const currentBlock = content.slice(range.start, range.end);
      const restoredBlock =
        priorBlock === null
          ? ""
          : rollback.mergePriorBlock
            ? rollback.mergePriorBlock(currentBlock, priorBlock)
            : priorBlock;
      return `${content.slice(0, range.start)}${restoredBlock}${content.slice(range.end)}`;
    },
    mode: current.mode,
  });
}

async function restoreManagedPath(snapshot) {
  if (snapshot.kind === "marked-file") {
    await restoreMarkedSharedPath(snapshot);
    return;
  }
  const current = await NodeFSP.lstat(snapshot.filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (current?.isDirectory() && !current.isSymbolicLink()) {
    throw new Error(
      `Refusing to replace directory at managed installer path: ${snapshot.filePath}`,
    );
  }
  if (current) await NodeFSP.rm(snapshot.filePath, { force: true });
  if (snapshot.kind === "missing") return;
  await NodeFSP.mkdir(NodePath.dirname(snapshot.filePath), { recursive: true });
  if (snapshot.kind === "symlink") {
    await NodeFSP.symlink(snapshot.target, snapshot.filePath);
    return;
  }
  await writeFileIfChanged(snapshot.filePath, snapshot.content, snapshot.mode);
}

async function restoreManagedPathIfStillOwned(priorSnapshot, installedSnapshot) {
  if (priorSnapshot.kind === "marked-file") {
    const current = await snapshotManagedPath(priorSnapshot.filePath);
    if (
      installedSnapshot?.kind !== "file" ||
      current.kind !== "file" ||
      current.dev !== installedSnapshot.dev ||
      current.ino !== installedSnapshot.ino
    ) {
      throw new Error(
        `Refusing to roll back a managed path that changed after installation: ${priorSnapshot.filePath}`,
      );
    }
    await restoreManagedPath(priorSnapshot);
    return;
  }
  const current = await snapshotManagedPath(priorSnapshot.filePath, true);
  if (!snapshotsMatch(installedSnapshot, current)) {
    throw new Error(
      `Refusing to roll back a managed path that changed after installation: ${priorSnapshot.filePath}`,
    );
  }
  await restoreManagedPath(priorSnapshot);
}

async function readOptionalManagedFile(filePath, label) {
  const present = await NodeFSP.lstat(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (present === null) return null;
  const opened = await openManagedRegularFile(filePath, label);
  try {
    const content = await opened.handle.readFile();
    await assertOpenFileStillOwnsPath(filePath, opened, label);
    return content;
  } finally {
    await opened.handle.close();
  }
}

async function detectOmarchyIntegration(paths, stockBinDirectory) {
  const requiredPaths = [
    NodePath.join(stockBinDirectory, "omarchy"),
    NodePath.join(stockBinDirectory, "omarchy-agent"),
    NodePath.join(stockBinDirectory, "omarchy-default-agent"),
    paths.omarchyHyprConfigPath,
  ];
  const stats = await Promise.all(
    requiredPaths.map((filePath) =>
      NodeFSP.lstat(filePath).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
    ),
  );
  return stats.every((stat) => stat?.isFile() && !stat.isSymbolicLink());
}

function isRecognizedLegacyDesktopEntry(content) {
  const values = new Map();
  let inDesktopEntrySection = false;
  for (const line of content.toString("utf8").split(/\r?\n/)) {
    if (line.startsWith("[") && line.endsWith("]")) {
      if (line === "[Desktop Entry]") {
        if (inDesktopEntrySection) return false;
        inDesktopEntrySection = true;
        continue;
      }
      if (inDesktopEntrySection) break;
      continue;
    }
    if (!inDesktopEntrySection) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator);
    if (values.has(name)) return false;
    values.set(name, line.slice(separator + 1));
  }
  const executable = parseDesktopExecExecutable(values.get("Exec"));
  return (
    inDesktopEntrySection &&
    values.get("Type") === "Application" &&
    ["T3 Code", "T3 Code Alpha", "T3 Code (Alpha)"].includes(values.get("Name")) &&
    values.get("StartupWMClass") === OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass &&
    executable !== null &&
    /^T3-Code(?:-[A-Za-z0-9._+-]+)?\.AppImage$/.test(NodePath.basename(executable))
  );
}

function isRecognizedLegacyUrlHandler(content) {
  const values = new Map();
  let inDesktopEntrySection = false;
  for (const line of content.toString("utf8").split(/\r?\n/)) {
    if (line.startsWith("[") && line.endsWith("]")) {
      if (line === "[Desktop Entry]" && !inDesktopEntrySection) {
        inDesktopEntrySection = true;
        continue;
      }
      if (inDesktopEntrySection) break;
      continue;
    }
    if (!inDesktopEntrySection) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator);
    if (values.has(name)) return false;
    values.set(name, line.slice(separator + 1));
  }
  const executable = parseDesktopExecExecutable(values.get("Exec"));
  return (
    inDesktopEntrySection &&
    values.get("Type") === "Application" &&
    ["T3 Code", "T3 Code Alpha", "T3 Code (Alpha)"].includes(values.get("Name")) &&
    values.get("NoDisplay") === "true" &&
    values.get("MimeType") === "x-scheme-handler/t3code;" &&
    !values.has("X-T3Code-Managed-Staging") &&
    !values.has("X-T3Code-Managed-Staging-Artifact") &&
    executable !== null &&
    /^T3-Code(?:-[A-Za-z0-9._+-]+)?\.AppImage$/.test(NodePath.basename(executable))
  );
}

function parseDesktopExecExecutable(rawExec) {
  if (typeof rawExec !== "string") return null;
  const value = rawExec.trim();
  if (!value || value.includes("\n") || value.includes("\r") || value.includes("\0")) return null;
  if (!value.startsWith('"')) return value.split(/\s+/, 1)[0] ?? null;
  let executable = "";
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      executable += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      const remainder = value.slice(index + 1);
      return executable && (remainder.length === 0 || /^\s/.test(remainder)) ? executable : null;
    }
    executable += character;
  }
  return null;
}

async function assertManagedFileOwnership(paths, expected) {
  const exclusivePaths = expected.omarchyIntegrationEnabled
    ? [
        [paths.omarchyCommandPath, expected.omarchyCommand, "Omarchy command adapter"],
        [paths.omarchyAgentPath, expected.omarchyAgent, "Omarchy agent adapter"],
        [
          paths.omarchyDefaultAgentPath,
          expected.omarchyDefaultAgent,
          "Omarchy default-agent adapter",
        ],
        [paths.omarchyHyprModulePath, expected.omarchyHyprModule, "Omarchy Hyprland module"],
        [
          paths.omarchyUwsmEnvironmentPath,
          expected.omarchyUwsmEnvironment,
          "Omarchy UWSM environment",
        ],
      ]
    : [];
  const [
    rawOwnershipManifest,
    launcher,
    service,
    stagingService,
    desktop,
    stagingDesktop,
    urlHandler,
    icon,
    ...exclusiveFiles
  ] = await Promise.all([
    readOptionalManagedFile(paths.ownershipManifestPath, "Existing desktop ownership manifest"),
    readOptionalManagedFile(paths.launcherPath, "Existing desktop launcher"),
    readOptionalManagedFile(paths.servicePath, "Existing desktop user service"),
    readOptionalManagedFile(paths.stagingServicePath, "Existing staging desktop user service"),
    readOptionalManagedFile(paths.desktopEntryPath, "Existing desktop entry"),
    readOptionalManagedFile(paths.stagingDesktopEntryPath, "Existing staging desktop entry"),
    readOptionalManagedFile(paths.urlHandlerPath, "Existing desktop URL handler"),
    readOptionalManagedFile(paths.iconPath, "Existing desktop icon"),
    ...exclusivePaths.map(([filePath, _content, label]) =>
      readOptionalManagedFile(filePath, `Existing ${label}`),
    ),
  ]);
  let ownershipManifest = null;
  if (rawOwnershipManifest) {
    try {
      ownershipManifest = JSON.parse(rawOwnershipManifest.toString("utf8"));
    } catch {
      throw new Error("Existing desktop ownership manifest is invalid.");
    }
    const requiredManagedPaths = [paths.launcherPath, paths.servicePath, paths.desktopEntryPath];
    if (
      ownershipManifest?.contractVersion !== LAUNCHER_CONTRACT_VERSION ||
      ownershipManifest?.productAppId !== OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId ||
      !Array.isArray(ownershipManifest.managedPaths) ||
      !requiredManagedPaths.every((filePath) => ownershipManifest.managedPaths.includes(filePath))
    ) {
      throw new Error("Existing desktop ownership manifest does not own the requested paths.");
    }
    if (
      icon &&
      !ownershipManifest.managedPaths.includes(paths.iconPath) &&
      (!expected.icon || !icon.equals(expected.icon))
    ) {
      throw new Error("Existing desktop ownership manifest does not own the desktop icon.");
    }
    for (const [filePath, existing, content, label] of expected.installStaging
      ? [
          [
            paths.stagingServicePath,
            stagingService,
            expected.stagingService,
            "staging desktop user service",
          ],
          [
            paths.stagingDesktopEntryPath,
            stagingDesktop,
            expected.stagingDesktop,
            "staging desktop entry",
          ],
        ]
      : []) {
      if (
        existing &&
        !ownershipManifest.managedPaths.includes(filePath) &&
        !existing.equals(Buffer.from(content))
      ) {
        throw new Error(`Existing desktop ownership manifest does not own the ${label}.`);
      }
    }
    if (
      urlHandler &&
      !ownershipManifest.managedPaths.includes(paths.urlHandlerPath) &&
      !urlHandler.equals(Buffer.from(expected.urlHandler)) &&
      !isRecognizedLegacyUrlHandler(urlHandler)
    ) {
      throw new Error("Existing desktop ownership manifest does not own the URL handler.");
    }
    for (const [index, [filePath, content, label]] of exclusivePaths.entries()) {
      const existing = exclusiveFiles[index];
      if (
        existing &&
        !ownershipManifest.managedPaths.includes(filePath) &&
        !existing.equals(Buffer.from(content))
      ) {
        throw new Error(`Existing desktop ownership manifest does not own the ${label}.`);
      }
    }
    return ownershipManifest;
  }

  if (launcher && !launcher.equals(expected.launcher)) {
    throw new Error("Refusing to replace an unowned desktop launcher file.");
  }
  if (service && !service.equals(Buffer.from(expected.service))) {
    throw new Error("Refusing to replace an unowned desktop user service.");
  }
  if (
    expected.installStaging &&
    stagingService &&
    !stagingService.equals(Buffer.from(expected.stagingService))
  ) {
    throw new Error("Refusing to replace an unowned staging desktop user service.");
  }
  if (
    desktop &&
    !desktop.equals(Buffer.from(expected.desktop)) &&
    !isRecognizedLegacyDesktopEntry(desktop)
  ) {
    throw new Error("Refusing to replace an unowned desktop entry.");
  }
  if (
    expected.installStaging &&
    stagingDesktop &&
    !stagingDesktop.equals(Buffer.from(expected.stagingDesktop))
  ) {
    throw new Error("Refusing to replace an unowned staging desktop entry.");
  }
  if (
    urlHandler &&
    !urlHandler.equals(Buffer.from(expected.urlHandler)) &&
    !isRecognizedLegacyUrlHandler(urlHandler)
  ) {
    throw new Error("Refusing to replace an unowned desktop URL handler.");
  }
  for (const [index, [_filePath, content, label]] of exclusivePaths.entries()) {
    const existing = exclusiveFiles[index];
    if (existing && !existing.equals(Buffer.from(content))) {
      throw new Error(`Refusing to replace an unowned ${label}.`);
    }
  }
  return null;
}

async function assertExistingAncestorsPhysical(directory) {
  let current = directory;
  while (true) {
    const status = await NodeFSP.lstat(current).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (status !== null) {
      if (
        !status.isDirectory() ||
        status.isSymbolicLink() ||
        (await NodeFSP.realpath(current)) !== current
      ) {
        throw new Error("Desktop artifact storage contains an unexpected managed ancestor.");
      }
      return;
    }
    const parent = NodePath.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function assertPhysicalManagedArtifactRoot(paths, includeOmarchyIntegration, options = {}) {
  const createMissing = options.createMissing !== false;
  const launcherRoot = NodePath.dirname(paths.launcherPath);
  if (
    NodePath.resolve(paths.artifactsRoot) !==
      NodePath.resolve(NodePath.join(paths.installRoot, "artifacts")) ||
    NodePath.resolve(launcherRoot) !== NodePath.resolve(NodePath.join(paths.installRoot, "bin")) ||
    NodePath.resolve(paths.omarchyAdapterBinRoot) !==
      NodePath.resolve(NodePath.join(paths.installRoot, "omarchy", "bin"))
  ) {
    throw new Error("Desktop managed paths are outside their expected install ancestors.");
  }
  const installRootStat = await NodeFSP.lstat(paths.installRoot).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (installRootStat?.isSymbolicLink() || (installRootStat && !installRootStat.isDirectory())) {
    throw new Error("Desktop artifact storage contains an unexpected managed ancestor.");
  }
  if (installRootStat === null) {
    if (!createMissing) {
      await assertExistingAncestorsPhysical(paths.installRoot);
      return;
    }
    await NodeFSP.mkdir(paths.installRoot, { recursive: true });
  }
  const omarchyRoot = NodePath.dirname(paths.omarchyAdapterBinRoot);
  for (const directory of [
    paths.artifactsRoot,
    launcherRoot,
    ...(includeOmarchyIntegration ? [omarchyRoot] : []),
  ]) {
    const stat = await NodeFSP.lstat(directory).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) {
      throw new Error("Desktop artifact storage contains an unexpected managed ancestor.");
    }
    if (stat === null && createMissing) await NodeFSP.mkdir(directory);
  }
  if (!createMissing) {
    for (const directory of [
      paths.installRoot,
      paths.artifactsRoot,
      launcherRoot,
      ...(includeOmarchyIntegration ? [omarchyRoot, paths.omarchyAdapterBinRoot] : []),
    ]) {
      const status = await NodeFSP.lstat(directory).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (status !== null && (await NodeFSP.realpath(directory)) !== directory) {
        throw new Error("Desktop artifact storage escapes the physical managed install root.");
      }
    }
    return;
  }
  if (!includeOmarchyIntegration) {
    const [physicalInstallRoot, physicalArtifactsRoot, physicalLauncherRoot] = await Promise.all([
      NodeFSP.realpath(paths.installRoot),
      NodeFSP.realpath(paths.artifactsRoot),
      NodeFSP.realpath(launcherRoot),
    ]);
    if (
      physicalArtifactsRoot !== NodePath.join(physicalInstallRoot, "artifacts") ||
      physicalLauncherRoot !== NodePath.join(physicalInstallRoot, "bin")
    ) {
      throw new Error("Desktop artifact storage escapes the physical managed install root.");
    }
    return;
  }
  const adapterBinStat = await NodeFSP.lstat(paths.omarchyAdapterBinRoot).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (adapterBinStat?.isSymbolicLink() || (adapterBinStat && !adapterBinStat.isDirectory())) {
    throw new Error("Desktop artifact storage contains an unexpected managed ancestor.");
  }
  if (adapterBinStat === null) await NodeFSP.mkdir(paths.omarchyAdapterBinRoot);
  const [physicalInstallRoot, physicalArtifactsRoot, physicalLauncherRoot, physicalAdapterBinRoot] =
    await Promise.all([
      NodeFSP.realpath(paths.installRoot),
      NodeFSP.realpath(paths.artifactsRoot),
      NodeFSP.realpath(launcherRoot),
      NodeFSP.realpath(paths.omarchyAdapterBinRoot),
    ]);
  if (
    physicalArtifactsRoot !== NodePath.join(physicalInstallRoot, "artifacts") ||
    physicalLauncherRoot !== NodePath.join(physicalInstallRoot, "bin") ||
    physicalAdapterBinRoot !== NodePath.join(physicalInstallRoot, "omarchy", "bin")
  ) {
    throw new Error("Desktop artifact storage escapes the physical managed install root.");
  }
}

async function validateExistingDesktopArtifact(prepared, dependencies = {}) {
  const targetStat = await NodeFSP.lstat(prepared.targetRoot).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (targetStat === null) return;
  if (
    !targetStat.isDirectory() ||
    targetStat.isSymbolicLink() ||
    (await NodeFSP.realpath(prepared.targetRoot)) !== prepared.targetRoot
  ) {
    throw new Error("Content-addressed desktop artifact root is not a directory.");
  }
  const manifestPath = NodePath.join(prepared.targetRoot, "manifest.json");
  const installedArtifact = await openManagedRegularFile(
    prepared.targetArtifact,
    "Existing content-addressed desktop artifact",
  );
  let installedManifest;
  try {
    installedManifest = await openManagedRegularFile(
      manifestPath,
      "Existing content-addressed desktop artifact manifest",
    );
    await dependencies.afterExistingArtifactOpen?.({
      artifactPath: prepared.targetArtifact,
      manifestPath,
    });
    const [installedArtifactHash, installedManifestContent] = await Promise.all([
      sha256FileHandle(installedArtifact.handle),
      installedManifest.handle.readFile({ encoding: "utf8" }),
    ]);
    let installedManifestValue;
    try {
      installedManifestValue = JSON.parse(installedManifestContent);
    } catch {
      throw new Error("Existing content-addressed desktop artifact is invalid.");
    }
    if (
      installedArtifactHash !== prepared.artifactSha256 ||
      JSON.stringify(installedManifestValue) !== JSON.stringify(prepared.manifest)
    ) {
      throw new Error("Existing content-addressed desktop artifact is invalid.");
    }
    await Promise.all([
      assertOpenFileStillOwnsPath(
        prepared.targetArtifact,
        installedArtifact,
        "Existing content-addressed desktop artifact",
      ),
      assertOpenFileStillOwnsPath(
        manifestPath,
        installedManifest,
        "Existing content-addressed desktop artifact manifest",
      ),
    ]);
  } finally {
    await Promise.allSettled([
      installedArtifact.handle.close(),
      ...(installedManifest ? [installedManifest.handle.close()] : []),
    ]);
  }
}

async function assertManagedCurrentSelection(paths) {
  const currentStat = await NodeFSP.lstat(paths.currentPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (currentStat === null) return;
  if (!currentStat.isSymbolicLink()) {
    throw new Error("Desktop current selection must be a managed symbolic link.");
  }
  const rawTarget = await NodeFSP.readlink(paths.currentPath);
  const targetRoot = NodePath.resolve(NodePath.dirname(paths.currentPath), rawTarget);
  const expectedRelativeTarget = NodePath.relative(NodePath.dirname(paths.currentPath), targetRoot);
  if (
    rawTarget !== expectedRelativeTarget ||
    NodePath.dirname(targetRoot) !== paths.artifactsRoot ||
    !/^[0-9a-f]{64}$/.test(NodePath.basename(targetRoot))
  ) {
    throw new Error("Desktop current selection escapes the managed artifact root.");
  }
  const targetRootStat = await NodeFSP.lstat(targetRoot);
  if (
    !targetRootStat.isDirectory() ||
    targetRootStat.isSymbolicLink() ||
    (await NodeFSP.realpath(targetRoot)) !== targetRoot
  ) {
    throw new Error("Desktop current selection has an unexpected physical target.");
  }
  const manifestPath = NodePath.join(targetRoot, "manifest.json");
  const artifactPath = NodePath.join(targetRoot, "T3-Code.AppImage");
  const manifest = await openManagedRegularFile(manifestPath, "Desktop current artifact manifest");
  let artifact;
  try {
    artifact = await openManagedRegularFile(artifactPath, "Desktop current artifact");
    await Promise.all([
      assertOpenFileStillOwnsPath(manifestPath, manifest, "Desktop current artifact manifest"),
      assertOpenFileStillOwnsPath(artifactPath, artifact, "Desktop current artifact"),
    ]);
  } finally {
    await Promise.allSettled([
      manifest.handle.close(),
      ...(artifact ? [artifact.handle.close()] : []),
    ]);
  }
}

export async function refreshLinuxDesktopIntegration(paths, dependencies = {}) {
  const run = dependencies.runCommand ?? commandResult;
  const reload = await run("systemctl", ["--user", "daemon-reload"]);
  if (reload.code !== 0) {
    throw new Error(`Could not reload the desktop user service: ${reload.stderr}`);
  }
  const desktopDatabase = await run("update-desktop-database", [
    NodePath.dirname(paths.desktopEntryPath),
  ]);
  if (desktopDatabase.code !== 0 && desktopDatabase.error?.code !== "ENOENT") {
    throw new Error(`Could not refresh desktop entries: ${desktopDatabase.stderr}`);
  }
}

export async function claimLinuxDesktopUrlHandler(paths, dependencies = {}) {
  const run = dependencies.runCommand ?? commandResult;
  const mimeType = "x-scheme-handler/t3code";
  const desiredDefault = NodePath.basename(paths.urlHandlerPath);
  const queryDefault = async () => {
    const query = await run("xdg-mime", ["query", "default", mimeType]);
    return query.code === 0 ? query.stdout.trim() : null;
  };
  const priorDefault = await queryDefault();
  if (priorDefault === null) {
    throw new Error("Could not query the prior desktop URL handler default.");
  }
  const claim = await run("xdg-mime", ["default", desiredDefault, mimeType]);
  const claimedDefault = await queryDefault();
  if (claimedDefault === desiredDefault) return;
  if (claimedDefault === priorDefault) {
    throw new Error(
      `Could not claim the canonical production desktop URL handler; the prior default remains unchanged: ${claim.stderr}`,
    );
  }
  if (priorDefault.length === 0 || !/^[A-Za-z0-9][A-Za-z0-9._+-]*\.desktop$/.test(priorDefault)) {
    throw new Error(
      "Could not claim the canonical production desktop URL handler and the prior default cannot be restored safely.",
    );
  }
  await run("xdg-mime", ["default", priorDefault, mimeType]);
  const restoredDefault = await queryDefault();
  if (restoredDefault !== priorDefault) {
    throw new Error(
      "Could not claim the staging desktop URL handler or restore the prior default safely.",
    );
  }
  throw new Error(
    `Could not claim the staging desktop URL handler; the prior default was restored: ${claim.stderr}`,
  );
}

export async function installLinuxDesktop(input, dependencies = {}) {
  let productionServerUrl;
  let stagingServerUrl;
  try {
    productionServerUrl = new URL(input.productionServerUrl);
    stagingServerUrl = input.stagingServerUrl ? new URL(input.stagingServerUrl) : undefined;
  } catch (cause) {
    throw new Error("Desktop server URLs must be valid URLs.", { cause });
  }
  for (const serverUrl of [productionServerUrl, ...(stagingServerUrl ? [stagingServerUrl] : [])]) {
    if (
      serverUrl.protocol !== "https:" ||
      serverUrl.username.length > 0 ||
      serverUrl.password.length > 0 ||
      serverUrl.search.length > 0 ||
      serverUrl.hash.length > 0 ||
      serverUrl.pathname !== "/"
    ) {
      throw new Error("Desktop server URLs must be credential-free HTTPS origins.");
    }
  }
  const installStaging = stagingServerUrl !== undefined;
  const paths = {
    ...resolveInstallPaths(input.environment),
    ...input.paths,
  };
  const readReleaseDescriptor =
    dependencies.readReleaseDescriptor ?? readAndVerifyLinuxDesktopReleaseDescriptor;
  const releaseDescriptor = await readReleaseDescriptor({
    artifactPath: input.artifactPath,
    descriptorPath: input.descriptorPath,
  });
  const artifactSha256 = releaseDescriptor.artifactSha256;
  const targetRoot = NodePath.join(paths.artifactsRoot, artifactSha256);
  const stagingRoot = NodePath.join(paths.installRoot, `.staging-${NodeCrypto.randomUUID()}`);
  const stagedArtifact = NodePath.join(stagingRoot, "T3-Code.AppImage");
  const targetArtifact = NodePath.join(targetRoot, "T3-Code.AppImage");
  const manifest = {
    contractVersion: LAUNCHER_CONTRACT_VERSION,
    productAppId: OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId,
    userServiceName: OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName,
    linuxWmClass: OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass,
    artifactPath: targetArtifact,
    artifactSha256,
    version: releaseDescriptor.version,
    commitHash: releaseDescriptor.commitHash,
    architecture: releaseDescriptor.architecture,
  };
  const launcherSource =
    input.launcherSource ?? NodePath.join(scriptDirectory, "linux-desktop-launcher.mjs");
  const serviceTemplatePath =
    input.serviceTemplatePath ??
    NodePath.join(
      repositoryRoot,
      "apps",
      "desktop",
      "resources",
      "linux",
      "t3code-desktop.service.in",
    );
  const desktopTemplatePath =
    input.desktopTemplatePath ??
    NodePath.join(repositoryRoot, "apps", "desktop", "resources", "linux", "t3code.desktop.in");
  const linuxResourceRoot = NodePath.join(repositoryRoot, "apps", "desktop", "resources", "linux");
  const stockBinDirectory = dependencies.omarchyStockBinDirectory ?? OMARCHY_STOCK_BIN_DIRECTORY;
  const omarchyIntegrationEnabled =
    input.omarchyIntegration ?? (await detectOmarchyIntegration(paths, stockBinDirectory));
  const runtimeDirectory = input.runtimeDirectory;
  if (
    !runtimeDirectory ||
    !NodePath.isAbsolute(runtimeDirectory) ||
    NodePath.resolve(runtimeDirectory) !== runtimeDirectory
  ) {
    throw new Error("A normalized absolute runtime directory is required for the user service.");
  }
  const [
    launcherContent,
    serviceTemplate,
    desktopTemplate,
    omarchyCommandTemplate,
    omarchyAgentTemplate,
    omarchyDefaultAgentTemplate,
    omarchyHyprModuleTemplate,
    omarchyUwsmEnvironmentTemplate,
  ] = await Promise.all([
    NodeFSP.readFile(launcherSource),
    NodeFSP.readFile(serviceTemplatePath, "utf8"),
    NodeFSP.readFile(desktopTemplatePath, "utf8"),
    NodeFSP.readFile(NodePath.join(linuxResourceRoot, "t3code-omarchy.in"), "utf8"),
    NodeFSP.readFile(NodePath.join(linuxResourceRoot, "t3code-omarchy-agent.in"), "utf8"),
    NodeFSP.readFile(NodePath.join(linuxResourceRoot, "t3code-omarchy-default-agent.in"), "utf8"),
    NodeFSP.readFile(NodePath.join(linuxResourceRoot, "t3code-omarchy-hypr.lua.in"), "utf8"),
    NodeFSP.readFile(NodePath.join(linuxResourceRoot, "t3code-omarchy-uwsm.in"), "utf8"),
  ]);
  const iconContent = input.iconPath ? await NodeFSP.readFile(input.iconPath) : null;
  const renderClientFiles = ({ channel, productName, serverUrl, t3Home, xdgConfigHome }) => {
    const runtimeRoot = channel === "staging" ? "t3code-desktop-staging" : "t3code-desktop";
    const replacements = {
      PRODUCT_NAME: productName,
      SYSTEMD_ENVIRONMENT_FILE: quoteSystemdUnitPath(
        NodePath.join(runtimeDirectory, runtimeRoot, "service.env"),
      ),
      SYSTEMD_STAGING_HOME: quoteSystemdEnvironmentAssignment("T3CODE_HOME", t3Home),
      SYSTEMD_XDG_CONFIG_HOME: quoteSystemdEnvironmentAssignment("XDG_CONFIG_HOME", xdgConfigHome),
      SYSTEMD_DISPLAY_NAME: quoteSystemdEnvironmentAssignment(
        "T3CODE_DESKTOP_DISPLAY_NAME",
        productName,
      ),
      SYSTEMD_STAGING_SERVER_URL: quoteSystemdEnvironmentAssignment(
        "T3CODE_DESKTOP_SERVER_URL",
        serverUrl.href,
      ),
      SYSTEMD_CHANNEL: quoteSystemdEnvironmentAssignment("T3CODE_DESKTOP_CHANNEL", channel),
      SYSTEMD_NODE_EXECUTABLE: quoteSystemdArgument(input.nodeExecutable ?? process.execPath),
      SYSTEMD_LAUNCHER_PATH: quoteSystemdArgument(paths.launcherPath),
      DESKTOP_STAGING_HOME: quoteDesktopEnvironmentAssignment("T3CODE_HOME", t3Home),
      DESKTOP_XDG_CONFIG_HOME: quoteDesktopEnvironmentAssignment("XDG_CONFIG_HOME", xdgConfigHome),
      DESKTOP_DISPLAY_NAME: quoteDesktopEnvironmentAssignment(
        "T3CODE_DESKTOP_DISPLAY_NAME",
        productName,
      ),
      DESKTOP_STAGING_SERVER_URL: quoteDesktopEnvironmentAssignment(
        "T3CODE_DESKTOP_SERVER_URL",
        serverUrl.href,
      ),
      DESKTOP_CHANNEL: quoteDesktopEnvironmentAssignment("T3CODE_DESKTOP_CHANNEL", channel),
      DESKTOP_DISABLE_AUTO_UPDATE: quoteDesktopEnvironmentAssignment(
        "T3CODE_DISABLE_AUTO_UPDATE",
        "true",
      ),
      DESKTOP_NODE_EXECUTABLE: quoteDesktopExecArgument(input.nodeExecutable ?? process.execPath),
      DESKTOP_LAUNCHER_PATH: quoteDesktopExecArgument(paths.launcherPath),
      ICON_PATH: escapeDesktopStringValue(iconContent ? paths.iconPath : "t3code"),
      STARTUP_WM_CLASS:
        channel === "staging" ? "t3code-staging" : OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass,
    };
    return {
      service: renderTemplate(serviceTemplate, replacements),
      desktop: renderTemplate(desktopTemplate, replacements),
    };
  };
  const productionFiles = renderClientFiles({
    channel: "production",
    productName: PRODUCTION_PRODUCT_NAME,
    serverUrl: productionServerUrl,
    t3Home: paths.productionT3Home,
    xdgConfigHome: paths.productionXdgConfigHome,
  });
  const stagingFiles = stagingServerUrl
    ? renderClientFiles({
        channel: "staging",
        productName: STAGING_PRODUCT_NAME,
        serverUrl: stagingServerUrl,
        t3Home: paths.stagingT3Home,
        xdgConfigHome: paths.stagingXdgConfigHome,
      })
    : undefined;
  const renderedService = productionFiles.service;
  const renderedDesktop = productionFiles.desktop;
  const renderedUrlHandler = renderCanonicalProductionUrlHandler({
    artifactPath: targetArtifact,
    artifactSha256,
    launcherPath: paths.launcherPath,
    productionT3Home: paths.productionT3Home,
    productionXdgConfigHome: paths.productionXdgConfigHome,
    productionServerUrl: productionServerUrl.href,
  });
  const stockDefaultAgent = shellSingleQuote(
    NodePath.join(stockBinDirectory, "omarchy-default-agent"),
  );
  const renderedOmarchyCommand = renderTemplate(omarchyCommandTemplate, {
    STOCK_OMARCHY: shellSingleQuote(NodePath.join(stockBinDirectory, "omarchy")),
    OMARCHY_AGENT_ADAPTER: shellSingleQuote(paths.omarchyAgentPath),
    OMARCHY_DEFAULT_AGENT_ADAPTER: shellSingleQuote(paths.omarchyDefaultAgentPath),
  });
  const renderedOmarchyAgent = renderTemplate(omarchyAgentTemplate, {
    STOCK_OMARCHY_AGENT: shellSingleQuote(NodePath.join(stockBinDirectory, "omarchy-agent")),
    STOCK_OMARCHY_DEFAULT_AGENT: stockDefaultAgent,
    T_CODE_LAUNCHER: shellSingleQuote(paths.launcherPath),
  });
  const renderedOmarchyDefaultAgent = renderTemplate(omarchyDefaultAgentTemplate, {
    STOCK_OMARCHY_DEFAULT_AGENT: stockDefaultAgent,
    OMARCHY_AGENT_ADAPTER: shellSingleQuote(paths.omarchyAgentPath),
  });
  const renderedOmarchyHyprModule = renderTemplate(omarchyHyprModuleTemplate, {
    LUA_ADAPTER_BIN: JSON.stringify(paths.omarchyAdapterBinRoot),
  });
  const renderedOmarchyUwsmEnvironment = renderTemplate(omarchyUwsmEnvironmentTemplate, {
    SHELL_ADAPTER_BIN: shellSingleQuote(paths.omarchyAdapterBinRoot),
  });
  const prepared = {
    artifactSha256,
    targetRoot,
    targetArtifact,
    manifest,
    paths,
    installStaging,
    files: [
      { id: "launcher", path: paths.launcherPath, content: launcherContent, mode: 0o755 },
      { id: "service", path: paths.servicePath, content: renderedService, mode: 0o644 },
      { id: "desktop", path: paths.desktopEntryPath, content: renderedDesktop, mode: 0o644 },
      { id: "url-handler", path: paths.urlHandlerPath, content: renderedUrlHandler, mode: 0o644 },
      ...(stagingFiles
        ? [
            {
              id: "staging-service",
              path: paths.stagingServicePath,
              content: stagingFiles.service,
              mode: 0o644,
            },
            {
              id: "staging-desktop",
              path: paths.stagingDesktopEntryPath,
              content: stagingFiles.desktop,
              mode: 0o644,
            },
          ]
        : []),
      ...(iconContent
        ? [
            {
              id: "icon",
              path: paths.iconPath,
              content: iconContent,
              mode: 0o644,
            },
          ]
        : []),
      ...(omarchyIntegrationEnabled
        ? [
            {
              id: "omarchy-command",
              path: paths.omarchyCommandPath,
              content: renderedOmarchyCommand,
              mode: 0o755,
            },
            {
              id: "omarchy-agent",
              path: paths.omarchyAgentPath,
              content: renderedOmarchyAgent,
              mode: 0o755,
            },
            {
              id: "omarchy-default-agent",
              path: paths.omarchyDefaultAgentPath,
              content: renderedOmarchyDefaultAgent,
              mode: 0o755,
            },
            {
              id: "omarchy-hypr-module",
              path: paths.omarchyHyprModulePath,
              content: renderedOmarchyHyprModule,
              mode: 0o644,
            },
            {
              id: "omarchy-uwsm-environment",
              path: paths.omarchyUwsmEnvironmentPath,
              content: renderedOmarchyUwsmEnvironment,
              mode: 0o644,
            },
          ]
        : []),
    ],
    omarchyIntegrationEnabled,
  };
  if (input.prepareOnly === true) return prepared;
  const priorOwnershipManifest = await assertManagedFileOwnership(paths, {
    launcher: launcherContent,
    service: renderedService,
    stagingService: stagingFiles?.service,
    desktop: renderedDesktop,
    stagingDesktop: stagingFiles?.desktop,
    urlHandler: renderedUrlHandler,
    icon: iconContent,
    omarchyCommand: renderedOmarchyCommand,
    omarchyAgent: renderedOmarchyAgent,
    omarchyDefaultAgent: renderedOmarchyDefaultAgent,
    omarchyHyprModule: renderedOmarchyHyprModule,
    omarchyUwsmEnvironment: renderedOmarchyUwsmEnvironment,
    omarchyIntegrationEnabled,
    installStaging,
  });
  const omarchyExclusivePaths = [
    paths.omarchyCommandPath,
    paths.omarchyAgentPath,
    paths.omarchyDefaultAgentPath,
    paths.omarchyHyprModulePath,
    paths.omarchyUwsmEnvironmentPath,
  ];
  const priorOwnedOmarchyExclusivePaths = priorOwnershipManifest
    ? omarchyExclusivePaths.filter((filePath) =>
        priorOwnershipManifest.managedPaths.includes(filePath),
      )
    : [];
  const priorOwnedOmarchySharedPaths = new Set(
    priorOwnershipManifest?.managedSharedPaths?.map((entry) => entry?.path) ?? [],
  );
  const priorOwnedLegacyProductionService =
    priorOwnershipManifest?.managedPaths.includes(paths.legacyProductionServicePath) === true;
  const priorOwnedIcon = priorOwnershipManifest?.managedPaths.includes(paths.iconPath) === true;
  const priorOmarchyIntegrationManaged =
    priorOwnedOmarchyExclusivePaths.length > 0 ||
    priorOwnedOmarchySharedPaths.has(paths.omarchyHyprConfigPath) ||
    priorOwnedOmarchySharedPaths.has(paths.omarchyMenuPath);
  const omarchyExclusiveMutationPaths = omarchyIntegrationEnabled
    ? omarchyExclusivePaths
    : priorOwnedOmarchyExclusivePaths;
  const includeOmarchyManagedRoot =
    omarchyIntegrationEnabled ||
    priorOwnedOmarchyExclusivePaths.some((filePath) =>
      filePath.startsWith(`${NodePath.join(paths.installRoot, "omarchy")}${NodePath.sep}`),
    );
  if (input.preflightOnly === true) {
    await assertPhysicalManagedArtifactRoot(paths, includeOmarchyManagedRoot, {
      createMissing: false,
    });
    await assertManagedCurrentSelection(paths);
    await validateExistingDesktopArtifact(prepared, dependencies);
    return { ...prepared, priorOwnershipManifest };
  }
  await assertPhysicalManagedArtifactRoot(paths, includeOmarchyManagedRoot);
  await assertManagedCurrentSelection(paths);
  const managedPaths = [
    paths.launcherPath,
    paths.servicePath,
    ...(installStaging ? [paths.stagingServicePath] : []),
    ...(priorOwnedLegacyProductionService ? [paths.legacyProductionServicePath] : []),
    paths.desktopEntryPath,
    ...(installStaging ? [paths.stagingDesktopEntryPath] : []),
    paths.urlHandlerPath,
    ...omarchyExclusiveMutationPaths,
    paths.ownershipManifestPath,
    paths.currentPath,
    ...(iconContent || priorOwnedIcon ? [paths.iconPath] : []),
  ];
  await dependencies.beforeManagedStateSnapshot?.({ paths });
  const priorManagedState = await Promise.all(
    managedPaths.map((filePath) => snapshotManagedPath(filePath, filePath === paths.currentPath)),
  );
  const priorManagedByPath = new Map(
    priorManagedState.map((snapshot) => [snapshot.filePath, snapshot]),
  );
  if (iconContent && !priorOwnedIcon) {
    const iconSnapshot = priorManagedByPath.get(paths.iconPath);
    if (
      iconSnapshot?.kind !== "missing" &&
      (iconSnapshot?.kind !== "file" || !iconSnapshot.content.equals(iconContent))
    ) {
      throw new Error("The unowned desktop icon changed before its exact recovery snapshot.");
    }
  }
  const mutatedPaths = new Set();
  const installedByPath = new Map();
  const writeOwnedFile = async (filePath, content, mode) => {
    const installedSnapshot = await writeFileIfChanged(
      filePath,
      content,
      mode,
      dependencies,
      priorManagedByPath.get(filePath),
      (installed) => {
        mutatedPaths.add(filePath);
        installedByPath.set(filePath, installed);
      },
    );
    return installedSnapshot !== null;
  };
  const recordMarkedMutation =
    (details) =>
    ({ snapshot, rendered, installedSnapshot }) => {
      mutatedPaths.add(details.filePath);
      priorManagedState.push({
        kind: "marked-file",
        ...details,
        priorSnapshot: snapshot,
        installedContent: rendered,
      });
      installedByPath.set(details.filePath, installedSnapshot);
    };
  let promotedNewArtifact = false;
  let promotedArtifactIdentity = null;
  try {
    const targetStat = await NodeFSP.lstat(targetRoot).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (targetStat === null) {
      await NodeFSP.mkdir(stagingRoot, { mode: 0o700 });
      const stagedArtifactHandle = await NodeFSP.open(
        stagedArtifact,
        noFollowOpenFlags(
          NodeFS.constants.O_CREAT | NodeFS.constants.O_EXCL | NodeFS.constants.O_WRONLY,
        ),
        0o755,
      );
      let stagedArtifactSha256;
      try {
        stagedArtifactSha256 = await copyFileToHandleAndHash(
          input.artifactPath,
          stagedArtifactHandle,
        );
        await stagedArtifactHandle.chmod(0o755);
        await stagedArtifactHandle.sync();
      } finally {
        await stagedArtifactHandle.close();
      }
      if (stagedArtifactSha256 !== artifactSha256) {
        throw new Error("Staged desktop artifact failed hash verification.");
      }
      await writeFileIfChanged(
        NodePath.join(stagingRoot, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        0o644,
      );
      const stagedManifest = NodePath.join(stagingRoot, "manifest.json");
      const openedStagedArtifact = await openManagedRegularFile(
        stagedArtifact,
        "Staged desktop artifact",
      );
      let openedStagedManifest;
      try {
        openedStagedManifest = await openManagedRegularFile(
          stagedManifest,
          "Staged desktop artifact manifest",
        );
        const [verifiedHash, verifiedManifestContent] = await Promise.all([
          sha256FileHandle(openedStagedArtifact.handle),
          openedStagedManifest.handle.readFile({ encoding: "utf8" }),
        ]);
        if (
          verifiedHash !== artifactSha256 ||
          JSON.stringify(JSON.parse(verifiedManifestContent)) !== JSON.stringify(manifest)
        ) {
          throw new Error("Staged desktop artifact failed descriptor-bound verification.");
        }
        await Promise.all([
          assertOpenFileStillOwnsPath(
            stagedArtifact,
            openedStagedArtifact,
            "Staged desktop artifact",
          ),
          assertOpenFileStillOwnsPath(
            stagedManifest,
            openedStagedManifest,
            "Staged desktop artifact manifest",
          ),
        ]);
        const stagingRootStat = await NodeFSP.lstat(stagingRoot);
        if (
          !stagingRootStat.isDirectory() ||
          stagingRootStat.isSymbolicLink() ||
          (await NodeFSP.realpath(stagingRoot)) !== stagingRoot
        ) {
          throw new Error("Staged desktop artifact root is not a physical directory.");
        }
        await assertPhysicalManagedArtifactRoot(paths, includeOmarchyManagedRoot);
        const racedTarget = await NodeFSP.lstat(targetRoot).catch((error) => {
          if (error?.code === "ENOENT") return null;
          throw error;
        });
        if (racedTarget !== null) {
          throw new Error("Desktop artifact target appeared during installation.");
        }
        promotedArtifactIdentity = { dev: stagingRootStat.dev, ino: stagingRootStat.ino };
        await NodeFSP.rename(stagingRoot, targetRoot);
        promotedNewArtifact = true;
        if (dependencies.afterArtifactPromotion) {
          await dependencies.afterArtifactPromotion(targetRoot);
        }
        const promotedRootStat = await NodeFSP.lstat(targetRoot);
        if (
          !promotedRootStat.isDirectory() ||
          promotedRootStat.isSymbolicLink() ||
          promotedRootStat.dev !== promotedArtifactIdentity.dev ||
          promotedRootStat.ino !== promotedArtifactIdentity.ino ||
          (await NodeFSP.realpath(targetRoot)) !== targetRoot
        ) {
          throw new Error("Promoted desktop artifact root is not a physical directory.");
        }
        await Promise.all([
          assertOpenFileStillOwnsPath(
            targetArtifact,
            openedStagedArtifact,
            "Promoted desktop artifact",
          ),
          assertOpenFileStillOwnsPath(
            NodePath.join(targetRoot, "manifest.json"),
            openedStagedManifest,
            "Promoted desktop artifact manifest",
          ),
        ]);
      } finally {
        await Promise.allSettled([
          openedStagedArtifact.handle.close(),
          ...(openedStagedManifest ? [openedStagedManifest.handle.close()] : []),
        ]);
      }
    } else {
      if (
        !targetStat.isDirectory() ||
        targetStat.isSymbolicLink() ||
        (await NodeFSP.realpath(targetRoot)) !== targetRoot
      ) {
        throw new Error("Content-addressed desktop artifact root is not a directory.");
      }
      const targetManifest = NodePath.join(targetRoot, "manifest.json");
      const installedArtifact = await openManagedRegularFile(
        targetArtifact,
        "Existing content-addressed desktop artifact",
      );
      let installedManifest;
      try {
        installedManifest = await openManagedRegularFile(
          targetManifest,
          "Existing content-addressed desktop artifact manifest",
        );
        await dependencies.afterExistingArtifactOpen?.({
          artifactPath: targetArtifact,
          manifestPath: targetManifest,
        });
        const [installedArtifactHash, installedManifestContent] = await Promise.all([
          sha256FileHandle(installedArtifact.handle),
          installedManifest.handle.readFile({ encoding: "utf8" }),
        ]);
        let installedManifestValue;
        try {
          installedManifestValue = JSON.parse(installedManifestContent);
        } catch {
          throw new Error("Existing content-addressed desktop artifact is invalid.");
        }
        if (
          installedArtifactHash !== artifactSha256 ||
          JSON.stringify(installedManifestValue) !== JSON.stringify(manifest)
        ) {
          throw new Error("Existing content-addressed desktop artifact is invalid.");
        }
        await Promise.all([
          assertOpenFileStillOwnsPath(
            targetArtifact,
            installedArtifact,
            "Existing content-addressed desktop artifact",
          ),
          assertOpenFileStillOwnsPath(
            targetManifest,
            installedManifest,
            "Existing content-addressed desktop artifact manifest",
          ),
        ]);
        if ((installedArtifact.stat.mode & 0o777) !== 0o755) {
          await installedArtifact.handle.chmod(0o755);
        }
        await Promise.all([
          assertOpenFileStillOwnsPath(
            targetArtifact,
            installedArtifact,
            "Existing content-addressed desktop artifact",
          ),
          assertOpenFileStillOwnsPath(
            targetManifest,
            installedManifest,
            "Existing content-addressed desktop artifact manifest",
          ),
        ]);
      } finally {
        await Promise.allSettled([
          installedArtifact.handle.close(),
          ...(installedManifest ? [installedManifest.handle.close()] : []),
        ]);
      }
    }

    await writeOwnedFile(paths.launcherPath, launcherContent, 0o755);
    if (iconContent) {
      await writeOwnedFile(paths.iconPath, iconContent, 0o644);
    } else if (priorOwnedIcon) {
      const iconSnapshot = priorManagedState.find(
        (snapshot) => snapshot.filePath === paths.iconPath,
      );
      if (!iconSnapshot) {
        throw new Error("The prior desktop icon snapshot is missing.");
      }
      if (await removeManagedPathIfUnchanged(iconSnapshot, dependencies)) {
        mutatedPaths.add(paths.iconPath);
        installedByPath.set(paths.iconPath, { filePath: paths.iconPath, kind: "missing" });
      }
    }
    await writeOwnedFile(paths.servicePath, renderedService, 0o644);
    if (stagingFiles) {
      await writeOwnedFile(paths.stagingServicePath, stagingFiles.service, 0o644);
    }
    if (priorOwnedLegacyProductionService) {
      const legacyServiceSnapshot = priorManagedState.find(
        (snapshot) => snapshot.filePath === paths.legacyProductionServicePath,
      );
      if (!legacyServiceSnapshot) {
        throw new Error("The legacy production desktop service snapshot is missing.");
      }
      if (await removeManagedPathIfUnchanged(legacyServiceSnapshot, dependencies)) {
        mutatedPaths.add(paths.legacyProductionServicePath);
        installedByPath.set(paths.legacyProductionServicePath, {
          filePath: paths.legacyProductionServicePath,
          kind: "missing",
        });
      }
    }
    await writeOwnedFile(paths.desktopEntryPath, renderedDesktop, 0o644);
    if (stagingFiles) {
      await writeOwnedFile(paths.stagingDesktopEntryPath, stagingFiles.desktop, 0o644);
    }
    await writeOwnedFile(paths.urlHandlerPath, renderedUrlHandler, 0o644);
    if (omarchyIntegrationEnabled) {
      await writeOwnedFile(paths.omarchyCommandPath, renderedOmarchyCommand, 0o755);
      await writeOwnedFile(paths.omarchyAgentPath, renderedOmarchyAgent, 0o755);
      await writeOwnedFile(paths.omarchyDefaultAgentPath, renderedOmarchyDefaultAgent, 0o755);
      await writeOwnedFile(paths.omarchyHyprModulePath, renderedOmarchyHyprModule, 0o644);
      await writeOwnedFile(paths.omarchyUwsmEnvironmentPath, renderedOmarchyUwsmEnvironment, 0o644);

      await dependencies.beforeOmarchySharedSnapshot?.({ paths });
      await replaceMarkedSharedFile(
        {
          filePath: paths.omarchyHyprConfigPath,
          label: "The Omarchy Hyprland user configuration",
          requireExisting: true,
          fallback: "",
          render: renderMarkedHyprConfig,
          mode: 0o644,
          recordInstalled: recordMarkedMutation({
            filePath: paths.omarchyHyprConfigPath,
            markerStart: OMARCHY_HYPR_MARKER_START,
            markerEnd: OMARCHY_HYPR_MARKER_END,
            label: "Hyprland configuration",
            insertMissingMarker: renderMarkedHyprConfig,
          }),
        },
        dependencies,
      );
      await replaceMarkedSharedFile(
        {
          filePath: paths.omarchyMenuPath,
          label: "The Omarchy menu extension",
          requireExisting: false,
          fallback: "{\n}\n",
          render: (content) => renderMarkedOmarchyMenu(content, paths),
          mode: 0o644,
          recordInstalled: recordMarkedMutation({
            filePath: paths.omarchyMenuPath,
            markerStart: OMARCHY_MENU_MARKER_START,
            markerEnd: OMARCHY_MENU_MARKER_END,
            label: "Omarchy menu extension",
            insertMissingMarker: (content) => renderMarkedOmarchyMenu(content, paths),
            mergePriorBlock: mergePriorMenuMarkerPayload,
          }),
        },
        dependencies,
      );
    } else if (priorOmarchyIntegrationManaged) {
      for (const filePath of priorOwnedOmarchyExclusivePaths) {
        const snapshot = priorManagedState.find((candidate) => candidate.filePath === filePath);
        if (snapshot && (await removeManagedPathIfUnchanged(snapshot, dependencies))) {
          mutatedPaths.add(filePath);
          installedByPath.set(filePath, { filePath, kind: "missing" });
        }
      }

      if (priorOwnedOmarchySharedPaths.has(paths.omarchyHyprConfigPath)) {
        await replaceMarkedSharedFile(
          {
            filePath: paths.omarchyHyprConfigPath,
            label: "The Omarchy Hyprland user configuration",
            requireExisting: false,
            skipMissing: true,
            fallback: "",
            render: (content) =>
              removeMarkedBlock(
                content,
                OMARCHY_HYPR_MARKER_START,
                OMARCHY_HYPR_MARKER_END,
                "Hyprland configuration",
              ),
            mode: 0o644,
            recordInstalled: recordMarkedMutation({
              filePath: paths.omarchyHyprConfigPath,
              markerStart: OMARCHY_HYPR_MARKER_START,
              markerEnd: OMARCHY_HYPR_MARKER_END,
              label: "Hyprland configuration",
              insertMissingMarker: renderMarkedHyprConfig,
            }),
          },
          dependencies,
        );
      }
      if (priorOwnedOmarchySharedPaths.has(paths.omarchyMenuPath)) {
        await replaceMarkedSharedFile(
          {
            filePath: paths.omarchyMenuPath,
            label: "The Omarchy menu extension",
            requireExisting: false,
            skipMissing: true,
            fallback: "",
            render: (content) =>
              removeMarkedBlock(
                content,
                OMARCHY_MENU_MARKER_START,
                OMARCHY_MENU_MARKER_END,
                "Omarchy menu extension",
              ),
            mode: 0o644,
            recordInstalled: recordMarkedMutation({
              filePath: paths.omarchyMenuPath,
              markerStart: OMARCHY_MENU_MARKER_START,
              markerEnd: OMARCHY_MENU_MARKER_END,
              label: "Omarchy menu extension",
              insertMissingMarker: (content) => renderMarkedOmarchyMenu(content, paths),
              mergePriorBlock: mergePriorMenuMarkerPayload,
            }),
          },
          dependencies,
        );
      }
    }
    const ownershipManifest = {
      contractVersion: LAUNCHER_CONTRACT_VERSION,
      productAppId: OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId,
      managedPaths: [
        paths.launcherPath,
        paths.servicePath,
        ...(installStaging ? [paths.stagingServicePath] : []),
        paths.desktopEntryPath,
        ...(installStaging ? [paths.stagingDesktopEntryPath] : []),
        paths.urlHandlerPath,
        ...(omarchyIntegrationEnabled ? omarchyExclusivePaths : []),
        ...(iconContent ? [paths.iconPath] : []),
      ],
      managedSharedPaths: omarchyIntegrationEnabled
        ? [
            {
              path: paths.omarchyHyprConfigPath,
              markerStart: OMARCHY_HYPR_MARKER_START,
              markerEnd: OMARCHY_HYPR_MARKER_END,
              contractVersion: OMARCHY_ADAPTER_CONTRACT_VERSION,
            },
            {
              path: paths.omarchyMenuPath,
              markerStart: OMARCHY_MENU_MARKER_START.trimStart(),
              markerEnd: OMARCHY_MENU_MARKER_END.trimStart(),
              contractVersion: OMARCHY_ADAPTER_CONTRACT_VERSION,
            },
          ]
        : [],
    };
    await writeOwnedFile(
      paths.ownershipManifestPath,
      `${JSON.stringify(ownershipManifest, null, 2)}\n`,
      0o600,
    );

    const relativeTarget = NodePath.relative(NodePath.dirname(paths.currentPath), targetRoot);
    const currentTarget = await NodeFSP.readlink(paths.currentPath).catch(() => null);
    if (currentTarget !== relativeTarget) {
      const linkTemporaryPath = `${paths.currentPath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
      await NodeFSP.symlink(relativeTarget, linkTemporaryPath);
      try {
        const installedLinkStat = await NodeFSP.lstat(linkTemporaryPath);
        const installedLinkSnapshot = {
          filePath: paths.currentPath,
          kind: "symlink",
          target: relativeTarget,
          dev: installedLinkStat.dev,
          ino: installedLinkStat.ino,
        };
        await assertPhysicalManagedArtifactRoot(paths, includeOmarchyManagedRoot);
        const currentSnapshot = await snapshotManagedPath(paths.currentPath, true);
        if (!snapshotsMatch(priorManagedByPath.get(paths.currentPath), currentSnapshot)) {
          throw new Error("Desktop current link changed during installation.");
        }
        await NodeFSP.rename(linkTemporaryPath, paths.currentPath);
        mutatedPaths.add(paths.currentPath);
        installedByPath.set(paths.currentPath, installedLinkSnapshot);
        if (dependencies.afterManagedFileRename) {
          await dependencies.afterManagedFileRename(paths.currentPath);
        }
        const installedLinkPath = await snapshotManagedPath(paths.currentPath, true);
        if (!snapshotsMatch(installedLinkSnapshot, installedLinkPath)) {
          throw new ManagedSharedPathChangedError(
            `Managed installer destination changed after replacement: ${paths.currentPath}`,
          );
        }
      } finally {
        await NodeFSP.rm(linkTemporaryPath, { force: true });
      }
    }
    if (input.refreshDesktopIntegration) {
      await refreshLinuxDesktopIntegration(paths, dependencies);
      await claimLinuxDesktopUrlHandler(paths, dependencies);
    }
    return { artifactSha256, targetRoot, paths };
  } catch (error) {
    await NodeFSP.rm(stagingRoot, { recursive: true, force: true });
    const artifactRollbackErrors = [];
    if (promotedNewArtifact) {
      const current = await NodeFSP.lstat(targetRoot).catch((cause) => {
        if (cause?.code === "ENOENT") return null;
        throw cause;
      });
      if (
        current === null ||
        (current.isDirectory() &&
          !current.isSymbolicLink() &&
          current.dev === promotedArtifactIdentity?.dev &&
          current.ino === promotedArtifactIdentity?.ino)
      ) {
        if (current !== null) await NodeFSP.rm(targetRoot, { recursive: true });
      } else {
        artifactRollbackErrors.push(
          new Error("Refusing to remove a desktop artifact root that changed after promotion."),
        );
      }
    }
    const rollbackResults = await Promise.allSettled(
      priorManagedState
        .filter((snapshot) => mutatedPaths.has(snapshot.filePath))
        .toReversed()
        .map((snapshot) =>
          restoreManagedPathIfStillOwned(snapshot, installedByPath.get(snapshot.filePath)),
        ),
    );
    const rollbackErrors = [
      ...artifactRollbackErrors,
      ...rollbackResults
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason),
    ];
    if (rollbackErrors.length > 0) {
      const rollbackError = new Error(
        `Desktop installation failed and ${rollbackErrors.length} managed paths could not be restored.`,
        { cause: error },
      );
      rollbackError.rollbackErrors = rollbackErrors;
      throw rollbackError;
    }
    if (input.refreshDesktopIntegration) {
      const run = dependencies.runCommand ?? commandResult;
      await run("systemctl", ["--user", "daemon-reload"]);
      await run("update-desktop-database", [NodePath.dirname(paths.desktopEntryPath)]);
    }
    throw error;
  }
}

export async function prepareLinuxDesktopInstall(input, dependencies = {}) {
  return installLinuxDesktop({ ...input, prepareOnly: true }, dependencies);
}

export async function preflightLinuxDesktopInstall(input, dependencies = {}) {
  return installLinuxDesktop({ ...input, preflightOnly: true }, dependencies);
}

async function inspectExpectedDesktopFile(file, findings) {
  try {
    const status = await NodeFSP.lstat(file.path);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push(`${file.id}:unsafe-type`);
      return;
    }
    const expected = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    if (!(await NodeFSP.readFile(file.path)).equals(expected)) {
      findings.push(`${file.id}:content-drift`);
    }
    if ((status.mode & 0o777) !== file.mode) findings.push(`${file.id}:mode-drift`);
  } catch (error) {
    if (error?.code === "ENOENT") findings.push(`${file.id}:missing`);
    else throw error;
  }
}

async function readPhysicalJsonFile(filePath, mode, id, findings) {
  try {
    const status = await NodeFSP.lstat(filePath);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push(`${id}:unsafe-type`);
      return undefined;
    }
    if ((status.mode & 0o777) !== mode) findings.push(`${id}:mode-drift`);
    try {
      return JSON.parse(await NodeFSP.readFile(filePath, "utf8"));
    } catch {
      findings.push(`${id}:invalid`);
      return undefined;
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      findings.push(`${id}:missing`);
      return undefined;
    }
    throw error;
  }
}

export async function doctorLinuxDesktop(input, dependencies = {}) {
  const prepared = await prepareLinuxDesktopInstall(input, dependencies);
  const findings = [];
  try {
    await assertPhysicalManagedArtifactRoot(prepared.paths, prepared.omarchyIntegrationEnabled, {
      createMissing: false,
    });
  } catch {
    findings.push("artifact-root:unsafe");
  }
  for (const file of prepared.files) await inspectExpectedDesktopFile(file, findings);

  try {
    const status = await NodeFSP.lstat(prepared.paths.currentPath);
    if (!status.isSymbolicLink()) findings.push("current:unsafe-type");
    else {
      const target = await NodeFSP.realpath(prepared.paths.currentPath);
      if (target !== prepared.targetRoot) findings.push("current:target-drift");
    }
  } catch (error) {
    if (error?.code === "ENOENT") findings.push("current:missing");
    else throw error;
  }

  try {
    const artifact = await openManagedRegularFile(
      prepared.targetArtifact,
      "Installed content-addressed desktop artifact",
    );
    try {
      if ((artifact.stat.mode & 0o777) !== 0o755) findings.push("artifact:mode-drift");
      if ((await sha256FileHandle(artifact.handle)) !== prepared.artifactSha256) {
        findings.push("artifact:content-drift");
      }
      await assertOpenFileStillOwnsPath(
        prepared.targetArtifact,
        artifact,
        "Installed content-addressed desktop artifact",
      );
    } finally {
      await artifact.handle.close();
    }
  } catch (error) {
    if (error?.cause?.code === "ENOENT" || error?.code === "ENOENT")
      findings.push("artifact:missing");
    else findings.push("artifact:unsafe-type");
  }

  const installedManifest = await readPhysicalJsonFile(
    NodePath.join(prepared.targetRoot, "manifest.json"),
    0o644,
    "artifact-manifest",
    findings,
  );
  if (installedManifest !== undefined) {
    if (JSON.stringify(installedManifest) !== JSON.stringify(prepared.manifest)) {
      findings.push("artifact-manifest:content-drift");
    }
  }

  const ownership = await readPhysicalJsonFile(
    prepared.paths.ownershipManifestPath,
    0o600,
    "ownership-manifest",
    findings,
  );
  if (ownership !== undefined) {
    const required = [
      prepared.paths.launcherPath,
      prepared.paths.servicePath,
      prepared.paths.desktopEntryPath,
      prepared.paths.urlHandlerPath,
    ];
    if (
      ownership?.contractVersion !== LAUNCHER_CONTRACT_VERSION ||
      ownership?.productAppId !== OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId ||
      !Array.isArray(ownership.managedPaths) ||
      !required.every((filePath) => ownership.managedPaths.includes(filePath))
    ) {
      findings.push("ownership-manifest:content-drift");
    }
    const stagingOwned =
      ownership?.managedPaths?.includes(prepared.paths.stagingServicePath) ||
      ownership?.managedPaths?.includes(prepared.paths.stagingDesktopEntryPath);
    if (prepared.installStaging !== Boolean(stagingOwned)) {
      findings.push("ownership-manifest:staging-drift");
    }
  }

  if (!prepared.installStaging) {
    for (const [id, filePath] of [
      ["staging-service", prepared.paths.stagingServicePath],
      ["staging-desktop", prepared.paths.stagingDesktopEntryPath],
    ]) {
      const status = await NodeFSP.lstat(filePath).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (status !== null) findings.push(`${id}:unexpected`);
    }
  }

  return { ok: findings.length === 0, findings, prepared };
}

async function findAppImages(directory) {
  const found = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await NodeFSP.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = NodePath.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".AppImage")) found.push(entryPath);
    }
  }
  return found;
}

export async function buildAndInstallCurrentLinuxDesktop(input = {}, dependencies = {}) {
  const run = dependencies.runCommand ?? commandResult;
  const root = input.repositoryRoot ?? repositoryRoot;
  const architecture = input.architecture ?? HOST_ARCHITECTURE;
  if (!["x64", "arm64"].includes(architecture)) {
    throw new Error(`Unsupported Linux desktop architecture: ${architecture}`);
  }
  const status = await run("git", ["status", "--porcelain"], { cwd: root });
  if (status.code !== 0 || status.stdout.trim().length > 0) {
    throw new Error("Official current desktop builds require a clean repository worktree.");
  }
  const revision = await run("git", ["rev-parse", "HEAD"], { cwd: root });
  if (revision.code !== 0 || !/^[0-9a-f]{40}$/.test(revision.stdout.trim().toLowerCase())) {
    throw new Error("Could not resolve the current repository commit.");
  }
  const outputDirectory = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "t3code-desktop-build-current-"),
  );
  try {
    const build = await run(
      process.execPath,
      [
        NodePath.join(root, "scripts", "build-desktop-artifact.ts"),
        "--platform",
        "linux",
        "--target",
        "AppImage",
        "--arch",
        architecture,
        "--output-dir",
        outputDirectory,
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (build.code !== 0) throw new Error("Official Linux desktop artifact build failed.");
    const appImages = await findAppImages(outputDirectory);
    if (appImages.length !== 1) {
      throw new Error(`Expected one current AppImage build, found ${appImages.length}.`);
    }
    const descriptorPath = linuxDesktopReleaseDescriptorPath(appImages[0]);
    await NodeFSP.access(descriptorPath).catch(() => {
      throw new Error("Official Linux desktop artifact descriptor was not produced.");
    });
    return await installLinuxDesktop(
      {
        artifactPath: appImages[0],
        descriptorPath,
        iconPath: NodePath.join(root, "assets", "prod", "black-universal-1024.png"),
        runtimeDirectory: input.runtimeDirectory ?? process.env.XDG_RUNTIME_DIR,
        productionServerUrl: input.productionServerUrl,
        stagingServerUrl: input.stagingServerUrl,
        environment: input.environment,
        paths: input.paths,
        nodeExecutable: input.nodeExecutable,
        refreshDesktopIntegration: true,
      },
      dependencies,
    );
  } finally {
    await NodeFSP.rm(outputDirectory, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const buildCurrent = args[0] === "--build-current";
  const pairs = buildCurrent ? args.slice(1) : args;
  const values = {};
  for (let index = 0; index < pairs.length; index += 2) {
    const name = pairs[index];
    const value = pairs[index + 1];
    if (!name?.startsWith("--") || value === undefined)
      throw new Error("Installer arguments require name and value pairs.");
    values[name.slice(2)] = value;
  }
  if (!values["production-server-url"]) throw new Error("Missing --production-server-url.");
  if (buildCurrent) return { buildCurrent: true, ...values };
  for (const required of ["artifact", "descriptor"]) {
    if (!values[required]) throw new Error(`Missing --${required}.`);
  }
  return values;
}

async function main() {
  if (HOST_PLATFORM !== "linux")
    throw new Error("Linux desktop installation is supported only on Linux.");
  const args = parseArguments(process.argv.slice(2));
  if (args.buildCurrent) {
    await buildAndInstallCurrentLinuxDesktop({
      productionServerUrl: args["production-server-url"],
      stagingServerUrl: args["staging-server-url"],
    });
    console.log(
      args["staging-server-url"]
        ? "Built and installed the current T3 Code production and staging launchers."
        : "Built and installed the current T3 Code production launcher.",
    );
    return;
  }
  await installLinuxDesktop({
    artifactPath: NodePath.resolve(args.artifact),
    descriptorPath: NodePath.resolve(args.descriptor),
    iconPath: args.icon
      ? NodePath.resolve(args.icon)
      : NodePath.join(repositoryRoot, "assets", "prod", "black-universal-1024.png"),
    runtimeDirectory: process.env.XDG_RUNTIME_DIR,
    productionServerUrl: args["production-server-url"],
    stagingServerUrl: args["staging-server-url"],
    refreshDesktopIntegration: true,
  });
  console.log(
    args["staging-server-url"]
      ? "Installed T3 Code production and staging desktop launchers."
      : "Installed the T3 Code production desktop launcher.",
  );
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
