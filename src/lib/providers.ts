import { RiGithubFill, RiGitlabFill, RiMicrosoftFill } from "@remixicon/react";
import type { ComponentType } from "react";

export type ProviderKey = "github" | "gitlab" | "azure";

export type ProviderMeta = {
  key: ProviderKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Browser sign-in available (device flow / loopback); else PAT-only. */
  device: boolean;
  tokenHint: string;
  /** Where to mint a token. */
  tokenUrl: string;
  /** Not launched yet — shown in the panel but sign-in disabled. */
  comingSoon?: boolean;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    key: "github",
    label: "GitHub",
    Icon: RiGithubFill,
    device: true,
    tokenHint: "Personal access token (repo scope)",
    tokenUrl: "https://github.com/settings/tokens",
  },
  {
    key: "gitlab",
    label: "GitLab",
    Icon: RiGitlabFill,
    device: true,
    tokenHint: "Personal access token (api scope)",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
  },
  {
    key: "azure",
    label: "Azure DevOps",
    Icon: RiMicrosoftFill,
    device: true,
    tokenHint: "Personal access token (Code: Read & Write)",
    tokenUrl: "https://dev.azure.com",
    comingSoon: true,
  },
];
