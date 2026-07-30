export function closeComposerStashMenu(input: {
  readonly isOpen: boolean;
  readonly markClosed: () => void;
  readonly restoreFocus: () => void;
}): boolean {
  if (!input.isOpen) return false;
  input.markClosed();
  input.restoreFocus();
  return true;
}
