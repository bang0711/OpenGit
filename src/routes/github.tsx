import { GithubPanel } from "@/components/github";

// No loader: navigation must be instant. GithubPanel fetches its own data with
// a loading state so clicking "Pull Requests" doesn't block on the network.
export function Github() {
  return <GithubPanel />;
}
