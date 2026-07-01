// Browser sign-in for the non-GitHub providers via the OAuth 2.0 Device
// Authorization Grant (GitLab, Azure/Entra): POST a device code, open the verify
// page, poll the token endpoint. Same shape the renderer already knows from
// GitHub ({userCode, verificationUri, ...}). The token lands in the OS keychain
// under `account` and a `gh:auth` event fires on completion, so the sign-in UI
// reacts unchanged.
use crate::secrets;
use reqwest::header::ACCEPT;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

const GRANT_DEVICE: &str = "urn:ietf:params:oauth:grant-type:device_code";

pub struct DeviceCfg {
    pub client_id: String,
    pub scope: String,
    pub device_url: String,
    pub token_url: String,
    pub account: String,
}

/// Begin a device-authorization login. Returns the code/URL for the renderer and
/// polls for the token in the background.
pub async fn device_start(app: &AppHandle, http: &Client, cfg: DeviceCfg) -> Value {
    if cfg.client_id.is_empty() {
        return json!({ "error": "Not configured — set the OAuth client id in .env, or sign in with a token." });
    }
    let res = http
        .post(&cfg.device_url)
        .header(ACCEPT, "application/json")
        .form(&[("client_id", cfg.client_id.as_str()), ("scope", cfg.scope.as_str())])
        .send()
        .await;
    let data: Value = match res {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => return json!({ "error": e.to_string() }),
    };
    let device_code = data.get("device_code").and_then(Value::as_str);
    let user_code = data.get("user_code").and_then(Value::as_str);
    let verification_uri = data
        .get("verification_uri")
        .or_else(|| data.get("verification_url")) // Azure spells it *_url
        .and_then(Value::as_str);
    let (Some(device_code), Some(user_code), Some(verification_uri)) =
        (device_code, user_code, verification_uri)
    else {
        let msg = data
            .get("error_description")
            .or_else(|| data.get("error"))
            .and_then(Value::as_str)
            .unwrap_or("Could not start login.");
        return json!({ "error": msg });
    };

    // Prefer the pre-filled URL when the provider gives one (skips code entry).
    let open = data
        .get("verification_uri_complete")
        .and_then(Value::as_str)
        .unwrap_or(verification_uri);
    let _ = app.opener().open_url(open, None::<&str>);

    let http2 = http.clone();
    let app2 = app.clone();
    let device_code = device_code.to_string();
    let interval = data.get("interval").and_then(Value::as_u64).unwrap_or(5);
    tauri::async_runtime::spawn(async move {
        poll_device(&http2, &app2, cfg, &device_code, interval).await;
    });

    json!({
        "userCode": user_code,
        "verificationUri": verification_uri,
        "expiresIn": data.get("expires_in").and_then(Value::as_u64).unwrap_or(900),
    })
}

async fn poll_device(http: &Client, app: &AppHandle, cfg: DeviceCfg, device_code: &str, interval: u64) {
    let mut wait = interval.max(5) * 1000;
    loop {
        tokio::time::sleep(Duration::from_millis(wait)).await;
        let res = http
            .post(&cfg.token_url)
            .header(ACCEPT, "application/json")
            .form(&[
                ("client_id", cfg.client_id.as_str()),
                ("device_code", device_code),
                ("grant_type", GRANT_DEVICE),
            ])
            .send()
            .await;
        let data: Value = match res {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => Value::Null,
        };
        if let Some(token) = data.get("access_token").and_then(Value::as_str) {
            secrets::set_token_for(&cfg.account, token);
            let _ = app.emit("gh:auth", json!({ "connected": true }));
            return;
        }
        match data.get("error").and_then(Value::as_str) {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                wait += 5000;
                continue;
            }
            other => {
                let reason = data
                    .get("error_description")
                    .and_then(Value::as_str)
                    .unwrap_or(other.unwrap_or("Login failed."));
                let _ = app.emit("gh:auth", json!({ "connected": false, "reason": reason }));
                return;
            }
        }
    }
}
