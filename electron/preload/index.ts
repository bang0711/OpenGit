import { contextBridge, ipcRenderer } from "electron";
import { API_CHANNELS } from "@shared/channels";

// Build window.api from the shared channel list — each method invokes its IPC
// handler. Plus event subscriptions (repo changes, updater).
const api: Record<string, unknown> = {};
for (const name of API_CHANNELS) {
  api[name] = (...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args);
}
api.onRepoChange = (cb: () => void) => {
  const handler = () => cb();
  ipcRenderer.on("repo:changed", handler);
  return () => ipcRenderer.removeListener("repo:changed", handler);
};

const updater = {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  listReleases: () => ipcRenderer.invoke("updater:releases"),
  openDownload: (url: string) => ipcRenderer.invoke("updater:openDownload", url),
  downloadVersion: (url: string) =>
    ipcRenderer.invoke("updater:downloadVersion", url),
  onEvent: (cb: (e: unknown) => void) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("updater:event", handler);
    return () => ipcRenderer.removeListener("updater:event", handler);
  },
};

const github = {
  tokenStatus: () => ipcRenderer.invoke("gh:tokenStatus"),
  setToken: (token: string) => ipcRenderer.invoke("gh:setToken", token),
  clearToken: () => ipcRenderer.invoke("gh:clearToken"),
  listPRs: () => ipcRenderer.invoke("gh:listPRs"),
  getPR: (n: number) => ipcRenderer.invoke("gh:getPR", n),
  mergePR: (n: number, method: string) =>
    ipcRenderer.invoke("gh:mergePR", n, method),
  closePR: (n: number) => ipcRenderer.invoke("gh:closePR", n),
  commentPR: (n: number, body: string) =>
    ipcRenderer.invoke("gh:commentPR", n, body),
  reviewPR: (n: number, event: string, body?: string) =>
    ipcRenderer.invoke("gh:reviewPR", n, event, body),
  createPR: (
    title: string,
    body: string,
    head: string,
    base: string,
    reviewers: string[],
  ) => ipcRenderer.invoke("gh:createPR", title, body, head, base, reviewers),
  listCollaborators: () => ipcRenderer.invoke("gh:listCollaborators"),
  listIssues: () => ipcRenderer.invoke("gh:listIssues"),
  listRemoteBranches: () => ipcRenderer.invoke("gh:listRemoteBranches"),
};

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("updater", updater);
contextBridge.exposeInMainWorld("github", github);
