import { useGrammarsReady } from "@/hooks/use-grammars";
import { highlightLine } from "@/lib/highlight";
import { cn } from "@/lib/utils";

export function Cell({
  no,
  text,
  tone,
  sign,
  lang,
  className,
  selectable,
  selected,
  onToggle,
}: {
  no: number | null;
  text: string | null;
  tone: "add" | "del" | "ctx";
  sign: string;
  lang?: string;
  className?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const empty = text === null;
  // Re-render once the lazy grammar chunk loads so highlighting upgrades in.
  const ready = useGrammarsReady();
  const pickable = selectable && !empty && tone !== "ctx";
  return (
    <div
      onClick={pickable ? onToggle : undefined}
      className={cn(
        "flex min-w-0",
        empty && "bg-muted/30",
        tone === "add" && "bg-green-500/10",
        tone === "del" && "bg-red-500/10",
        pickable && "cursor-pointer hover:brightness-110",
        selected && "ring-1 ring-inset ring-primary brightness-110",
        className,
      )}
    >
      <span className="text-muted-foreground w-12 shrink-0 px-2 text-right select-none">
        {no ?? ""}
      </span>
      {!empty ? (
        <span className="w-full px-2 break-words whitespace-pre-wrap">
          <span className="text-muted-foreground/60 select-none">{sign} </span>
          {/* Prism escapes its input; diff text is local repo content. */}
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Prism output */}
          <span
            dangerouslySetInnerHTML={{
              __html: highlightLine(text, ready ? lang : undefined),
            }}
          />
        </span>
      ) : null}
    </div>
  );
}
