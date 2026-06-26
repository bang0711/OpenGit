"use client";

import { RiLayoutColumnLine, RiLayoutRowLine } from "@remixicon/react";
import type { View } from "./index";
import { ToggleButton } from "./toggle-button";

export function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border font-sans">
      <ToggleButton
        active={view === "split"}
        onClick={() => onChange("split")}
        title="Side-by-side"
      >
        <RiLayoutColumnLine /> Split
      </ToggleButton>
      <ToggleButton
        active={view === "unified"}
        onClick={() => onChange("unified")}
        title="Unified (stage by hunk)"
      >
        <RiLayoutRowLine /> Unified
      </ToggleButton>
    </div>
  );
}
