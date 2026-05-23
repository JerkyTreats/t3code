import { create } from "zustand";

interface CommandPaletteState {
  open: boolean;
  query: string;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (query: string) => void;
  resetQuery: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  query: "",
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false, query: "" }),
  togglePalette: () =>
    set((state) => ({
      open: !state.open,
      query: state.open ? "" : state.query,
    })),
  setQuery: (query) => set({ query }),
  resetQuery: () => set({ query: "" }),
}));
