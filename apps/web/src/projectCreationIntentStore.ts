import { create } from "zustand";

export type ProjectCreationIntent = "addLocalProject" | "cloneRemoteProject" | "pickFolder";

interface ProjectCreationIntentState {
  intent: ProjectCreationIntent | null;
  intentId: number;
  requestAddLocalProject: () => void;
  requestCloneRemoteProject: () => void;
  requestPickFolder: () => void;
  clearIntent: (intentId: number) => void;
}

function nextIntent(
  intent: ProjectCreationIntent,
): (state: ProjectCreationIntentState) => Pick<ProjectCreationIntentState, "intent" | "intentId"> {
  return (state) => ({
    intent,
    intentId: state.intentId + 1,
  });
}

export const useProjectCreationIntentStore = create<ProjectCreationIntentState>()((set) => ({
  intent: null,
  intentId: 0,
  requestAddLocalProject: () => set(nextIntent("addLocalProject")),
  requestCloneRemoteProject: () => set(nextIntent("cloneRemoteProject")),
  requestPickFolder: () => set(nextIntent("pickFolder")),
  clearIntent: (intentId) => set((state) => (state.intentId === intentId ? { intent: null } : {})),
}));
