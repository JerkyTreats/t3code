export type ComposerStashMenuKeyAction =
  | { readonly kind: "close" }
  | { readonly kind: "delete" }
  | { readonly kind: "move"; readonly offset: -1 | 1 }
  | { readonly kind: "restore" }
  | null;

export function resolveComposerStashMenuKeyAction(input: {
  readonly key: string;
  readonly hasEntries: boolean;
}): ComposerStashMenuKeyAction {
  if (input.key === "Escape") return { kind: "close" };
  if (!input.hasEntries) return null;
  if (input.key === "ArrowDown") return { kind: "move", offset: 1 };
  if (input.key === "ArrowUp") return { kind: "move", offset: -1 };
  if (input.key === "Enter") return { kind: "restore" };
  if (input.key === "Delete") return { kind: "delete" };
  return null;
}
