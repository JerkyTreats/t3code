const TURN_STORAGE_PREFIX = "t3code:demo:turn-board:";

/** Where a board keeps this browser's copy of its scene, by the board's storage id. */
export function boardStorageKey(storageId: string): string {
  return `${TURN_STORAGE_PREFIX}${storageId}`;
}

// Kept apart from the board, which loads lazily, so the sidebar can forget one without loading it.
const deletedBoards = new Set<string>();

/**
 * Forgets a deleted Workspace Canvas's board in this browser: its local copy goes, and a save
 * still pending from its last edit is dropped instead of reaching a server that refuses it.
 */
export function forgetDeletedBoard(storageId: string): void {
  deletedBoards.add(storageId);
  try {
    localStorage.removeItem(boardStorageKey(storageId));
  } catch {
    // Storage can be unavailable; there is then no copy to clear.
  }
}

export function isDeletedBoard(storageId: string): boolean {
  return deletedBoards.has(storageId);
}
