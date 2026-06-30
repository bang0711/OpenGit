import { RiDownloadCloud2Line, RiLoader4Line } from "@remixicon/react";
import { useEffect, useState } from "react";
import type { UpdaterEvent } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Status =
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "launched"
  | "error";

export function UpdateChecker() {
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
        case "launched":
          setStatus("launched");
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

  const download = () => {
    setStatus("downloading");
    setPercent(0);
    window.updater?.download();
  };

  const description = {
    checking: "Checking for updates…",
    available: `Version ${version} is available.`,
    "not-available": "You're on the latest version.",
    downloading: `Downloading update… ${percent}%`,
    launched: "Installer launched — the app will close to finish.",
    error: error ?? "Update failed.",
  }[status];

  return (
    <>
      <Button variant="ghost" size="sm" onClick={check} className="relative">
        <RiDownloadCloud2Line />
        Updates
        {hasUpdate ? (
          <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary" />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Software update</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {status === "downloading" ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
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
                <Button onClick={download}>Download</Button>
              </>
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
