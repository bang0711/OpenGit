import { RiGitBranchLine, RiPriceTag3Line } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RefBadge({ refName }: { refName: string }) {
  const isTag = refName.startsWith("tag: ");
  const isHead = refName.startsWith("HEAD ->") || refName === "HEAD";
  const label = refName.replace(/^tag: /, "").replace(/^HEAD -> /, "");

  return (
    <Badge
      variant={isHead ? "default" : "secondary"}
      className={cn(
        "gap-0.5 px-1 py-px font-medium",
        isTag &&
          "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400",
      )}
    >
      {isTag ? (
        <RiPriceTag3Line className="size-2.5" />
      ) : (
        <RiGitBranchLine className="size-2.5" />
      )}
      {label}
    </Badge>
  );
}
