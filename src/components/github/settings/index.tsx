"use client";

import type { RealtimeStatus } from "@/hooks/use-realtime";
import { RelayStatus } from "./relay-status";
import { SetupSteps } from "./setup-steps";

export function Settings(props: {
  relayUrl: string;
  status: RealtimeStatus;
  repo: string;
  onSave: (url: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-xs">
      <RelayStatus {...props} />
      <SetupSteps />
    </div>
  );
}
