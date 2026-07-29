import { useSyncExternalStore } from "react";

const SETTLEMENT_CLOCK_INTERVAL_MS = 30_000;
const listeners = new Set<() => void>();
let now = new Date().toISOString();
let interval: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === null) {
    interval = window.setInterval(() => {
      now = new Date().toISOString();
      for (const notify of listeners) notify();
    }, SETTLEMENT_CLOCK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      window.clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot(): string {
  return now;
}

export function useSettlementNow(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
