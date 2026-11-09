// @effect-diagnostics nodeBuiltinImport:off
import {
  type ChatImageAttachment,
  type PreviewEvent,
  ThreadCanvasBrowserTrail,
  type ThreadCanvasBrowserTrailFrame,
  type ThreadCanvasElement,
  ThreadId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as NodeCrypto from "node:crypto";

import {
  createAttachmentId,
  resolveAttachmentPath,
  resolveAttachmentPathById,
} from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import { PreviewManager } from "../preview/Manager.ts";
import * as ServerBrowser from "../preview/ServerBrowser.ts";
import * as ThreadCanvasStore from "./ThreadCanvasStore.ts";

// A card keeps this many screenshots; older ones are deleted as new ones arrive.
const BROWSER_TRAIL_MAX_FRAMES = 60;
// A page is shot once it has settled after loading, and again while it stays open.
const SETTLE_MS = 1_500;
const REFRESH_MS = 30_000;
const TICK_MS = 1_000;

const decodeTrail = Schema.decodeUnknownOption(Schema.fromJsonString(ThreadCanvasBrowserTrail));
const encodeTrail = Schema.encodeEffect(Schema.fromJsonString(ThreadCanvasBrowserTrail));
const EMPTY_TRAIL: ThreadCanvasBrowserTrail = { frames: [] };

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** Whether a live browser card on the board shows this tab. */
export function hasBrowserCard(elements: ReadonlyArray<ThreadCanvasElement>, tabId: string) {
  return elements.some((element) => {
    if (element.isDeleted === true) return false;
    const card = recordOf(recordOf(element.customData).t3Card);
    const surface = recordOf(card.surface);
    return card.kind === "surface" && surface.kind === "preview" && surface.tabId === tabId;
  });
}

/** The trail with one more frame, and the frames that fell off its start. */
export function appendTrailFrame(
  trail: ThreadCanvasBrowserTrail,
  frame: ThreadCanvasBrowserTrailFrame,
  max = BROWSER_TRAIL_MAX_FRAMES,
) {
  const frames = [...trail.frames, frame];
  const cut = Math.max(0, frames.length - max);
  return { trail: { frames: frames.slice(cut) }, dropped: frames.slice(0, cut) };
}

const trailFile = Effect.fn("browserTrail.trailFile")(function* (threadId: string, tabId: string) {
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const key = NodeCrypto.createHash("sha256")
    .update(`${threadId}\0${tabId}`)
    .digest("hex")
    .slice(0, 40);
  return path.join(config.stateDir, "canvases", "trails", `${key}.json`);
});

/** The saved screenshots of a browser tab shown on a board, oldest first. */
export const readBrowserTrail = Effect.fn("browserTrail.read")(function* (
  threadId: string,
  tabId: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const file = yield* trailFile(threadId, tabId);
  const contents = yield* fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => null));
  if (contents === null) return EMPTY_TRAIL;
  return Option.getOrElse(decodeTrail(contents), () => EMPTY_TRAIL);
});

interface LiveTab {
  readonly threadId: ThreadId;
  readonly tabId: string;
  url: string;
  title: string;
  due: number | null;
  shotAt: number;
  lastHash: string | null;
}

/**
 * Keeps a trail of screenshots for every open browser tab that has a card on its thread's board,
 * so the card can replay what it showed once the tab is gone. Tabs without a card cost nothing
 * beyond a board read when they settle.
 */
export const followBrowserTrails = Effect.gen(function* () {
  const manager = yield* PreviewManager;
  const browser = yield* ServerBrowser.ServerBrowser;
  const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const live = new Map<string, LiveTab>();

  const save = Effect.fn("browserTrail.save")(function* (tab: LiveTab, jpeg: Buffer) {
    const attachmentId = createAttachmentId(tab.threadId, ".jpg");
    if (attachmentId === null) return;
    const attachment: ChatImageAttachment = {
      type: "image",
      id: attachmentId,
      name: "browser-trail.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    };
    const target = resolveAttachmentPath({ attachmentsDir: config.attachmentsDir, attachment });
    if (target === null) return;
    yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
    yield* fileSystem.writeFile(target, jpeg);
    const at = DateTime.formatIso(yield* DateTime.now);
    const { trail, dropped } = appendTrailFrame(yield* readBrowserTrail(tab.threadId, tab.tabId), {
      attachmentId,
      url: tab.url,
      title: tab.title,
      at,
    });
    const file = yield* trailFile(tab.threadId, tab.tabId);
    yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
    yield* fileSystem.writeFileString(`${file}.tmp`, yield* encodeTrail(trail));
    yield* fileSystem.rename(`${file}.tmp`, file);
    for (const frame of dropped) {
      const old = resolveAttachmentPathById({
        attachmentsDir: config.attachmentsDir,
        attachmentId: frame.attachmentId,
      });
      if (old !== null) yield* fileSystem.remove(old).pipe(Effect.ignore);
    }
  });

  const shoot = Effect.fn("browserTrail.shoot")(function* (tab: LiveTab) {
    const scene = yield* canvas.read(tab.threadId);
    if (!hasBrowserCard(scene.elements, tab.tabId)) return;
    const jpeg = yield* browser.captureStill({ threadId: tab.threadId, tabId: tab.tabId });
    if (jpeg === null) return;
    const hash = NodeCrypto.createHash("sha1").update(jpeg).digest("hex");
    // An unchanged page adds nothing to the trail.
    if (hash === tab.lastHash) return;
    tab.lastHash = hash;
    yield* save(tab, jpeg);
  });

  const onEvent = Effect.fn("browserTrail.onEvent")(function* (event: PreviewEvent) {
    const key = `${event.threadId}\0${event.tabId}`;
    if (event.type === "closed") {
      live.delete(key);
      return;
    }
    if (event.type !== "opened" && event.type !== "navigated") return;
    const status = event.snapshot.navStatus;
    if (status._tag !== "Success") return;
    const now = yield* Clock.currentTimeMillis;
    const tab = live.get(key) ?? {
      threadId: ThreadId.make(event.threadId),
      tabId: event.tabId,
      url: "",
      title: "",
      due: null,
      shotAt: now,
      lastHash: null,
    };
    tab.url = status.url;
    tab.title = status.title;
    tab.due = now + SETTLE_MS;
    live.set(key, tab);
  });

  const tick = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    for (const tab of live.values()) {
      const settled = tab.due !== null && tab.due <= now;
      if (!settled && (tab.due !== null || now - tab.shotAt < REFRESH_MS)) continue;
      tab.due = null;
      tab.shotAt = now;
      yield* shoot(tab).pipe(Effect.ignore);
    }
  });

  yield* Effect.forkScoped(Stream.runForEach(manager.events, onEvent));
  yield* Effect.forkScoped(tick.pipe(Effect.repeat(Schedule.spaced(TICK_MS))));
});
