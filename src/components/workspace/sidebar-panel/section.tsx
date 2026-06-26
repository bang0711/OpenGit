"use client";

import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { usePersistedState } from "@/hooks/use-persisted-state";

export function Section({
  icon,
  label,
  count,
  defaultOpen = false,
  action,
  contextActions,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  contextActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = usePersistedState(
    `opengit.section:${label}`,
    defaultOpen,
  );
  const header = (
    <div className="group/section flex items-center gap-0.5">
      <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-sidebar-foreground/90 hover:bg-sidebar-accent">
        {open ? (
          <RiArrowDownSLine className="size-3.5 text-muted-foreground" />
        ) : (
          <RiArrowRightSLine className="size-3.5 text-muted-foreground" />
        )}
        <span className="[&_svg]:size-3.5 [&_svg]:text-muted-foreground">
          {icon}
        </span>
        {label}
        <Badge variant="secondary" className="ml-auto font-normal">
          {count}
        </Badge>
      </CollapsibleTrigger>
      {action ? (
        <span className="shrink-0 opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          {action}
        </span>
      ) : null}
    </div>
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {contextActions ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {contextActions}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        header
      )}
      <CollapsibleContent className="mt-0.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}
