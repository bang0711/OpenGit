import { createHashRouter } from "react-router-dom";
import { RouteError } from "./components/route-error";
import { Home, homeLoader } from "./routes/home";

const errorElement = <RouteError />;

// Home stays eager (it's the first paint). The other routes load on demand via
// `lazy` — Vite splits each into its own chunk, so the initial bundle only
// carries the home screen + shared code. The lazy fn returns route props
// (Component/loader); `path` + `errorElement` stay static here.
export const router = createHashRouter([
  { path: "/", element: <Home />, loader: homeLoader, errorElement },
  {
    path: "/diff",
    errorElement,
    lazy: async () => {
      const m = await import("./routes/diff");
      return { Component: m.Diff, loader: m.diffLoader };
    },
  },
  {
    path: "/blame",
    errorElement,
    lazy: async () => {
      const m = await import("./routes/blame");
      return { Component: m.Blame, loader: m.blameLoader };
    },
  },
  {
    path: "/conflicts",
    errorElement,
    lazy: async () => {
      const m = await import("./routes/conflicts");
      return { Component: m.Conflicts, loader: m.conflictsLoader };
    },
  },
  {
    path: "/github",
    errorElement,
    lazy: async () => {
      const m = await import("./routes/github");
      return { Component: m.Github };
    },
  },
]);
