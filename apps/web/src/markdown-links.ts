import { formatWorkspaceRelativePath } from "./filePathDisplay";
import { resolvePathLinkTarget, splitPathAndPosition } from "./terminal-links";

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;
const EXTERNAL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/;
const RELATIVE_PATH_PREFIX_PATTERN = /^(~\/|\.{1,2}\/)/;
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/;
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/;
const POSITION_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
const POSITION_ONLY_PATTERN = /^\d+(?::\d+)?$/;
const POSIX_FILE_ROOT_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/etc/",
  "/opt/",
  "/mnt/",
  "/Volumes/",
  "/private/",
  "/root/",
] as const;
const INLINE_CODE_DISQUALIFIER_PATTERN = /[\s`"'<>|;&$]/;
const INLINE_CODE_GLOB_PATTERN = /[*?[\]{}]/;
const INLINE_CODE_FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9_-]+$/;
const INLINE_CODE_BARE_FILE_POSITION_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9_-]+(?::\d+){1,2}$/;
const INLINE_CODE_BARE_FILE_EXTENSIONS = new Set([
  "c",
  "conf",
  "cpp",
  "css",
  "env",
  "go",
  "h",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "lock",
  "md",
  "php",
  "pl",
  "pt",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);
const INLINE_CODE_HOST_TLDS = new Set([
  "ai",
  "app",
  "biz",
  "cloud",
  "co",
  "com",
  "dev",
  "edu",
  "gg",
  "gov",
  "info",
  "io",
  "link",
  "me",
  "mil",
  "net",
  "online",
  "org",
  "site",
  "store",
  "tech",
  "tv",
  "xyz",
]);
const INLINE_CODE_COUNTRY_HOST_TLDS = new Set([
  "at",
  "au",
  "be",
  "br",
  "ca",
  "ch",
  "cn",
  "cz",
  "de",
  "dk",
  "es",
  "eu",
  "fi",
  "fr",
  "hk",
  "ie",
  "it",
  "jp",
  "kr",
  "mx",
  "nl",
  "no",
  "nz",
  "pl",
  "pt",
  "ru",
  "se",
  "sg",
  "tr",
  "uk",
  "us",
]);
const INLINE_CODE_PRIVATE_HOST_TLDS = new Set([
  "example",
  "internal",
  "invalid",
  "local",
  "localhost",
  "test",
]);

export interface MarkdownFileLinkMeta {
  filePath: string;
  targetPath: string;
  displayPath: string;
  workspaceRelativePath: string | null;
  basename: string;
  line?: number;
  column?: number;
}

export interface InlineCodeSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function unwrapMarkdownLinkDestination(value: string): string {
  return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

export function normalizeMarkdownLinkDestination(value: string): string {
  return unwrapMarkdownLinkDestination(value.trim());
}

function stripSearchAndHash(value: string): { path: string; hash: string } {
  const hashIndex = value.indexOf("#");
  const pathWithSearch = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const rawHash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = pathWithSearch.indexOf("?");
  const path = queryIndex >= 0 ? pathWithSearch.slice(0, queryIndex) : pathWithSearch;
  return { path, hash: rawHash };
}

function normalizeWindowsDrivePath(path: string): string {
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
}

function parseFileUrlHref(
  href: string,
  options?: { readonly decodePath?: boolean },
): { path: string; hash: string } | null {
  try {
    const parsed = new URL(href);
    if (parsed.protocol.toLowerCase() !== "file:") return null;

    const rawPath = parsed.pathname;
    if (rawPath.length === 0) return null;

    // Browser URL parser encodes "C:/foo" as "/C:/foo" for file URLs.
    const normalizedPath = normalizeWindowsDrivePath(rawPath);

    return {
      path: options?.decodePath === false ? normalizedPath : safeDecode(normalizedPath),
      hash: parsed.hash,
    };
  } catch {
    return null;
  }
}

export function rewriteMarkdownFileUriHref(href: string | undefined): string | null {
  if (!href) return null;
  const normalizedHref = normalizeMarkdownLinkDestination(href);
  const target = parseFileUrlHref(normalizedHref, { decodePath: false });
  if (!target) return null;
  return `${target.path}${target.hash}`;
}

function looksLikePosixFilesystemPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (POSIX_FILE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (POSITION_SUFFIX_PATTERN.test(path)) return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return /\.[A-Za-z0-9_-]+$/.test(basename);
}

function looksLikeBroadRelativeFilePath(path: string): boolean {
  if (!/[\s%]/.test(path)) return false;
  if (path.includes("\u0000") || path.includes("<") || path.includes(">")) return false;

  const pathWithoutPosition = path.replace(POSITION_SUFFIX_PATTERN, "");
  const separatorIndex = Math.max(
    pathWithoutPosition.lastIndexOf("/"),
    pathWithoutPosition.lastIndexOf("\\"),
  );
  const basename =
    separatorIndex >= 0 ? pathWithoutPosition.slice(separatorIndex + 1) : pathWithoutPosition;
  return /\.[A-Za-z0-9_-]+$/.test(basename);
}

function appendLineColumnFromHash(path: string, hash: string): string {
  if (!hash || POSITION_SUFFIX_PATTERN.test(path)) return path;
  const match = hash.match(/^#L(\d+)(?:C(\d+))?$/i);
  if (!match?.[1]) return path;
  const line = match[1];
  const column = match[2];
  return `${path}:${line}${column ? `:${column}` : ""}`;
}

function isLikelyPathCandidate(path: string): boolean {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(path) || WINDOWS_UNC_PATH_PATTERN.test(path)) return true;
  if (RELATIVE_PATH_PREFIX_PATTERN.test(path)) return true;
  if (path.startsWith("/")) return looksLikePosixFilesystemPath(path);
  return (
    RELATIVE_FILE_PATH_PATTERN.test(path) ||
    RELATIVE_FILE_NAME_PATTERN.test(path) ||
    looksLikeBroadRelativeFilePath(path)
  );
}

function isRelativePath(path: string): boolean {
  return (
    RELATIVE_PATH_PREFIX_PATTERN.test(path) ||
    (!path.startsWith("/") &&
      !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
      !WINDOWS_UNC_PATH_PATTERN.test(path))
  );
}

function hasExternalScheme(path: string): boolean {
  const match = path.match(EXTERNAL_SCHEME_PATTERN);
  if (!match) return false;
  const rest = match[2] ?? "";
  if (rest.startsWith("//")) return true;
  return !POSITION_ONLY_PATTERN.test(rest);
}

export function resolveMarkdownFileLinkTarget(
  href: string | undefined,
  cwd?: string,
): string | null {
  if (!href) return null;
  const rawHref = normalizeMarkdownLinkDestination(href);
  if (rawHref.length === 0 || rawHref.startsWith("#")) return null;

  const fileUrlTarget = rawHref.toLowerCase().startsWith("file:")
    ? parseFileUrlHref(rawHref)
    : null;
  const source = fileUrlTarget ?? stripSearchAndHash(rawHref);
  const decodedPath = normalizeWindowsDrivePath(
    fileUrlTarget ? source.path.trim() : safeDecode(source.path.trim()),
  );
  const decodedHash = safeDecode(source.hash.trim());

  if (decodedPath.length === 0) return null;
  if (
    !WINDOWS_DRIVE_PATH_PATTERN.test(decodedPath) &&
    !WINDOWS_UNC_PATH_PATTERN.test(decodedPath) &&
    hasExternalScheme(decodedPath)
  ) {
    return null;
  }

  if (!isLikelyPathCandidate(decodedPath)) return null;

  const pathWithPosition = appendLineColumnFromHash(decodedPath, decodedHash);
  if (!isRelativePath(pathWithPosition)) {
    return pathWithPosition;
  }

  if (!cwd) return null;
  return resolvePathLinkTarget(pathWithPosition, cwd);
}

function normalizeAbsolutePath(path: string): string | null {
  const slashPath = normalizeWindowsDrivePath(path.replaceAll("\\", "/"));
  const isUnc = slashPath.startsWith("//");
  const driveMatch = slashPath.match(/^([A-Za-z]:)(?:\/|$)/);
  const isAbsolute = slashPath.startsWith("/") || driveMatch !== null;
  if (!isAbsolute) return null;

  const prefix = driveMatch?.[1] ?? "";
  const body = driveMatch ? slashPath.slice(prefix.length) : isUnc ? slashPath.slice(2) : slashPath;
  const segments: string[] = [];
  for (const segment of body.split("/")) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (isUnc) {
    return segments.length >= 2 ? `//${segments.join("/")}` : null;
  }
  return `${prefix}/${segments.join("/")}`;
}

function isWindowsStylePath(path: string): boolean {
  const normalized = normalizeWindowsDrivePath(path);
  return /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith("//");
}

function pathInsideWorkspace(path: string, workspaceRoot: string): boolean {
  const normalizedPath = normalizeAbsolutePath(path);
  const normalizedRoot = normalizeAbsolutePath(workspaceRoot);
  if (!normalizedPath || !normalizedRoot) return false;

  const windowsStyle = isWindowsStylePath(normalizedPath) || isWindowsStylePath(normalizedRoot);
  const comparablePath = windowsStyle ? normalizedPath.toLowerCase() : normalizedPath;
  const comparableRoot = windowsStyle ? normalizedRoot.toLowerCase() : normalizedRoot;
  return comparablePath.startsWith(`${comparableRoot.replace(/\/+$/, "")}/`);
}

function normalizeWorkspaceTarget(targetPath: string, workspaceRoot: string): string | null {
  const { path, line, column } = splitPathAndPosition(targetPath);
  const normalizedPath = normalizeAbsolutePath(path);
  if (!normalizedPath || !pathInsideWorkspace(normalizedPath, workspaceRoot)) return null;
  return `${normalizedPath}${line ? `:${line}${column ? `:${column}` : ""}` : ""}`;
}

function hasInlineCodeFileShape(candidate: string): boolean {
  const withoutPosition = candidate.replace(POSITION_SUFFIX_PATTERN, "");
  if (
    RELATIVE_PATH_PREFIX_PATTERN.test(withoutPosition) ||
    withoutPosition.startsWith("/") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(withoutPosition) ||
    WINDOWS_UNC_PATH_PATTERN.test(withoutPosition)
  ) {
    return true;
  }

  if (INLINE_CODE_BARE_FILE_POSITION_PATTERN.test(candidate)) {
    const basename = candidate.replace(POSITION_SUFFIX_PATTERN, "");
    const extension = basename.slice(basename.lastIndexOf(".") + 1).toLowerCase();
    return INLINE_CODE_BARE_FILE_EXTENSIONS.has(extension);
  }
  if (!/[\\/]/.test(withoutPosition)) return false;
  return INLINE_CODE_FILE_EXTENSION_PATTERN.test(basenameOfPath(withoutPosition));
}

function looksLikeInlineCodeHost(candidate: string): boolean {
  const withoutPosition = candidate.replace(POSITION_SUFFIX_PATTERN, "");
  const firstSegment = withoutPosition.split(/[\\/]/, 1)[0]?.toLowerCase() ?? "";
  if (firstSegment === "localhost" || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(firstSegment)) {
    return true;
  }
  const labels = firstSegment.split(".");
  const tld = labels.length > 1 ? labels.at(-1) : undefined;
  if (tld === undefined) return false;
  if (!RELATIVE_PATH_PREFIX_PATTERN.test(withoutPosition) && /[\\/]/.test(withoutPosition)) {
    return true;
  }
  if (INLINE_CODE_HOST_TLDS.has(tld) || INLINE_CODE_PRIVATE_HOST_TLDS.has(tld)) return true;
  return !POSITION_SUFFIX_PATTERN.test(candidate) && INLINE_CODE_COUNTRY_HOST_TLDS.has(tld);
}

/**
 * Resolves an inline-code path only when it has strong file evidence and the
 * normalized target remains below the current workspace root.
 */
export function resolveInlineCodeFileLinkMeta(
  codeText: string,
  cwd: string | undefined,
  workspaceRoot: string | undefined,
): MarkdownFileLinkMeta | null {
  const trimmed = codeText.trim();
  const windowsAbsolute =
    WINDOWS_DRIVE_PATH_PATTERN.test(trimmed) || WINDOWS_UNC_PATH_PATTERN.test(trimmed);
  if (
    trimmed.length === 0 ||
    !cwd ||
    !workspaceRoot ||
    trimmed.includes("\u0000") ||
    INLINE_CODE_DISQUALIFIER_PATTERN.test(trimmed) ||
    INLINE_CODE_GLOB_PATTERN.test(trimmed) ||
    looksLikeInlineCodeHost(trimmed) ||
    (!windowsAbsolute && hasExternalScheme(trimmed)) ||
    !hasInlineCodeFileShape(trimmed)
  ) {
    return null;
  }

  const candidate = windowsAbsolute ? trimmed : trimmed.replaceAll("\\", "/");
  const targetPath = resolvePathLinkTarget(candidate, cwd);
  const workspaceTarget = normalizeWorkspaceTarget(targetPath, workspaceRoot);
  if (!workspaceTarget) return null;
  return buildFileLinkMetaFromTarget(workspaceTarget, workspaceRoot);
}

function inlineCodeSpanIsInsideBracketLabel(
  markdown: string,
  openingTickStart: number,
  closingTickEnd: number,
): boolean {
  const lineStart = markdown.lastIndexOf("\n", openingTickStart - 1) + 1;
  const before = markdown.slice(lineStart, openingTickStart);
  const openBracket = before.lastIndexOf("[");
  if (openBracket < 0 || before.slice(openBracket + 1).includes("]")) return false;

  const lineEnd = markdown.indexOf("\n", closingTickEnd);
  const after = markdown.slice(closingTickEnd, lineEnd < 0 ? markdown.length : lineEnd);
  return after.includes("]");
}

function normalizeInlineCodeText(value: string): string {
  const normalized = value.replaceAll("\n", " ");
  if (
    normalized.length >= 3 &&
    normalized.startsWith(" ") &&
    normalized.endsWith(" ") &&
    normalized.trim().length > 0
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

/**
 * Collects inline-code spans while excluding fenced blocks and code used as a
 * markdown link label. The markdown AST plugin remains the rendering authority.
 */
export function extractLinkableInlineCodeSpans(markdown: string): InlineCodeSpan[] {
  const spans: InlineCodeSpan[] = [];
  let offset = 0;
  let fence: { readonly marker: "`" | "~"; readonly length: number } | null = null;

  for (const lineWithNewline of markdown.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (lineWithNewline.length === 0) continue;
    const line = lineWithNewline.endsWith("\n") ? lineWithNewline.slice(0, -1) : lineWithNewline;
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length };
      } else if (
        marker === fence.marker &&
        fenceMatch[1].length >= fence.length &&
        /^ {0,3}(?:`{3,}|~{3,})\s*$/.test(line)
      ) {
        fence = null;
      }
      offset += lineWithNewline.length;
      continue;
    }

    if (!fence) {
      let cursor = 0;
      while (cursor < line.length) {
        if (line[cursor] !== "`") {
          cursor += 1;
          continue;
        }
        let runEnd = cursor + 1;
        while (line[runEnd] === "`") runEnd += 1;
        const marker = line.slice(cursor, runEnd);
        const closingStart = line.indexOf(marker, runEnd);
        if (closingStart < 0) break;
        const closingEnd = closingStart + marker.length;
        if (!inlineCodeSpanIsInsideBracketLabel(markdown, offset + cursor, offset + closingEnd)) {
          const text = normalizeInlineCodeText(line.slice(runEnd, closingStart));
          if (text.length > 0) {
            spans.push({
              text,
              start: offset + cursor,
              end: offset + closingEnd,
            });
          }
        }
        cursor = closingEnd;
      }
    }
    offset += lineWithNewline.length;
  }

  return spans;
}

function basenameOfPath(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

function workspaceRelativePath(path: string, workspaceRoot: string | undefined): string | null {
  if (!workspaceRoot) return null;
  const normalizedPath = normalizeWindowsDrivePath(path.replaceAll("\\", "/"));
  const normalizedRoot = normalizeWindowsDrivePath(workspaceRoot.replaceAll("\\", "/")).replace(
    /\/+$/,
    "",
  );
  const pathForCompare = normalizedPath.toLowerCase();
  const rootForCompare = normalizedRoot.toLowerCase();
  if (!pathForCompare.startsWith(`${rootForCompare}/`)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

export function resolveMarkdownFileLinkMeta(
  href: string | undefined,
  cwd?: string,
  workspaceRoot?: string,
): MarkdownFileLinkMeta | null {
  const targetPath = resolveMarkdownFileLinkTarget(href, cwd);
  if (!targetPath) return null;
  return buildFileLinkMetaFromTarget(targetPath, workspaceRoot ?? cwd);
}

function buildFileLinkMetaFromTarget(
  targetPath: string,
  displayRoot: string | undefined,
): MarkdownFileLinkMeta {
  const { path, line, column } = splitPathAndPosition(targetPath);
  const parsedLine = line ? Number.parseInt(line, 10) : Number.NaN;
  const parsedColumn = column ? Number.parseInt(column, 10) : Number.NaN;
  const lineNumber = Number.isFinite(parsedLine) ? parsedLine : undefined;
  const columnNumber = Number.isFinite(parsedColumn) ? parsedColumn : undefined;

  return {
    filePath: path,
    targetPath,
    displayPath: formatWorkspaceRelativePath(targetPath, displayRoot),
    workspaceRelativePath: workspaceRelativePath(path, displayRoot),
    basename: basenameOfPath(path),
    ...(lineNumber !== undefined ? { line: lineNumber } : {}),
    ...(columnNumber !== undefined ? { column: columnNumber } : {}),
  };
}
