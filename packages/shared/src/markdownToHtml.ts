// The few hast node kinds a sanitized chat tree holds; the rest serialize to nothing.
interface HastElement {
  readonly type: "element";
  readonly tagName: string;
  readonly properties?: Record<string, unknown>;
  readonly children: ReadonlyArray<HastNode>;
}
type HastNode =
  | { readonly type: "root"; readonly children: ReadonlyArray<HastNode> }
  | { readonly type: "text"; readonly value: string }
  | HastElement
  | { readonly type: "comment" | "doctype" | "raw" };
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { CHAT_MARKDOWN_REHYPE_PLUGINS, CHAT_MARKDOWN_REMARK_PLUGINS } from "./markdownPipeline.ts";

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "col", "wbr", "source"]);

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, "&quot;");
const attributeName = (name: string) =>
  name === "className" ? "class" : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function attributesOf(element: HastElement) {
  return Object.entries(element.properties ?? {}).flatMap(([name, value]) => {
    if (value === undefined || value === null || value === false) return [];
    const rendered = Array.isArray(value) ? value.join(" ") : value === true ? "" : String(value);
    return [` ${attributeName(name)}="${escapeAttribute(rendered)}"`];
  });
}

function serialize(node: HastNode): string {
  switch (node.type) {
    case "root":
      return node.children.map(serialize).join("");
    case "text":
      return escapeText(node.value);
    case "element": {
      const open = `<${node.tagName}${attributesOf(node).join("")}>`;
      if (VOID_ELEMENTS.has(node.tagName)) return open;
      return `${open}${node.children.map(serialize).join("")}</${node.tagName}>`;
    }
    default:
      // Sanitizing leaves no raw HTML, comments, or doctypes worth keeping in a preview.
      return "";
  }
}

/** Markdown as the chat renders it, sanitized the same way, as an HTML string for a page. */
export function markdownToHtml(markdown: string) {
  const processor = unified()
    .use(remarkParse)
    .use(CHAT_MARKDOWN_REMARK_PLUGINS)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(CHAT_MARKDOWN_REHYPE_PLUGINS);
  return serialize(processor.runSync(processor.parse(markdown)) as unknown as HastNode);
}
