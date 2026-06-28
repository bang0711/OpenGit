import type { Api, Github, Updater } from "@shared/types";

declare global {
  interface Window {
    api: Api;
    updater: Updater;
    github: Github;
  }
}
