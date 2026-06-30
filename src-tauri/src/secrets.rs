// GitHub token storage in the OS keychain via the `keyring` crate — Windows
// Credential Manager / macOS Keychain / libsecret. Replaces Electron safeStorage
// (which wrote an encrypted blob into the state JSON); here the secret never
// touches our files.
use keyring::Entry;

const SERVICE: &str = "opengit";
const GITHUB_ACCOUNT: &str = "github-token";

fn entry(account: &str) -> Option<Entry> {
    Entry::new(SERVICE, account).ok()
}

// ── per-provider tokens (account = "<provider>-token") ───────────────────────
pub fn set_token_for(account: &str, plain: &str) {
    let t = plain.trim();
    if let Some(e) = entry(account) {
        if t.is_empty() {
            let _ = e.delete_credential();
        } else {
            let _ = e.set_password(t);
        }
    }
}

pub fn get_token_for(account: &str) -> Option<String> {
    entry(account)
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

pub fn clear_token_for(account: &str) {
    if let Some(e) = entry(account) {
        let _ = e.delete_credential();
    }
}

// ── GitHub convenience wrappers (back-compat) ────────────────────────────────
pub fn set_token(plain: &str) {
    set_token_for(GITHUB_ACCOUNT, plain);
}
pub fn get_token() -> Option<String> {
    get_token_for(GITHUB_ACCOUNT)
}
pub fn clear_token() {
    clear_token_for(GITHUB_ACCOUNT);
}
