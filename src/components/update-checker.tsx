"use client";

import { RiLoader4Line, RiRefreshLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpdaterEvent } from "@/types/electron";

type Status =
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export function UpdateChecker() {
  // window.updater exists only inside Electron; render nothing in a browser.
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [version, setVersion] = useState<string>();
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string>();
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.updater) return;
    setReady(true);
    return window.updater.onEvent((e: UpdaterEvent) => {
      switch (e.type) {
        case "available":
          setVersion(e.version);
          setHasUpdate(true);
          setStatus((s) => (s === "downloading" ? s : "available"));
          break;
        case "not-available":
          setStatus("not-available");
          break;
        case "progress":
          setStatus("downloading");
          setPercent(e.percent);
          break;
        case "downloaded":
          setVersion(e.version);
          setHasUpdate(true);
          setStatus("downloaded");
          break;
        case "error":
          setError(e.message);
          setStatus("error");
          break;
      }
    });
  }, []);

  if (!ready) return null;

  const check = () => {
    setError(undefined);
    setStatus("checking");
    setOpen(true);
    window.updater?.check();
  };

  const description = {
    checking: "Checking for updates…",
    available: `Version ${version} is available.`,
    "not-available": "You're on the latest version.",
    downloading: `Downloading update… ${percent}%`,
    downloaded: `Version ${version} is ready to install.`,
    error: error ?? "Update failed.",
  }[status];

  return (
    <>
      <ActionTooltip label="Check for updates">
        <Button
          variant="ghost"
          size="icon"
          onClick={check}
          className="relative"
        >
          <RiRefreshLine />
          {hasUpdate ? (
            <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" />
          ) : null}
        </Button>
      </ActionTooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Software update</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {status === "downloading" ? (
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}

          <DialogFooter>
            {status === "checking" || status === "downloading" ? (
              <Button disabled>
                <RiLoader4Line className="animate-spin" />
                {status === "checking" ? "Checking" : `${percent}%`}
              </Button>
            ) : status === "available" ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Later
                </Button>
                <Button onClick={() => window.updater?.download()}>
                  Download
                </Button>
              </>
            ) : status === "downloaded" ? (
              <Button onClick={() => window.updater?.install()}>
                Restart &amp; install
              </Button>
            ) : status === "error" ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={check}>Retry</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
