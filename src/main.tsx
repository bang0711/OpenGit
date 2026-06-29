// MUST be first: installs window.api/github/updater (side effect on import) before
// any other module evaluates and reads them (e.g. app/actions.ts at module top).
import "./bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { router } from "./router";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
    </TooltipProvider>
    <Toaster position="bottom-right" duration={2000} />
  </StrictMode>,
);
