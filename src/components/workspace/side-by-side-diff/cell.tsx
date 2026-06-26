import { cn } from "@/lib/utils";

export function Cell({
  no,
  text,
  tone,
  sign,
  className,
}: {
  no: number | null;
  text: string | null;
  tone: "add" | "del" | "ctx";
  sign: string;
  className?: string;
}) {
  const empty = text === null;
  return (
    <div
      className={cn(
        "flex min-w-0",
        empty && "bg-muted/30",
        tone === "add" && "bg-green-500/10",
        tone === "del" && "bg-red-500/10",
        className,
      )}
    >
      <span className="text-muted-foreground w-12 shrink-0 px-2 text-right select-none">
        {no ?? ""}
      </span>
      {!empty ? (
        <span
          className={cn(
            "w-full px-2 break-words whitespace-pre-wrap",
            tone === "add" && "text-green-300",
            tone === "del" && "text-red-300",
          )}
        >
          <span className="text-muted-foreground/60 select-none">{sign} </span>
          {text}
        </span>
      ) : null}
    </div>
  );
}
