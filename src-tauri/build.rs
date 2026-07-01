use std::fs;

/// Read a key from the repo-root `.env` (one level up from src-tauri). Tolerates
/// `KEY = value`, optional surrounding quotes, and `#` comments. Replaces the
/// electron-vite `loadEnv` we used to bake the client id with.
fn dotenv_value(key: &str) -> Option<String> {
    let content = fs::read_to_string("../.env").ok()?;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        if k.trim() != key {
            continue;
        }
        let v = v.trim().trim_matches(|c| c == '\'' || c == '"').trim();
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    None
}

fn main() {
    println!("cargo:rerun-if-changed=../.env");

    // Bake each provider's OAuth config so option_env!(KEY) resolves in the
    // provider modules. Prefer a real env var (CI sets these from repo secrets/
    // vars); fall back to .env for local `tauri dev` / `tauri build`.
    const KEYS: &[&str] = &[
        "OPENGIT_GH_CLIENT_ID",
        "OPENGIT_GITLAB_CLIENT_ID",
        "OPENGIT_AZURE_CLIENT_ID",
        "OPENGIT_AZURE_TENANT",
    ];
    for key in KEYS {
        println!("cargo:rerun-if-env-changed={key}");
        let val = std::env::var(key)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| dotenv_value(key));
        if let Some(val) = val {
            println!("cargo:rustc-env={key}={val}");
        }
    }

    tauri_build::build();
}
