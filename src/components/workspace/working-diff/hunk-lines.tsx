import { cn } from "@/lib/utils";

export function HunkLines({ hunk }: { hunk: string }) {
  const lines = hunk.split("\n").slice(1); // drop the @@ header (shown above)
  return (
    <pre className="w-max min-w-full font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: positional diff line
          key={i}
          className={cn(
            "px-3",
            line.startsWith("+") && "bg-green-500/10 text-green-300",
            line.startsWith("-") && "bg-red-500/10 text-red-300",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
