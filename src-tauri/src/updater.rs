// Auto-update, ported from electron/main/updater.ts. Custom GitHub-releases flow
// (no electron-updater): list releases, download an installer with progress, run
// it per-OS. Events go to the renderer as "updater:event" (UpdaterEvent shapes).
use crate::AppState;
use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const REPO: &str = "bang0711/OpenGit";

fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit("updater:event", payload);
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Newer-than compare on dotted numeric versions (a > b).
fn is_newer(a: &str, b: &str) -> bool {
    let part = |s: &str| -> Vec<u64> {
        s.split('.').map(|x| x.trim().parse().unwrap_or(0)).collect()
    };
    let (av, bv) = (part(a), part(b));
    for i in 0..av.len().max(bv.len()) {
        let x = av.get(i).copied().unwrap_or(0);
        let y = bv.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

fn asset_matches(name: &str) -> bool {
    let n = name.to_lowercase();
    if cfg!(target_os = "windows") {
        n.ends_with(".exe") && n.contains("setup")
    } else if cfg!(target_os = "macos") {
        n.ends_with(".dmg")
    } else {
        n.ends_with(".appimage")
    }
}

async fn fetch_releases(st: &AppState, app: &AppHandle) -> Vec<Value> {
    let res = st
        .http
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))
        .header("User-Agent", "OpenGit")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;
    let data: Value = match res {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or(Value::Null),
        _ => return vec![],
    };
    let current = current_version(app);
    data.as_array()
        .map(|arr| {
            arr.iter()
                .filter(|d| !d.get("draft").and_then(Value::as_bool).unwrap_or(false))
                .map(|d| {
                    let tag = d.get("tag_name").and_then(Value::as_str).unwrap_or("");
                    let version = tag.strip_prefix('v').unwrap_or(tag).to_string();
                    let asset_url = d
                        .get("assets")
                        .and_then(Value::as_array)
                        .and_then(|a| {
                            a.iter().find(|x| {
                                x.get("name").and_then(Value::as_str).map(asset_matches).unwrap_or(false)
                            })
                        })
                        .and_then(|x| x.get("browser_download_url").cloned())
                        .unwrap_or(Value::Null);
                    json!({
                        "version": version,
                        "tag": tag,
                        "assetUrl": asset_url,
                        "pageUrl": d.get("html_url").cloned().unwrap_or(Value::Null),
                        "prerelease": d.get("prerelease").and_then(Value::as_bool).unwrap_or(false),
                        "current": version == current,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Stream an installer to a temp file (progress events), then launch it per-OS.
async fn download_and_run(app: &AppHandle, st: &AppState, url: &str) -> Result<(), String> {
    let res = st.http.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed ({})", res.status().as_u16()));
    }
    let total = res.content_length().unwrap_or(0);
    let name = url.rsplit('/').next().unwrap_or("OpenGit-installer");
    let file = std::env::temp_dir().join(name);
    let mut out = tokio::fs::File::create(&file).await.map_err(|e| e.to_string())?;

    let mut stream = res.bytes_stream();
    let mut received: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        out.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if total > 0 {
            emit(app, json!({ "type": "progress", "percent": (received * 100 / total) }));
        }
    }
    out.flush().await.map_err(|e| e.to_string())?;
    drop(out);

    install_downloaded(app, &file.to_string_lossy()).await
}

#[cfg(windows)]
async fn install_downloaded(app: &AppHandle, file: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(file, None::<&str>).map_err(|e| e.to_string())?;
    emit(app, json!({ "type": "launched" }));
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        app2.exit(0);
    });
    Ok(())
}

#[cfg(target_os = "linux")]
async fn install_downloaded(app: &AppHandle, file: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(target) = std::env::var("APPIMAGE") {
        std::fs::copy(file, &target).map_err(|e| e.to_string())?;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
        emit(app, json!({ "type": "launched" }));
        let _ = std::process::Command::new(&target).spawn();
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            app2.exit(0);
        });
    } else {
        let _ = std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o755));
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(file, None::<&str>).map_err(|e| e.to_string())?;
        emit(app, json!({ "type": "launched" }));
    }
    Ok(())
}

// macOS: open the .dmg for the user to install. ponytail: the in-place .app swap
// (hdiutil mount + cp + xattr) is a lot of mac-only plumbing; the open flow works
// for every case — upgrade to the silent swap if one-click matters on mac.
#[cfg(target_os = "macos")]
async fn install_downloaded(app: &AppHandle, file: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(file, None::<&str>).map_err(|e| e.to_string())?;
    emit(app, json!({ "type": "launched" }));
    Ok(())
}

pub async fn dispatch(st: &AppState, app: &AppHandle, name: &str, _args: Vec<Value>) -> Value {
    match name {
        "check" => {
            let current = current_version(app);
            let releases = fetch_releases(st, app).await;
            let newer = releases.iter().find(|r| {
                !r.get("prerelease").and_then(Value::as_bool).unwrap_or(false)
                    && r.get("version")
                        .and_then(Value::as_str)
                        .map(|v| is_newer(v, &current))
                        .unwrap_or(false)
            });
            match newer {
                Some(r) => emit(app, json!({ "type": "available", "version": r.get("version").cloned().unwrap_or(Value::Null) })),
                None => emit(app, json!({ "type": "not-available" })),
            }
            Value::Null
        }
        "download" => {
            // Custom flow has no silent download; pull the newest matching asset.
            let releases = fetch_releases(st, app).await;
            let current = current_version(app);
            let url = releases
                .iter()
                .find(|r| {
                    r.get("version").and_then(Value::as_str).map(|v| is_newer(v, &current)).unwrap_or(false)
                        && !r.get("assetUrl").map(Value::is_null).unwrap_or(true)
                })
                .and_then(|r| r.get("assetUrl").and_then(Value::as_str))
                .map(str::to_string);
            if let Some(url) = url {
                if let Err(e) = download_and_run(app, st, &url).await {
                    emit(app, json!({ "type": "error", "message": e }));
                }
            } else {
                emit(app, json!({ "type": "not-available" }));
            }
            Value::Null
        }
        _ => json!({ "error": format!("updater:{name} not implemented") }),
    }
}
