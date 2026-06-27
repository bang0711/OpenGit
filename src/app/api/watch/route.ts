import { watch } from "node:fs";
import { getValidActiveRepoPath } from "@/lib/active-repo";

// Server-Sent Events stream that pushes "change" whenever the active repo's
// files change. One EventSource connection == one fs.watch, torn down when the
// client disconnects (req.signal abort). Debounced so a burst of writes (a
// merge touching many files) collapses into a single refresh.

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // fs.watch needs the Node runtime, not edge

// Churn we never want to refresh on. fs.watch (recursive) still reports these,
// but filtering the callback prevents refresh storms.
const IGNORE =
  /(^|[\\/])(node_modules|\.next|\.git[\\/](objects|lfs|.*\.lock))([\\/]|$)/;

const DEBOUNCE_MS = 500;

export async function GET(req: Request) {
  const repo = await getValidActiveRepoPath();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let watcher: ReturnType<typeof watch> | null = null;

      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        watcher?.close();
        try {
          controller.close();
        } catch {}
      };

      send("connected");

      if (repo) {
        try {
          watcher = watch(repo, { recursive: true }, (_event, filename) => {
            if (filename && IGNORE.test(filename.toString())) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => send("change"), DEBOUNCE_MS);
          });
        } catch {
          // Recursive watch unsupported (Linux) — client falls back to
          // focus/visibility refresh; keep the connection open and quiet.
        }
      }

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
