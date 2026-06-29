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
    println!("cargo:rerun-if-env-changed=OPENGIT_GH_CLIENT_ID");
    println!("cargo:rerun-if-changed=../.env");

    // Prefer a real env var (CI sets it from vars.OPENGIT_GH_CLIENT_ID); fall back
    // to .env so local `tauri dev` / `tauri build` bake the public client id too.
    let cid = std::env::var("OPENGIT_GH_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| dotenv_value("OPENGIT_GH_CLIENT_ID"));
    if let Some(cid) = cid {
        // option_env!("OPENGIT_GH_CLIENT_ID") in github.rs now resolves to this.
        println!("cargo:rustc-env=OPENGIT_GH_CLIENT_ID={cid}");
    }

    tauri_build::build();
}
