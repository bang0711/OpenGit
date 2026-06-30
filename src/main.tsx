// MUST be first: installs window.api/github/updater (side effect on import) before
// any other module evaluates and reads them (e.g. app/actions.ts at module top).
import "./bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { CommandPalette } from "@/components/command-palette";
import { RepoChangeNotifier } from "@/components/repo-change-notifier";
import { TerminalPanel } from "@/components/terminal-panel";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { applyTheme } from "@/lib/theme";
import { router } from "./router";

// Apply the saved theme before first paint (index.html ships `dark` as default).
applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
      <CommandPalette />
      <TerminalPanel />
      <RepoChangeNotifier />
    </TooltipProvider>
    <Toaster position="bottom-right" duration={2000} />
  </StrictMode>,
);
