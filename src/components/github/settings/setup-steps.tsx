"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import { CopyButton } from "@/components/copy-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { highlightCode } from "@/lib/highlight";
import { CmdLine, InstallTabs } from "./cmd-line";
import { RELAY_CODE } from "./constants";

export function SetupSteps() {
  return (
    <section className="border-border space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Set it up</h2>
      <ol className="space-y-4">
        <Step n={1} title="Save the relay server code">
          Create a file named{" "}
          <code className="bg-muted rounded px-1">server.mjs</code> and paste this
          in:
          <Collapsible className="mt-2">
            <div className="flex items-center gap-1">
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 [&[data-state=open]_svg]:rotate-180">
                <RiArrowDownSLine className="size-3.5 transition-transform" />
                Show server.mjs
              </CollapsibleTrigger>
              <CopyButton text={RELAY_CODE} label="server.mjs" />
            </div>
            <CollapsibleContent>
              <ScrollArea className="bg-muted/40 mt-2 h-72 rounded-md">
                <pre className="p-3 font-mono text-[0.7rem] leading-relaxed">
                  <code
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism output of a static constant
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(RELAY_CODE, "javascript"),
                    }}
                  />
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </Step>

        <Step n={2} title="Install the dependency">
          In that folder, install the one package it needs:
          <InstallTabs />
        </Step>

        <Step n={3} title="Run it on a public HTTPS URL">
          Start it with a secret of your choice (remember it for step 4):
          <CmdLine cmd="WEBHOOK_SECRET=your-secret node server.mjs" />
          <span className="mt-1.5 block">
            It must be reachable from the internet — deploy to a host (Fly.io,
            Render, a VPS) or, for a quick test, expose your local port with a
            tunnel like <code className="bg-muted rounded px-1">cloudflared</code>{" "}
            or <code className="bg-muted rounded px-1">ngrok</code>. Note the
            public URL, e.g.{" "}
            <code className="bg-muted rounded px-1">https://your-relay.com</code>.
          </span>
        </Step>

        <Step n={4} title="Add the webhook on GitHub">
          On the repo: <b>Settings → Webhooks → Add webhook</b>, then set:
          <ul className="mt-1.5 space-y-1">
            <Field label="Payload URL">
              your public URL +{" "}
              <code className="bg-muted rounded px-1">/github</code> (e.g.{" "}
              <code className="bg-muted rounded px-1">https://your-relay.com/github</code>)
            </Field>
            <Field label="Content type">
              <code className="bg-muted rounded px-1">application/json</code>
            </Field>
            <Field label="Secret">
              the same{" "}
              <code className="bg-muted rounded px-1">WEBHOOK_SECRET</code> from
              step 3
            </Field>
            <Field label="Events">
              choose “Let me select…” → tick <b>Pull requests</b> and{" "}
              <b>Issues</b>
            </Field>
          </ul>
        </Step>

        <Step n={5} title="Connect OpenGit">
          Paste your public URL (e.g.{" "}
          <code className="bg-muted rounded px-1">https://your-relay.com</code>)
          into the <b>Relay URL</b> field above and press Save. The status turns{" "}
          <span className="font-medium text-[#3fb950]">Live</span> and the PR list
          updates the instant a webhook fires.
        </Step>
      </ol>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2">
      <span className="text-foreground w-24 shrink-0 font-medium">{label}</span>
      <span className="text-muted-foreground flex-1">{children}</span>
    </li>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold">
        {n}
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">
        <span className="text-foreground font-medium">{title}.</span>{" "}
        <span className="text-muted-foreground">{children}</span>
      </div>
    </li>
  );
}
