"use client";

import {
  RiComputerLine,
  RiMoonLine,
  RiSunLine,
} from "@remixicon/react";
import { useState } from "react";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <RiSunLine /> },
  { value: "dark", label: "Dark", icon: <RiMoonLine /> },
  { value: "system", label: "System", icon: <RiComputerLine /> },
];

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const choose = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <DropdownMenu>
      <ActionTooltip label="Theme">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            {theme === "light" ? (
              <RiSunLine />
            ) : theme === "dark" ? (
              <RiMoonLine />
            ) : (
              <RiComputerLine />
            )}
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={theme === o.value}
            onSelect={() => choose(o.value)}
          >
            <span className="mr-2 [&_svg]:size-4">{o.icon}</span>
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
