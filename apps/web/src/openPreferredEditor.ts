import type { EditorId } from "@t3tools/contracts";

import { resolveAndPersistPreferredEditor } from "./editorPreferences";
import { readNativeApi } from "./nativeApi";

export async function openPathInPreferredEditor(input: {
  path: string;
  availableEditors: readonly EditorId[];
  failureTitle?: string;
}): Promise<void> {
  const api = readNativeApi();
  if (!api) {
    throw new Error(input.failureTitle ?? "Native API not found");
  }

  const editor = resolveAndPersistPreferredEditor(input.availableEditors);
  if (!editor) {
    throw new Error("No available editors found.");
  }

  await api.shell.openInEditor(input.path, editor);
}
