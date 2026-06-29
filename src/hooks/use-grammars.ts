import { useSyncExternalStore } from "react";
import { getGrammarsReady, subscribeGrammars } from "@/lib/highlight";

// True once the lazy Prism grammar chunk has loaded. Reading this re-renders the
// component when grammars arrive, so highlighted code upgrades from plain text.
export function useGrammarsReady(): boolean {
  return useSyncExternalStore(
    subscribeGrammars,
    getGrammarsReady,
    getGrammarsReady,
  );
}
