import { createHashRouter } from "react-router-dom";
import { RouteError } from "./components/route-error";
import { Blame, blameLoader } from "./routes/blame";
import { Conflicts, conflictsLoader } from "./routes/conflicts";
import { Diff, diffLoader } from "./routes/diff";
import { Github } from "./routes/github";
import { Home, homeLoader } from "./routes/home";

const errorElement = <RouteError />;

export const router = createHashRouter([
  { path: "/", element: <Home />, loader: homeLoader, errorElement },
  { path: "/diff", element: <Diff />, loader: diffLoader, errorElement },
  { path: "/blame", element: <Blame />, loader: blameLoader, errorElement },
  {
    path: "/conflicts",
    element: <Conflicts />,
    loader: conflictsLoader,
    errorElement,
  },
  { path: "/github", element: <Github />, errorElement },
]);
