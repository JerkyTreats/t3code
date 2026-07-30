import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createMemoryStorage, type StateStorage } from "./lib/storage";
import {
  LEGACY_PROMPT_STASH_STORAGE_KEY,
  MAX_STASH_ENTRIES,
  MAX_STASH_ENTRY_ATTACHMENT_CHARS,
  MAX_STASH_IMAGE_DATA_URL_CHARS,
  PROMPT_STASH_STORAGE_KEY,
  convertLegacyPromptStash,
  migrateLegacyPromptStash,
  partitionStashAttachments,
  resetPromptStashStoreForTest,
  usePromptStashStore,
} from "./promptStashStore";

function attachment(id: string, chars: number) {
  return {
    id,
    name: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: chars,
    dataUrl: "x".repeat(chars),
  };
}

function legacyEntry(id: string, createdAt: string) {
  return {
    id,
    createdAt,
    prompt: id,
    attachments: [],
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "old-model" },
    droppedImageNames: [],
  };
}

function legacyEnvelope(queuesByScopeKey: Record<string, unknown[]>) {
  return JSON.stringify({
    version: 1,
    state: { queuesByScopeKey },
  });
}

function readSync(storage: StateStorage, key: string): string | null {
  const value = storage.getItem(key);
  if (value instanceof Promise) throw new Error("Expected synchronous storage");
  return value;
}

describe("prompt stash attachment budgets", () => {
  it("enforces the exact per-image and per-entry limits in draft order", () => {
    const first = attachment("first", MAX_STASH_IMAGE_DATA_URL_CHARS);
    const second = attachment("second", MAX_STASH_IMAGE_DATA_URL_CHARS);
    const third = attachment(
      "third",
      MAX_STASH_ENTRY_ATTACHMENT_CHARS - MAX_STASH_IMAGE_DATA_URL_CHARS * 2,
    );
    const tooLarge = attachment("too-large", MAX_STASH_IMAGE_DATA_URL_CHARS + 1);
    const overflow = attachment("overflow", 1);

    expect(partitionStashAttachments([first, second, third, tooLarge, overflow])).toEqual({
      kept: [first, second, third],
      droppedNames: ["too-large.png", "overflow.png"],
    });
  });
});

describe("prompt stash image finalization", () => {
  beforeEach(() => {
    resetPromptStashStoreForTest();
  });

  it("reports every image removed by a restore or delete race", () => {
    const store = usePromptStashStore.getState();
    usePromptStashStore.setState({
      entries: [
        {
          id: "racing-entry",
          createdAt: "2026-07-30T00:00:00.000Z",
          prompt: "restore while encoding",
          attachments: [],
          droppedImageNames: [],
          unreadableImageNames: [],
          pendingImageCount: 3,
        },
      ],
    });
    usePromptStashStore.setState({ entries: [] });

    expect(
      store.finalizeEntryImages("racing-entry", {
        attachments: [attachment("encoded", 20)],
        droppedImageNames: ["too-large.png"],
        unreadableImageNames: ["unreadable.png"],
      }),
    ).toEqual({
      status: "entry-missing",
      imageNames: ["encoded.png", "too-large.png", "unreadable.png"],
    });
  });
});

describe("prompt stash legacy migration", () => {
  it("orders valid dates first and deterministically de-duplicates ids", () => {
    const converted = convertLegacyPromptStash(
      legacyEnvelope({
        "provider:z": [
          legacyEntry("newest", "2026-07-20T00:00:00.000Z"),
          legacyEntry("duplicate", "2026-07-10T00:00:00.000Z"),
        ],
        "provider:a": [
          legacyEntry("duplicate", "2026-07-10T00:00:00.000Z"),
          legacyEntry("invalid", "not-a-date"),
        ],
      }),
    );

    expect(converted.map((entry) => entry.id)).toEqual(["newest", "duplicate", "invalid"]);
    expect(converted.every((entry) => !("providerInstanceId" in entry))).toBe(true);
    expect(converted.every((entry) => !("modelSelection" in entry))).toBe(true);
  });

  it("caps the merged legacy queue at the global entry limit", () => {
    const entries = Array.from({ length: MAX_STASH_ENTRIES + 5 }, (_, index) =>
      legacyEntry(`entry-${index}`, new Date(1_800_000_000_000 - index).toISOString()),
    );
    expect(convertLegacyPromptStash(legacyEnvelope({ "provider:codex": entries }))).toHaveLength(
      MAX_STASH_ENTRIES,
    );
  });

  it("repairs an interrupted migration without duplicating the migrated prefix", () => {
    const storage = createMemoryStorage();
    const legacy = legacyEnvelope({
      "provider:codex": [
        legacyEntry("first", "2026-07-20T00:00:00.000Z"),
        legacyEntry("second", "2026-07-19T00:00:00.000Z"),
      ],
    });
    storage.setItem(LEGACY_PROMPT_STASH_STORAGE_KEY, legacy);
    storage.setItem(
      PROMPT_STASH_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          entries: [
            {
              id: "first",
              createdAt: "2026-07-20T00:00:00.000Z",
              prompt: "first",
              attachments: [],
              droppedImageNames: [],
            },
          ],
        },
      }),
    );

    expect(migrateLegacyPromptStash(storage, true)?.map((entry) => entry.id)).toEqual([
      "first",
      "second",
    ]);
    expect(readSync(storage, LEGACY_PROMPT_STASH_STORAGE_KEY)).toBeNull();
  });

  it("retains the complete legacy payload when the replacement write fails", () => {
    const base = createMemoryStorage();
    const legacy = legacyEnvelope({
      "provider:codex": [legacyEntry("keep", "2026-07-20T00:00:00.000Z")],
    });
    base.setItem(LEGACY_PROMPT_STASH_STORAGE_KEY, legacy);
    const storage: StateStorage = {
      getItem: base.getItem,
      removeItem: base.removeItem,
      setItem: (key, value) => {
        if (key === PROMPT_STASH_STORAGE_KEY) throw new Error("quota");
        base.setItem(key, value);
      },
    };

    expect(migrateLegacyPromptStash(storage, true)).toBeNull();
    expect(readSync(base, LEGACY_PROMPT_STASH_STORAGE_KEY)).toBe(legacy);
  });
});
