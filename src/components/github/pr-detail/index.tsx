"use client";

import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiChat3Line,
  RiFileList2Line,
} from "@remixicon/react";
import type { MergeMethod, PullRequestDetail } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notify } from "@/lib/notify";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PrDetailSkeleton } from "../skeletons";
import { StateBadge } from "../status";
import { ActionBar } from "./action-bar";
import { Avatar } from "./avatar";
import { Conversation } from "./conversation";
import { FilesChanged } from "./files";

type Tab = "conversation" | "files";

export function PrDetail({
  number,
  refreshKey,
  onBack,
  onChanged,
}: {
  number: number;
  refreshKey?: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<MergeMethod>("merge");
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<Tab>("conversation");
  // Cache loaded PRs so re-visiting one is instant (persists while the detail
  // pane stays mounted — i.e. while clicking through the list).
  const cache = useRef(new Map<number, PullRequestDetail>());

  const load = async () => {
    const r = await window.github.getPR(number);
    if ("error" in r) setError(r.error);
    else {
      cache.current.set(number, r);
      setPr(r);
      setError(undefined);
    }
  };

  // On PR switch: show the cached detail instantly (or skeleton if unseen),
  // then refresh in the background. No stale PR flashes in.
  useEffect(() => {
    setError(undefined);
    setPr(cache.current.get(number) ?? null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number]);

  // refreshKey bump (parent Refresh / reload) → silent background refresh of the
  // open PR, keeping it on screen.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const run = (
    fn: () => Promise<{ error?: string }>,
    success: string,
    after: "reload" | "back",
  ) => {
    if (busy) return;
    setBusy(true);
    fn().then((res) => {
      setBusy(false);
      notify(res, success);
      if (res?.error) return;
      onChanged();
      if (after === "back") onBack();
      else {
        setComment("");
        load();
      }
    });
  };

  if (error)
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <RiArrowLeftLine /> Back
        </Button>
        <p className="text-destructive mt-3 text-xs">{error}</p>
      </div>
    );

  if (!pr) return <PrDetailSkeleton />;

  const closed = pr.state === "closed" || pr.merged;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="border-border bg-card shrink-0 border-b">
        <div className="flex items-start gap-3 px-4 pt-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <RiArrowLeftLine />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              {pr.title}{" "}
              <span className="text-muted-foreground font-normal">
                #{pr.number}
              </span>
            </h2>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem]">
              <span className="flex items-center gap-1">
                <Avatar url={pr.author?.avatarUrl} />
                {pr.author?.login ?? "unknown"}
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-muted rounded px-1 font-mono">{pr.head}</span>
                <RiArrowRightLine className="size-3" />
                <span className="bg-muted rounded px-1 font-mono">{pr.base}</span>
              </span>
              <span>updated {timeAgo(pr.updatedAt)}</span>
            </div>
          </div>
          <StateBadge pr={pr} />
        </div>

        {/* tabs */}
        <div className="mt-2 flex items-center gap-1 px-4">
          <TabPill
            active={tab === "conversation"}
            onClick={() => setTab("conversation")}
            icon={<RiChat3Line className="size-3.5" />}
          >
            Conversation
          </TabPill>
          <TabPill
            active={tab === "files"}
            onClick={() => setTab("files")}
            icon={<RiFileList2Line className="size-3.5" />}
          >
            Files Changed
            <span className="bg-muted ml-1 rounded-full px-1.5 text-[0.625rem] font-semibold">
              {pr.files.length}
            </span>
          </TabPill>
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1">
        {tab === "conversation" ? (
          <ScrollArea className="h-full">
            <Conversation pr={pr} />
          </ScrollArea>
        ) : (
          <FilesChanged files={pr.files} base={pr.base} head={pr.head} />
        )}
      </div>

      {!closed ? (
        <ActionBar
          number={number}
          busy={busy}
          comment={comment}
          setComment={setComment}
          method={method}
          setMethod={setMethod}
          run={run}
        />
      ) : null}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
