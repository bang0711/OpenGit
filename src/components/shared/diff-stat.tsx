// Per-file added/removed line counts. Hidden entirely when there's nothing
// useful to show (untracked / binary report -1). Shared by the changes panel,
// commit detail, and file tree.
export function DiffStat({ adds, dels }: { adds: number; dels: number }) {
  if (adds <= 0 && dels <= 0) return null;
  return (
    <span className="flex items-center gap-1 font-mono text-[0.625rem]">
      {adds > 0 ? <span className="text-green-500">+{adds}</span> : null}
      {dels > 0 ? <span className="text-red-500">−{dels}</span> : null}
    </span>
  );
}
