"use client";

import { RiLoader4Line } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ToolButton({
  label,
  icon,
  children,
  pending,
  onClick,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  pending: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onClick}
        >
          {pending ? <RiLoader4Line className="animate-spin" /> : icon}
          {children}
          {badge ? (
            <Badge variant="secondary" className="ml-0.5">
              {badge}
            </Badge>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
