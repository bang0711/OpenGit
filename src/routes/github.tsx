import type {
  Collaborator,
  GhStatus,
  GithubBranch,
  GithubIssue,
  PullRequest,
} from "@shared/types";
import { GithubPanel } from "@/components/github";

const list = <T,>(x: T[] | { error: string }): T[] =>
  Array.isArray(x) ? x : [];

export async function githubLoader() {
  const status = (await window.github.tokenStatus()) as GhStatus;
  if (!status.connected) {
    return {
      status,
      prs: [] as PullRequest[],
      collaborators: [] as Collaborator[],
      issues: [] as GithubIssue[],
      branches: [] as GithubBranch[],
    };
  }
  const [prs, collaborators, issues, branches] = await Promise.all([
    window.github.listPRs(),
    window.github.listCollaborators(),
    window.github.listIssues(),
    window.github.listRemoteBranches(),
  ]);
  return {
    status,
    prs: list(prs),
    collaborators: list(collaborators),
    issues: list(issues),
    branches: list(branches),
  };
}

export function Github() {
  return <GithubPanel />;
}
