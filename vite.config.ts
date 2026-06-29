import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Plain Vite config for the renderer — Tauri runs this dev server and points its
// webview at it. Ported from the `renderer` half of the old electron.vite.config.ts.
// The GH client id is no longer injected here: it's baked into the Rust binary at
// compile time (src-tauri/build.rs via option_env!), so nothing build-time leaks
// into the renderer bundle.
export default defineConfig({
  root: resolve(__dirname, "src"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  plugins: [
    // React Compiler auto-memoizes components/hooks → fewer re-renders (helps the
    // commit-graph-heavy UI). React 19 needs no runtime package.
    react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } }),
    tailwindcss(),
  ],
  // Tauri needs a fixed port it can wait on; fail rather than hop ports.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Don't churn the dev server when Rust files change — Tauri watches those.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "src/index.html") },
    // The renderer loads from local disk inside the Tauri webview — there's no
    // network download, so a single ~1.3MB bundle is fine. Silence the
    // website-oriented chunk-size warning.
    chunkSizeWarningLimit: 2000,
  },
});
