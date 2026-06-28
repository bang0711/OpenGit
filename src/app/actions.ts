// Renderer-side shim: the old Next server actions now live in the main process
// and are reached over IPC (window.api). Re-exported here under the same names
// so existing component imports (`@/app/actions`) keep working unchanged.
export type {
  ActionState,
  DirEntry,
  DirListing,
  HunkData,
  PullMode,
  RebaseOp,
  ResetMode,
} from "@shared/types";

const api = window.api;

export const listDirectory = api.listDirectory;
export const recentRepos = api.recentRepos;
export const removeRecent = api.removeRecent;
export const clearRecent = api.clearRecent;
export const openRepo = api.openRepo;
export const cloneRepo = api.cloneRepo;
export const closeRepo = api.closeRepo;
export const commitDetail = api.commitDetail;
export const commitFileDiff = api.commitFileDiff;
export const workingFileDiff = api.workingFileDiff;
export const fileHunkDiffs = api.fileHunkDiffs;
export const conflictVersions = api.conflictVersions;
export const blameFile = api.blameFile;
export const rebaseCommits = api.rebaseCommits;
export const gitFetch = api.gitFetch;
export const gitPush = api.gitPush;
export const gitPushSetUpstream = api.gitPushSetUpstream;
export const gitPushForce = api.gitPushForce;
export const gitPull = api.gitPull;
export const stageFile = api.stageFile;
export const stageAll = api.stageAll;
export const unstageFile = api.unstageFile;
export const unstageAll = api.unstageAll;
export const discardFile = api.discardFile;
export const discardAll = api.discardAll;
export const commit = api.commit;
export const amendCommit = api.amendCommit;
export const checkoutBranch = api.checkoutBranch;
export const checkoutCommit = api.checkoutCommit;
export const mergeBranch = api.mergeBranch;
export const deleteBranch = api.deleteBranch;
export const renameBranch = api.renameBranch;
export const deleteRemoteBranch = api.deleteRemoteBranch;
export const createBranch = api.createBranch;
export const createBranchAt = api.createBranchAt;
export const createRemoteBranch = api.createRemoteBranch;
export const publishBranch = api.publishBranch;
export const cherryPick = api.cherryPick;
export const revertCommit = api.revertCommit;
export const resetToCommit = api.resetToCommit;
export const createTagAt = api.createTagAt;
export const deleteTag = api.deleteTag;
export const deleteRemoteTag = api.deleteRemoteTag;
export const fetchTags = api.fetchTags;
export const resolveOurs = api.resolveOurs;
export const resolveTheirs = api.resolveTheirs;
export const saveResolution = api.saveResolution;
export const markResolved = api.markResolved;
export const abortMerge = api.abortMerge;
export const continueMerge = api.continueMerge;
export const stashPush = api.stashPush;
export const stashApply = api.stashApply;
export const stashPop = api.stashPop;
export const stashDrop = api.stashDrop;
export const stageHunk = api.stageHunk;
export const unstageHunk = api.unstageHunk;
export const revertHunk = api.revertHunk;
export const revertWorkingHunk = api.revertWorkingHunk;
export const stageWorkingHunk = api.stageWorkingHunk;
export const interactiveRebase = api.interactiveRebase;
