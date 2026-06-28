import { safeStorage } from "electron";
import { getGithubTokenRaw, setGithubTokenRaw } from "./state";

// GitHub PAT storage. Encrypted with the OS keychain via Electron safeStorage
// when available; the encrypted bytes are kept (base64) in the state JSON.
// ponytail: plaintext "plain:" fallback for Linux boxes with no keyring — upgrade
// path is to require a keyring there if that ever matters.
const PLAIN = "plain:";

export function setGithubToken(plain: string): void {
  const t = plain.trim();
  if (!t) {
    setGithubTokenRaw(null);
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    setGithubTokenRaw(safeStorage.encryptString(t).toString("base64"));
  } else {
    setGithubTokenRaw(PLAIN + t);
  }
}

export function getGithubToken(): string | null {
  const raw = getGithubTokenRaw();
  if (!raw) return null;
  if (raw.startsWith(PLAIN)) return raw.slice(PLAIN.length);
  try {
    return safeStorage.decryptString(Buffer.from(raw, "base64"));
  } catch {
    return null;
  }
}

export function clearGithubToken(): void {
  setGithubTokenRaw(null);
}
