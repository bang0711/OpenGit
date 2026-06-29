import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Renderer-only tests now — the backend logic lives in Rust (cargo test in
// src-tauri). tests/renderer covers the src/ helpers + pure components.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/renderer/**/*.test.ts"],
  },
});
