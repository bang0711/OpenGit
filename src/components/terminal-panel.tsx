"use client";

import "@xterm/xterm/css/xterm.css";
import {
  RiAddLine,
  RiCloseLine,
  RiSettings3Line,
  RiSubtractLine,
  RiTerminalLine,
} from "@remixicon/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { setEchoSink } from "@/lib/terminal-bus";
import {
  type TabPosition,
  setTerminalSettings,
  useTerminalSettings,
} from "@/lib/terminal-settings";
import { cn } from "@/lib/utils";

/** Toggle the terminal from anywhere. */
export function toggleTerminal() {
  window.dispatchEvent(new CustomEvent("opengit:toggle-terminal"));
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** One xterm session bound to a backend PTY by id. Kept mounted while hidden so
 *  background output keeps flowing; refits when it becomes active. */
function TerminalView({
  id,
  active,
  onExit,
}: {
  id: string;
  active: boolean;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      const host = hostRef.current;
      if (disposed || !host) return;
      const dark = document.documentElement.classList.contains("dark");
      const fg = dark ? "#d6deeb" : "#1f2328";
      const term = new Terminal({
        fontFamily:
          "'Dank Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12,
        cursorBlink: true,
        allowTransparency: true,
        theme: {
          background: "rgba(0,0,0,0)",
          foreground: fg,
          cursor: fg,
          selectionBackground: dark
            ? "rgba(255,255,255,0.2)"
            : "rgba(0,0,0,0.15)",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      fitRef.current = fit;
      setReady(true);
      await invoke("terminal_start", { id, cols: term.cols, rows: term.rows });
      const offData = await listen<{ id: string; data: string }>(
        "terminal:data",
        (e) => {
          if (e.payload.id === id) term.write(e.payload.data);
        },
      );
      const offExit = await listen<{ id: string }>("terminal:exit", (e) => {
        if (e.payload.id === id) onExitRef.current();
      });
      const onData = term.onData((d) => {
        invoke("terminal_input", { id, data: d });
      });
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
          invoke("terminal_resize", { id, cols: term.cols, rows: term.rows });
        } catch {
          // host detached mid-resize; ignore.
        }
      });
      ro.observe(host);
      term.focus();
      cleanup = () => {
        ro.disconnect();
        offData();
        offExit();
        onData.dispose();
        invoke("terminal_kill", { id });
        term.dispose();
        fitRef.current = null;
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [id]);

  // A hidden div mis-measures; refit when this view becomes active.
  useEffect(() => {
    if (active && ready) fitRef.current?.fit();
  }, [active, ready]);

  return (
    <div ref={hostRef} className={cn("absolute inset-0 p-1", !active && "hidden")} />
  );
}

type Session = { id: string; name: string };

export function TerminalPanel() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [height, setHeight] = usePersistedState("opengit.terminalHeight", 256);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const { tabPosition, syncUI } = useTerminalSettings();

  // Sync mode: type the UI's git command into the active terminal and run it
  // (trailing \r = Enter), so it lands in scrollback + history and leaves a fresh
  // prompt for the next command. The app already ran the op for its own state, so
  // this is a second, real run in the shell.
  useEffect(() => {
    setEchoSink((cmd) => {
      const id = activeIdRef.current;
      if (id) invoke("terminal_input", { id, data: `${cmd}\r` });
    });
    return () => setEchoSink(null);
  }, []);

  const add = useCallback(() => {
    const id = uuid();
    setSessions((s) => [...s, { id, name: `Terminal ${s.length + 1}` }]);
    setActiveId(id);
  }, []);

  const close = (id: string) => {
    setSessions((prev) => {
      const rest = prev.filter((x) => x.id !== id);
      setActiveId((cur) => (cur === id ? (rest.at(-1)?.id ?? null) : cur));
      if (rest.length === 0) setOpen(false);
      return rest;
    });
  };

  const startRename = (s: Session) => {
    setEditingId(s.id);
    setDraft(s.name);
  };
  const commitRename = () => {
    if (editingId) {
      const name = draft.trim();
      setSessions((prev) =>
        prev.map((x) => (x.id === editingId && name ? { ...x, name } : x)),
      );
    }
    setEditingId(null);
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("opengit:toggle-terminal", toggle);
    return () => window.removeEventListener("opengit:toggle-terminal", toggle);
  }, []);

  useEffect(() => {
    if (open && sessions.length === 0) add();
  }, [open, sessions.length, add]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const h = window.innerHeight - ev.clientY;
      setHeight(Math.min(window.innerHeight * 0.85, Math.max(140, Math.round(h))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!open) return null;

  const horizontal = tabPosition === "top" || tabPosition === "bottom";
  const tabsFirst = tabPosition === "top" || tabPosition === "left";

  const controls = (
    <div className={cn("flex items-center gap-0.5", horizontal ? "ml-auto" : "mt-auto")}>
      <ActionTooltip label="New terminal">
        <Button variant="ghost" size="icon-xs" onClick={add}>
          <RiAddLine />
        </Button>
      </ActionTooltip>
      <DropdownMenu>
        <ActionTooltip label="Terminal settings">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs">
              <RiSettings3Line />
            </Button>
          </DropdownMenuTrigger>
        </ActionTooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Tab position</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={tabPosition}
            onValueChange={(v) =>
              setTerminalSettings({ tabPosition: v as TabPosition })
            }
          >
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={syncUI}
            onCheckedChange={(v) => setTerminalSettings({ syncUI: !!v })}
            onSelect={(e) => e.preventDefault()}
          >
            Sync with UI
          </DropdownMenuCheckboxItem>
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            Notify on repo changes &amp; echo UI git commands here.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      <ActionTooltip label="Hide terminal">
        <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)}>
          <RiSubtractLine />
        </Button>
      </ActionTooltip>
    </div>
  );

  const tabBar = (
    <div
      className={cn(
        "flex gap-1 bg-card",
        horizontal ? "flex-row items-center px-2 py-1" : "w-44 flex-col p-1",
        tabPosition === "top" && "border-b border-border",
        tabPosition === "bottom" && "border-t border-border",
        tabPosition === "left" && "border-r border-border",
        tabPosition === "right" && "border-l border-border",
      )}
    >
      {sessions.map((s) =>
        editingId === s.id ? (
          <Input
            key={s.id}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingId(null);
            }}
            className={cn("h-6 px-2 py-0 text-xs", horizontal ? "w-28" : "w-full")}
          />
        ) : (
          <button
            type="button"
            key={s.id}
            onClick={() => setActiveId(s.id)}
            onDoubleClick={() => startRename(s)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-0.5 text-xs",
              !horizontal && "w-full",
              s.id === activeId ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            <RiTerminalLine className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{s.name}</span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                close(s.id);
              }}
              className="ml-auto rounded text-muted-foreground hover:text-foreground"
            >
              <RiCloseLine className="size-3" />
            </span>
          </button>
        ),
      )}
      {controls}
    </div>
  );

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background shadow-lg",
        horizontal ? "flex-col" : "flex-row",
      )}
      style={{ height }}
    >
      {/* drag-to-resize handle on the top edge */}
      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
      />

      {tabsFirst && tabBar}
      <div className="relative min-h-0 flex-1">
        {sessions.map((s) => (
          <TerminalView
            key={s.id}
            id={s.id}
            active={s.id === activeId}
            onExit={() => close(s.id)}
          />
        ))}
      </div>
      {!tabsFirst && tabBar}
    </div>
  );
}
