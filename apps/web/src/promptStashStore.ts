import * as Schema from "effect/Schema";
import { create } from "zustand";

import {
  PersistedComposerImageAttachment,
  type PersistedComposerImageAttachment as PersistedComposerImageAttachmentType,
} from "./composerDraftStore";
import { createMemoryStorage, type StateStorage } from "./lib/storage";
import {
  MAX_STASH_ENTRIES,
  MAX_STASH_ENTRY_ATTACHMENT_CHARS,
  MAX_STASH_IMAGE_DATA_URL_CHARS,
} from "./promptStashPolicy";

export {
  MAX_STASH_ENTRIES,
  MAX_STASH_ENTRY_ATTACHMENT_CHARS,
  MAX_STASH_IMAGE_DATA_URL_CHARS,
} from "./promptStashPolicy";

export const PROMPT_STASH_STORAGE_KEY = "t3code:prompt-stash:v2";
export const LEGACY_PROMPT_STASH_STORAGE_KEY = "t3code:prompt-stash:v1";
const PROMPT_STASH_STORAGE_VERSION = 2;

const PromptStashEntrySchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  prompt: Schema.String,
  attachments: Schema.Array(PersistedComposerImageAttachment),
  droppedImageNames: Schema.Array(Schema.String),
  unreadableImageNames: Schema.optionalKey(Schema.Array(Schema.String)),
  pendingImageCount: Schema.optionalKey(Schema.Number),
});
export type PromptStashEntry = typeof PromptStashEntrySchema.Type;

const PromptStashStateSchema = Schema.Struct({
  entries: Schema.Array(PromptStashEntrySchema),
});

const PromptStashEnvelopeSchema = Schema.Struct({
  version: Schema.Number,
  state: PromptStashStateSchema,
});

const LegacyPromptStashEntrySchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  prompt: Schema.String,
  attachments: Schema.Array(PersistedComposerImageAttachment),
  providerInstanceId: Schema.optionalKey(Schema.Unknown),
  modelSelection: Schema.optionalKey(Schema.Unknown),
  droppedImageNames: Schema.Array(Schema.String),
  unreadableImageNames: Schema.optionalKey(Schema.Array(Schema.String)),
  pendingImageCount: Schema.optionalKey(Schema.Number),
});

const LegacyPromptStashEnvelopeSchema = Schema.Struct({
  version: Schema.Number,
  state: Schema.Struct({
    queuesByScopeKey: Schema.Record(Schema.String, Schema.Array(LegacyPromptStashEntrySchema)),
  }),
});

const decodePromptStashEnvelope = Schema.decodeUnknownSync(PromptStashEnvelopeSchema);
const decodeLegacyPromptStashEnvelope = Schema.decodeUnknownSync(LegacyPromptStashEnvelopeSchema);

function settlePendingImages(entry: PromptStashEntry): PromptStashEntry {
  const pendingImageCount = Math.max(0, Math.trunc(entry.pendingImageCount ?? 0));
  if (pendingImageCount === 0) {
    return entry;
  }
  return {
    ...entry,
    pendingImageCount: 0,
    unreadableImageNames: [
      ...(entry.unreadableImageNames ?? []),
      ...Array.from(
        { length: pendingImageCount },
        (_, index) => `image ${index + 1} not saved before reload`,
      ),
    ],
  };
}

export function partitionStashAttachments(
  attachments: ReadonlyArray<PersistedComposerImageAttachmentType>,
): {
  kept: PersistedComposerImageAttachmentType[];
  droppedNames: string[];
} {
  const kept: PersistedComposerImageAttachmentType[] = [];
  const droppedNames: string[] = [];
  let usedChars = 0;
  for (const attachment of attachments) {
    const attachmentFits =
      attachment.dataUrl.length <= MAX_STASH_IMAGE_DATA_URL_CHARS &&
      usedChars + attachment.dataUrl.length <= MAX_STASH_ENTRY_ATTACHMENT_CHARS;
    if (!attachmentFits) {
      droppedNames.push(attachment.name);
      continue;
    }
    kept.push(attachment);
    usedChars += attachment.dataUrl.length;
  }
  return { kept, droppedNames };
}

function normalizeEntryAttachments(entry: PromptStashEntry): PromptStashEntry {
  const partition = partitionStashAttachments(entry.attachments);
  if (partition.droppedNames.length === 0) {
    return entry;
  }
  return {
    ...entry,
    attachments: partition.kept,
    droppedImageNames: [...entry.droppedImageNames, ...partition.droppedNames],
  };
}

function decodeCurrentEntries(raw: string): PromptStashEntry[] {
  const decoded = decodePromptStashEnvelope(JSON.parse(raw));
  if (decoded.version !== PROMPT_STASH_STORAGE_VERSION) {
    throw new Error("Unsupported prompt stash version");
  }
  return decoded.state.entries
    .slice(0, MAX_STASH_ENTRIES)
    .map(settlePendingImages)
    .map(normalizeEntryAttachments);
}

interface OrderedLegacyEntry {
  readonly scopeKey: string;
  readonly queueIndex: number;
  readonly entry: PromptStashEntry;
  readonly timestamp: number | null;
}

function legacyEntryOrder(left: OrderedLegacyEntry, right: OrderedLegacyEntry): number {
  if (left.timestamp !== null && right.timestamp === null) return -1;
  if (left.timestamp === null && right.timestamp !== null) return 1;
  if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
    return right.timestamp - left.timestamp;
  }
  const scopeOrder = left.scopeKey.localeCompare(right.scopeKey);
  if (scopeOrder !== 0) return scopeOrder;
  if (left.queueIndex !== right.queueIndex) return left.queueIndex - right.queueIndex;
  return left.entry.id.localeCompare(right.entry.id);
}

export function convertLegacyPromptStash(raw: string): PromptStashEntry[] {
  const decoded = decodeLegacyPromptStashEnvelope(JSON.parse(raw));
  const ordered = Object.entries(decoded.state.queuesByScopeKey)
    .flatMap(([scopeKey, queue]) =>
      queue.map(
        (legacyEntry, queueIndex): OrderedLegacyEntry => ({
          scopeKey,
          queueIndex,
          timestamp: Number.isFinite(Date.parse(legacyEntry.createdAt))
            ? Date.parse(legacyEntry.createdAt)
            : null,
          entry: normalizeEntryAttachments({
            id: legacyEntry.id,
            createdAt: legacyEntry.createdAt,
            prompt: legacyEntry.prompt,
            attachments: [...legacyEntry.attachments],
            droppedImageNames: [...legacyEntry.droppedImageNames],
            ...(legacyEntry.unreadableImageNames
              ? { unreadableImageNames: [...legacyEntry.unreadableImageNames] }
              : {}),
            ...(legacyEntry.pendingImageCount !== undefined
              ? { pendingImageCount: legacyEntry.pendingImageCount }
              : {}),
          }),
        }),
      ),
    )
    .sort(legacyEntryOrder);

  const seenIds = new Set<string>();
  const entries: PromptStashEntry[] = [];
  for (const candidate of ordered) {
    if (seenIds.has(candidate.entry.id)) continue;
    seenIds.add(candidate.entry.id);
    entries.push(settlePendingImages(candidate.entry));
    if (entries.length === MAX_STASH_ENTRIES) break;
  }
  return entries;
}

function serializeEntries(entries: ReadonlyArray<PromptStashEntry>): string {
  return JSON.stringify({
    version: PROMPT_STASH_STORAGE_VERSION,
    state: { entries },
  });
}

function readStorageItem(storage: StateStorage, key: string): string | null {
  const value = storage.getItem(key);
  if (value instanceof Promise) {
    throw new Error("Prompt stash storage must be synchronous");
  }
  return value;
}

function writeAndVerifyEntries(
  storage: StateStorage,
  entries: ReadonlyArray<PromptStashEntry>,
): boolean {
  const serialized = serializeEntries(entries);
  try {
    storage.setItem(PROMPT_STASH_STORAGE_KEY, serialized);
    const persisted = readStorageItem(storage, PROMPT_STASH_STORAGE_KEY);
    if (typeof persisted !== "string") return false;
    decodeCurrentEntries(persisted);
    return persisted === serialized;
  } catch {
    return false;
  }
}

export function migrateLegacyPromptStash(
  storage: StateStorage,
  durable: boolean,
): PromptStashEntry[] | null {
  if (!durable) return null;
  let legacyRaw: string | null;
  let currentRaw: string | null;
  try {
    legacyRaw = readStorageItem(storage, LEGACY_PROMPT_STASH_STORAGE_KEY);
    currentRaw = readStorageItem(storage, PROMPT_STASH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!legacyRaw) return null;

  try {
    const legacyEntries = convertLegacyPromptStash(legacyRaw);
    const currentEntries = currentRaw ? decodeCurrentEntries(currentRaw) : [];
    const seenIds = new Set(currentEntries.map((entry) => entry.id));
    const entries = [...currentEntries];
    for (const legacyEntry of legacyEntries) {
      if (seenIds.has(legacyEntry.id)) continue;
      seenIds.add(legacyEntry.id);
      entries.push(legacyEntry);
      if (entries.length === MAX_STASH_ENTRIES) break;
    }
    if (!writeAndVerifyEntries(storage, entries)) {
      return null;
    }
    storage.removeItem(LEGACY_PROMPT_STASH_STORAGE_KEY);
    return entries;
  } catch {
    return null;
  }
}

function resolveBaseStorage(): { storage: StateStorage; durable: boolean } {
  try {
    if (typeof localStorage !== "undefined") {
      return { storage: localStorage, durable: true };
    }
  } catch {
    // A sandboxed renderer can reject access to the localStorage property.
  }
  return { storage: createMemoryStorage(), durable: false };
}

const baseStorage = resolveBaseStorage();

function readInitialEntries(): PromptStashEntry[] {
  const migrated = migrateLegacyPromptStash(baseStorage.storage, baseStorage.durable);
  if (migrated) return migrated;
  try {
    const raw = readStorageItem(baseStorage.storage, PROMPT_STASH_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? decodeCurrentEntries(raw) : [];
  } catch {
    return [];
  }
}

interface PromptStashStoreState {
  readonly entries: ReadonlyArray<PromptStashEntry>;
  readonly stashEntry: (entry: PromptStashEntry) => {
    readonly evicted: PromptStashEntry | null;
    readonly durable: boolean;
  };
  readonly takeEntry: (entryId: string) => {
    readonly entry: PromptStashEntry | null;
    readonly durable: boolean;
  };
  readonly finalizeEntryImages: (
    entryId: string,
    images: {
      readonly attachments: ReadonlyArray<PersistedComposerImageAttachmentType>;
      readonly droppedImageNames: ReadonlyArray<string>;
      readonly unreadableImageNames: ReadonlyArray<string>;
    },
  ) => PromptStashImageFinalization;
}

export type PromptStashImageFinalization =
  | { readonly status: "saved" }
  | { readonly status: "entry-missing"; readonly imageNames: ReadonlyArray<string> }
  | { readonly status: "images-dropped"; readonly imageNames: ReadonlyArray<string> }
  | { readonly status: "persistence-failed"; readonly imageNames: ReadonlyArray<string> };

interface FinalizePromptStashEntryImagesInput {
  readonly entries: ReadonlyArray<PromptStashEntry>;
  readonly entryId: string;
  readonly images: {
    readonly attachments: ReadonlyArray<PersistedComposerImageAttachmentType>;
    readonly droppedImageNames: ReadonlyArray<string>;
    readonly unreadableImageNames: ReadonlyArray<string>;
  };
  readonly persist: (entries: ReadonlyArray<PromptStashEntry>) => boolean;
}

export interface FinalizePromptStashEntryImagesResult {
  readonly finalization: PromptStashImageFinalization;
  readonly entries: ReadonlyArray<PromptStashEntry> | null;
}

export function finalizePromptStashEntryImages(
  input: FinalizePromptStashEntryImagesInput,
): FinalizePromptStashEntryImagesResult {
  const allImageNames = [
    ...input.images.attachments.map((attachment) => attachment.name),
    ...input.images.droppedImageNames,
    ...input.images.unreadableImageNames,
  ];
  const index = input.entries.findIndex((candidate) => candidate.id === input.entryId);
  if (index < 0) {
    return {
      finalization: { status: "entry-missing", imageNames: allImageNames },
      entries: null,
    };
  }
  const partition = partitionStashAttachments(input.images.attachments);
  const droppedImageNames = [
    ...input.images.droppedImageNames,
    ...input.images.unreadableImageNames,
    ...partition.droppedNames,
  ];
  const nextEntries = [...input.entries];
  const existing = nextEntries[index];
  if (!existing) {
    return {
      finalization: { status: "entry-missing", imageNames: allImageNames },
      entries: null,
    };
  }
  nextEntries[index] = {
    ...existing,
    attachments: partition.kept,
    droppedImageNames: [...input.images.droppedImageNames, ...partition.droppedNames],
    unreadableImageNames: [...input.images.unreadableImageNames],
    pendingImageCount: 0,
  };
  if (input.persist(nextEntries)) {
    return {
      finalization:
        droppedImageNames.length > 0
          ? { status: "images-dropped", imageNames: droppedImageNames }
          : { status: "saved" },
      entries: nextEntries,
    };
  }

  const fallbackEntries = [...input.entries];
  fallbackEntries[index] = {
    ...existing,
    attachments: [],
    droppedImageNames: [
      ...input.images.droppedImageNames,
      ...input.images.attachments.map((attachment) => attachment.name),
    ],
    unreadableImageNames: [...input.images.unreadableImageNames],
    pendingImageCount: 0,
  };
  if (input.persist(fallbackEntries)) {
    return {
      finalization: { status: "images-dropped", imageNames: allImageNames },
      entries: fallbackEntries,
    };
  }
  return {
    finalization: { status: "persistence-failed", imageNames: allImageNames },
    entries: null,
  };
}

export const usePromptStashStore = create<PromptStashStoreState>()((set, get) => ({
  entries: readInitialEntries(),
  stashEntry: (entry) => {
    const nextEntries = [normalizeEntryAttachments(entry), ...get().entries];
    const evicted = nextEntries.length > MAX_STASH_ENTRIES ? (nextEntries.pop() ?? null) : null;
    if (!baseStorage.durable || !writeAndVerifyEntries(baseStorage.storage, nextEntries)) {
      return { evicted: null, durable: false };
    }
    set({ entries: nextEntries });
    return { evicted, durable: true };
  },
  takeEntry: (entryId) => {
    const entry = get().entries.find((candidate) => candidate.id === entryId) ?? null;
    if (!entry) return { entry: null, durable: true };
    const nextEntries = get().entries.filter((candidate) => candidate.id !== entryId);
    if (!baseStorage.durable || !writeAndVerifyEntries(baseStorage.storage, nextEntries)) {
      return { entry: null, durable: false };
    }
    set({ entries: nextEntries });
    return { entry, durable: true };
  },
  finalizeEntryImages: (entryId, images) => {
    const result = finalizePromptStashEntryImages({
      entries: get().entries,
      entryId,
      images,
      persist: (entries) =>
        baseStorage.durable && writeAndVerifyEntries(baseStorage.storage, entries),
    });
    if (result.entries) set({ entries: result.entries });
    return result.finalization;
  },
}));

export function resetPromptStashStoreForTest(raw = ""): void {
  if (raw.length === 0) {
    baseStorage.storage.removeItem(PROMPT_STASH_STORAGE_KEY);
    baseStorage.storage.removeItem(LEGACY_PROMPT_STASH_STORAGE_KEY);
  } else {
    baseStorage.storage.setItem(PROMPT_STASH_STORAGE_KEY, raw);
  }
  usePromptStashStore.setState({ entries: readInitialEntries() });
}
