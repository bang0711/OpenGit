"use client";

import { RiLoader4Line } from "@remixicon/react";
import type { ImageDiff } from "@shared/types";
import { useEffect, useState } from "react";
import { commitFileImage, workingFileImage } from "@/app/actions";

function ImageSide({
  url,
  label,
  fallback,
}: {
  url: string | null;
  label: string;
  fallback: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="bg-muted/40 text-muted-foreground border-border truncate border-b px-3 py-0.5 text-xs font-semibold">
        <span title={label}>{label}</span>
      </div>
      <div className="bg-muted/20 flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {url ? (
          // biome-ignore lint/performance/noImgElement: local data URL, no Next image
          <img
            src={url}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-muted-foreground text-xs">{fallback}</span>
        )}
      </div>
    </div>
  );
}

/** Side-by-side before/after image comparison. */
export function ImageDiffView({
  data,
  oldLabel,
  newLabel,
}: {
  data: ImageDiff;
  oldLabel: string;
  newLabel: string;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <ImageSide
        url={data.old}
        label={oldLabel}
        fallback="Not in this version"
      />
      <div className="bg-border w-px shrink-0" />
      <ImageSide
        url={data.new}
        label={newLabel}
        fallback="Not in this version"
      />
    </div>
  );
}

function Spinner() {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center">
      <RiLoader4Line className="size-5 animate-spin" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      {children}
    </div>
  );
}

/** Image diff for a file in a commit (parent vs commit). */
export function CommitImageDiff({
  sha,
  file,
  oldLabel,
  newLabel,
}: {
  sha: string;
  file: string;
  oldLabel: string;
  newLabel: string;
}) {
  const [data, setData] = useState<ImageDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    setPending(true);
    commitFileImage(sha, file)
      .then((r) => {
        if (!live) return;
        if ("error" in r) {
          setError(r.error);
          setData(null);
        } else {
          setData(r);
          setError(null);
        }
      })
      .finally(() => live && setPending(false));
    return () => {
      live = false;
    };
  }, [sha, file]);

  if (pending && !data) return <Spinner />;
  if (error) return <Notice>{error}</Notice>;
  if (!data) return null;
  return <ImageDiffView data={data} oldLabel={oldLabel} newLabel={newLabel} />;
}

/** Image diff for a working-tree file (HEAD vs on disk). */
export function WorkingImageDiff({ file }: { file: string }) {
  const [data, setData] = useState<ImageDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rev, setRev] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` is a manual refetch trigger
  useEffect(() => {
    let live = true;
    setPending(true);
    workingFileImage(file)
      .then((r) => {
        if (!live) return;
        if ("error" in r) {
          setError(r.error);
          setData(null);
        } else {
          setData(r);
          setError(null);
        }
      })
      .finally(() => live && setPending(false));
    return () => {
      live = false;
    };
  }, [file, rev]);

  // Refresh when the file changes on disk, matching the text diff view.
  useEffect(() => window.api.onRepoChange(() => setRev((v) => v + 1)), []);

  if (pending && !data) return <Spinner />;
  if (error) return <Notice>{error}</Notice>;
  if (!data) return null;
  return <ImageDiffView data={data} oldLabel="HEAD" newLabel="Working tree" />;
}
