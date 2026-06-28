"use client";

import { CopyButton } from "@/components/copy-button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { highlightCode } from "@/lib/highlight";
import { INSTALL } from "./constants";

/** A single shell command, bash-highlighted, with a copy button. */
export function CmdLine({ cmd }: { cmd: string }) {
  return (
    <div className="bg-muted/40 flex items-center gap-2 rounded-md py-1 pr-1 pl-3">
      <code className="flex-1 overflow-x-auto font-mono text-[0.7rem] whitespace-nowrap">
        <span className="text-muted-foreground select-none">$ </span>
        <span
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism output of a static command string
          dangerouslySetInnerHTML={{ __html: highlightCode(cmd, "bash") }}
        />
      </code>
      <CopyButton text={cmd} label="command" />
    </div>
  );
}

/** Package-manager tabs for the `ws` install command. */
export function InstallTabs() {
  return (
    <Tabs defaultValue="npm" className="mt-2">
      <TabsList variant="line">
        {INSTALL.map((i) => (
          <TabsTrigger key={i.pm} value={i.pm}>
            {i.pm}
          </TabsTrigger>
        ))}
      </TabsList>
      {INSTALL.map((i) => (
        <TabsContent key={i.pm} value={i.pm} className="mt-2">
          <CmdLine cmd={i.cmd} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
