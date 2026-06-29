// GitHub token storage in the OS keychain via the `keyring` crate — Windows
// Credential Manager / macOS Keychain / libsecret. Replaces Electron safeStorage
// (which wrote an encrypted blob into the state JSON); here the secret never
// touches our files.
use keyring::Entry;

const SERVICE: &str = "opengit";
const ACCOUNT: &str = "github-token";

fn entry() -> Option<Entry> {
    Entry::new(SERVICE, ACCOUNT).ok()
}

pub fn set_token(plain: &str) {
    let t = plain.trim();
    if let Some(e) = entry() {
        if t.is_empty() {
            let _ = e.delete_credential();
        } else {
            let _ = e.set_password(t);
        }
    }
}

pub fn get_token() -> Option<String> {
    entry()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

pub fn clear_token() {
    if let Some(e) = entry() {
        let _ = e.delete_credential();
    }
}
