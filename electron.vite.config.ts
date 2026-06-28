import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

const alias = {
  "@": resolve(__dirname, "src"),
  "@shared": resolve(__dirname, "shared"),
};

export default defineConfig(({ mode }) => {
  // GitHub OAuth App client id, baked in at build time so it stays out of the
  // source. Reads a (git-ignored) .env file or the OPENGIT_GH_CLIENT_ID env var
  // — works in both `dev` and `build`. It's public (device flow has no secret),
  // so embedding it in the binary is fine.
  const env = loadEnv(mode, process.cwd(), "");
  const GH_CLIENT_ID = JSON.stringify(env.OPENGIT_GH_CLIENT_ID || "");

  return {
  main: {
    resolve: { alias },
    define: { __GH_CLIENT_ID__: GH_CLIENT_ID },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/main/index.ts"),
        // electron is provided by the runtime — never bundle it (a devDep, so
        // externalizeDepsPlugin won't catch it). CJS so __dirname works.
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/preload/index.ts"),
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src"),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/index.html"),
      },
    },
  },
  };
});
