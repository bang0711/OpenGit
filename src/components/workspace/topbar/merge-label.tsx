export function MergeLabel({
  source,
  target,
}: {
  source: string;
  target?: string;
}) {
  return (
    <span className="truncate">
      Merge <span className="font-semibold">{source}</span> into{" "}
      <span className="font-semibold">{target}</span>
    </span>
  );
}
