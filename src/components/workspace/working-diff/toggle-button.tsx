"use client";

import { cn } from "@/lib/utils";

export function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 text-[0.625rem] font-medium [&_svg]:size-3",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}
