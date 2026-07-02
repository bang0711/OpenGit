// MUST be first: installs window.api/github/updater (side effect on import) before
// any other module evaluates and reads them (e.g. app/actions.ts at module top).
import "./bridge";
import { invoke } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { CommandPalette } from "@/components/command-palette";
import { RepoChangeNotifier } from "@/components/repo-change-notifier";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { applyTheme } from "@/lib/theme";
import { router } from "./router";

// Apply the saved theme before first paint (index.html ships `dark` as default).
applyTheme();

// Forward uncaught renderer errors to the backend log file
// (%APPDATA%\OpenGit\main.log), so field bugs — including a blank-screen boot
// crash — leave a trace. Fire-and-forget; never let logging itself throw.
const logToFile = (message: string) => {
  try {
    void invoke("renderer_log", { level: "error", message });
  } catch {
    // bridge unavailable (e.g. plain browser); ignore
  }
};
window.addEventListener("error", (e) => {
  logToFile(`${e.message} (${e.filename}:${e.lineno})`);
});
window.addEventListener("unhandledrejection", (e) => {
  logToFile(`unhandled rejection: ${String(e.reason)}`);
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
      <CommandPalette />
      <RepoChangeNotifier />
    </TooltipProvider>
    <Toaster position="bottom-right" duration={2000} />
  </StrictMode>,
);
