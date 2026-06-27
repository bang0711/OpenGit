import { RepoPicker } from "@/components/repo-picker";
import { Workspace } from "@/components/workspace/workspace";
import { getRecentRepos, getValidActiveRepoPath } from "@/lib/active-repo";
import {
  getBranches,
  getCommits,
  getMergeState,
  getRemotes,
  getRepoInfo,
  getStashes,
  getStatus,
  getTags,
} from "@/lib/git";

// Always reflect the on-disk repo state.
export const dynamic = "force-dynamic";

const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
  p.catch(() => fallback);

export default async function Home() {
  const repoPath = await getValidActiveRepoPath();

  if (!repoPath) {
    const recent = await getRecentRepos();
    return <RepoPicker recent={recent} />;
  }

  const [repo, branches, remotes, tags, stashes, commits, status, merge] =
    await Promise.all([
      getRepoInfo(repoPath),
      safe(getBranches(repoPath), []),
      safe(getRemotes(repoPath), []),
      safe(getTags(repoPath), []),
      safe(getStashes(repoPath), []),
      safe(getCommits(repoPath, 100), []),
      safe(getStatus(repoPath), []),
      safe(getMergeState(repoPath), {
        conflicted: [],
        inMerge: false,
        inRebase: false,
      }),
    ]);

  return (
    <Workspace
      repo={repo}
      branches={branches}
      remotes={remotes}
      tags={tags}
      stashes={stashes}
      commits={commits}
      status={status}
      merge={merge}
    />
  );
}
