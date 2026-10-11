import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { PotetoModeSelection } from "./potetoMode";

interface PotetoModeState {
  selections: Record<string, PotetoModeSelection>;
  setSelection: (scope: string, selection: PotetoModeSelection | null) => void;
}

function readSelections(value: unknown): Record<string, PotetoModeSelection> {
  if (
    !value ||
    typeof value !== "object" ||
    !("selections" in value) ||
    !value.selections ||
    typeof value.selections !== "object"
  )
    return {};
  const selections: Record<string, PotetoModeSelection> = {};
  for (const [scope, candidate] of Object.entries(value.selections)) {
    if (!candidate || typeof candidate !== "object") continue;
    const { instanceId, path } = candidate as Record<string, unknown>;
    if (typeof instanceId !== "string" || !instanceId || typeof path !== "string" || !path)
      continue;
    selections[scope] = { instanceId, path };
  }
  return selections;
}

export function createPotetoModeStore(storage?: StateStorage) {
  return create<PotetoModeState>()(
    persist(
      (set) => ({
        selections: {},
        setSelection: (scope, selection) =>
          set((state) => {
            const selections = { ...state.selections };
            if (selection) selections[scope] = selection;
            else delete selections[scope];
            return { selections };
          }),
      }),
      {
        name: "t3:poteto-mode:v1",
        storage: createJSONStorage(() => storage ?? localStorage),
        partialize: (state) => ({ selections: state.selections }),
        merge: (persisted, current) => ({ ...current, selections: readSelections(persisted) }),
      },
    ),
  );
}

export const usePotetoModeStore = createPotetoModeStore();
