// Terminal preferences, persisted in localStorage, with a tiny pub/sub so any
// component (or the bridge) can read/react. `syncUI` gates two behaviours:
// repo-change toasts and echoing UI-triggered git commands into the terminal.
import { useSyncExternalStore } from "react";

export type TabPosition = "top" | "bottom" | "left" | "right";
export type TerminalSettings = { tabPosition: TabPosition; syncUI: boolean };

const KEY = "opengit.terminalSettings";
const DEFAULTS: TerminalSettings = { tabPosition: "top", syncUI: false };

function load(): TerminalSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();
const subs = new Set<() => void>();

export function getTerminalSettings(): TerminalSettings {
  return current;
}
export function getSyncUI(): boolean {
  return current.syncUI;
}
export function setTerminalSettings(patch: Partial<TerminalSettings>) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  subs.forEach((cb) => cb());
}
export function subscribeTerminalSettings(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function useTerminalSettings(): TerminalSettings {
  return useSyncExternalStore(
    subscribeTerminalSettings,
    getTerminalSettings,
    getTerminalSettings,
  );
}
