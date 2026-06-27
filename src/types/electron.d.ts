export type UpdaterEvent =
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

declare global {
  interface Window {
    // Present only inside the Electron shell (preload.cjs). Undefined in a browser.
    updater?: {
      check: () => Promise<void>;
      download: () => Promise<void>;
      install: () => Promise<void>;
      onEvent: (cb: (e: UpdaterEvent) => void) => () => void;
    };
  }
}
