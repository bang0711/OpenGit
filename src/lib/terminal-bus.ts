// Channel between UI actions and the terminal's command log. The TerminalPanel
// registers a sink; `echoCommand` forwards a UI-triggered git command to it (the
// panel appends it to the active session's log, which React owns — so it
// persists across session switches, unlike text painted into the live shell).
// No-op unless the "Sync with UI" setting is on.
import { getSyncUI } from "@/lib/terminal-settings";

type Sink = (cmd: string) => void;
let sink: Sink | null = null;

export function setEchoSink(s: Sink | null) {
  sink = s;
}

export function echoCommand(cmd: string) {
  if (!cmd || !sink || !getSyncUI()) return;
  sink(cmd);
}
