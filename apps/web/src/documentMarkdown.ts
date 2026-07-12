export interface DocumentMarkdownOutlineItem {
  readonly id: string;
  readonly level: number;
  readonly title: string;
}

const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const MARKDOWN_CONTROL_PATTERN = /[`*_~[\]()]/g;

function decodeBasicEntity(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function plainDocumentMarkdownText(value: string): string {
  return decodeBasicEntity(
    value.replace(HTML_TAG_PATTERN, "").replace(MARKDOWN_CONTROL_PATTERN, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function slugDocumentMarkdownHeading(value: string): string {
  const plain = plainDocumentMarkdownText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return plain.length > 0 ? plain : "section";
}

export function uniqueDocumentMarkdownHeadingId(value: string, seen: Map<string, number>): string {
  const slug = slugDocumentMarkdownHeading(value);
  const count = seen.get(slug) ?? 0;
  seen.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count + 1}`;
}

export function extractDocumentMarkdownOutline(
  markdown: string,
): ReadonlyArray<DocumentMarkdownOutlineItem> {
  const items: DocumentMarkdownOutlineItem[] = [];
  const seen = new Map<string, number>();
  let inFence = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^\s{0,3}```/.test(line) || /^\s{0,3}~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(MARKDOWN_HEADING_PATTERN);
    if (!match?.[1] || !match[2]) continue;

    const title = plainDocumentMarkdownText(match[2]);
    if (!title) continue;

    items.push({
      id: uniqueDocumentMarkdownHeadingId(title, seen),
      level: match[1].length,
      title,
    });
  }

  return items;
}

export function documentMarkdownLinkCwd(
  workspaceCwd: string | undefined,
  filePath: string,
): string | undefined {
  if (!workspaceCwd) return undefined;

  const normalizedFilePath = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const directoryEnd = normalizedFilePath.lastIndexOf("/");
  if (directoryEnd <= 0) return workspaceCwd;

  const directory = normalizedFilePath.slice(0, directoryEnd).replace(/\/+$/, "");
  if (!directory) return workspaceCwd;

  return `${workspaceCwd.replace(/\/+$/, "")}/${directory}`;
}
