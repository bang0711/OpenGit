// Saved git-identity profiles (name/email/signing), persisted in localStorage.
// Applying a profile writes those fields to the active repo's local config.
import type { GitIdentity } from "@shared/types";

export type Profile = {
  id: string;
  label: string;
  userName: string;
  userEmail: string;
  signingKey: string;
  gpgFormat: string;
  sign: boolean;
};

const KEY = "opengit.profiles";

export function getProfiles(): Profile[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveProfiles(list: Profile[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function profileToIdentity(p: Profile): GitIdentity {
  return {
    userName: p.userName || null,
    userEmail: p.userEmail || null,
    signingKey: p.signingKey || null,
    gpgFormat: p.gpgFormat || null,
    sign: p.sign,
  };
}

function uuid(): string {
  // crypto.randomUUID needs a secure context; fall back for older webviews.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function newProfile(label: string, id: GitIdentity): Profile {
  return {
    id: uuid(),
    label,
    userName: id.userName ?? "",
    userEmail: id.userEmail ?? "",
    signingKey: id.signingKey ?? "",
    gpgFormat: id.gpgFormat ?? "",
    sign: id.sign,
  };
}
