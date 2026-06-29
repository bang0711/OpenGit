// GitHub REST client + OAuth Device Flow, ported from electron/main/github.ts.
// Token in the OS keychain (secrets.rs); ETag cache in AppState so 304s stay
// free against the rate limit. Mapping helpers (map_pr/map_user/…) operate on
// serde_json values rather than mirrored structs.
use crate::{repo_registry, secrets, AppState};
use reqwest::header::{ACCEPT, AUTHORIZATION, ETAG, IF_NONE_MATCH, USER_AGENT};
use reqwest::{Client, Method};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

const API: &str = "https://api.github.com";
const OAUTH_SCOPE: &str = "repo read:org";

// Public OAuth App client id for the Device Flow (no secret). Baked at build time
// from OPENGIT_GH_CLIENT_ID; falls back to the runtime env var for `tauri dev`.
fn client_id() -> String {
    let baked = option_env!("OPENGIT_GH_CLIENT_ID").unwrap_or("");
    if !baked.trim().is_empty() {
        return baked.trim().to_string();
    }
    std::env::var("OPENGIT_GH_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

async fn gh_context(st: &AppState) -> Result<(String, String), String> {
    let id = st.store.active_repo_id().ok_or("No active repository.")?;
    let path = repo_registry::resolve_repo_path(&id).await?;
    let remotes = crate::git::get_remotes(&path)
        .await
        .map_err(|e| e.message)?;
    let origin = remotes
        .iter()
        .find(|r| r.name == "origin")
        .or_else(|| remotes.first());
    let parsed = origin.and_then(|r| crate::path_utils::parse_github_remote(&r.url));
    parsed.ok_or("Not a GitHub repository.".to_string())
}

/// Cached, authenticated GitHub request. GET responses are ETag-cached.
async fn gh_fetch(
    st: &AppState,
    path: &str,
    method: Method,
    body: Option<Value>,
) -> Result<Value, String> {
    let token = secrets::get_token().ok_or("Not connected to GitHub.")?;
    let is_get = method == Method::GET;
    let cached = if is_get {
        st.etag.lock().unwrap().get(path).cloned()
    } else {
        None
    };

    let mut req = st
        .http
        .request(method, format!("{API}{path}"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header(ACCEPT, "application/vnd.github+json")
        .header(USER_AGENT, "OpenGit")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some((etag, _)) = &cached {
        req = req.header(IF_NONE_MATCH, etag.clone());
    }
    if let Some(b) = &body {
        req = req.json(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    if status.as_u16() == 304 {
        if let Some((_, data)) = cached {
            return Ok(data);
        }
    }
    if status.as_u16() == 204 {
        return Ok(Value::Null);
    }
    let etag = res
        .headers()
        .get(ETAG)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let data: Value = res.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = data
            .get("message")
            .and_then(|m| m.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("GitHub request failed ({})", status.as_u16()));
        return Err(msg);
    }
    if is_get {
        if let Some(e) = etag {
            st.etag.lock().unwrap().insert(path.to_string(), (e, data.clone()));
        }
    }
    Ok(data)
}

// ── mappers ──────────────────────────────────────────────────────────────────
fn map_user(u: &Value) -> Value {
    if u.is_object() && u.get("login").is_some() {
        json!({
            "login": u.get("login").cloned().unwrap_or(Value::Null),
            "avatarUrl": u.get("avatar_url").cloned().unwrap_or(Value::Null),
        })
    } else {
        Value::Null
    }
}

fn map_pr(p: &Value) -> Value {
    let merged = p.get("merged").and_then(Value::as_bool).unwrap_or(false)
        || p.get("merged_at").map(|m| !m.is_null()).unwrap_or(false);
    json!({
        "number": p.get("number").cloned().unwrap_or(Value::Null),
        "title": p.get("title").cloned().unwrap_or(Value::Null),
        "state": if p.get("state").and_then(Value::as_str) == Some("closed") { "closed" } else { "open" },
        "draft": p.get("draft").and_then(Value::as_bool).unwrap_or(false),
        "merged": merged,
        "author": map_user(p.get("user").unwrap_or(&Value::Null)),
        "base": p.get("base").and_then(|b| b.get("ref")).cloned().unwrap_or(Value::Null),
        "head": p.get("head").and_then(|h| h.get("ref")).cloned().unwrap_or(Value::Null),
        "comments": p.get("comments").cloned().unwrap_or(json!(0)),
        "createdAt": p.get("created_at").cloned().unwrap_or(Value::Null),
        "updatedAt": p.get("updated_at").cloned().unwrap_or(Value::Null),
        "url": p.get("html_url").cloned().unwrap_or(Value::Null),
    })
}

fn collab_role(c: &Value) -> String {
    if let Some(r) = c.get("role_name").and_then(Value::as_str) {
        if !r.is_empty() {
            return r.to_string();
        }
    }
    let perms = c.get("permissions");
    let has = |k: &str| perms.and_then(|p| p.get(k)).and_then(Value::as_bool).unwrap_or(false);
    if has("admin") {
        "admin".into()
    } else if has("push") {
        "write".into()
    } else {
        "read".into()
    }
}

// ── status / token ───────────────────────────────────────────────────────────
async fn fetch_status(http: &Client) -> Value {
    let Some(token) = secrets::get_token() else {
        return json!({ "connected": false });
    };
    let res = http
        .get(format!("{API}/user"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header(ACCEPT, "application/vnd.github+json")
        .header(USER_AGENT, "OpenGit")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => {
            let u: Value = r.json().await.unwrap_or(Value::Null);
            json!({
                "connected": true,
                "login": u.get("login").cloned().unwrap_or(Value::Null),
                "avatarUrl": u.get("avatar_url").cloned().unwrap_or(Value::Null),
            })
        }
        Ok(r) => json!({ "connected": false, "reason": format!("GitHub request failed ({})", r.status().as_u16()) }),
        Err(e) => json!({ "connected": false, "reason": e.to_string() }),
    }
}

async fn set_token(http: &Client, token: &str) -> Value {
    secrets::set_token(token);
    let s = fetch_status(http).await;
    if s.get("connected").and_then(Value::as_bool) != Some(true) {
        secrets::clear_token(); // reject a bad token rather than keep it
    }
    s
}

// ── OAuth Device Flow ────────────────────────────────────────────────────────
async fn device_start(http: &Client, app: &AppHandle) -> Value {
    let cid = client_id();
    if cid.is_empty() {
        return json!({ "error": "GitHub login isn't configured. Set OPENGIT_GH_CLIENT_ID to your OAuth App's client id, or sign in with a token." });
    }
    let res = http
        .post("https://github.com/login/device/code")
        .header(ACCEPT, "application/json")
        .json(&json!({ "client_id": cid, "scope": OAUTH_SCOPE }))
        .send()
        .await;
    let data: Value = match res {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => return json!({ "error": e.to_string() }),
    };
    let device_code = data.get("device_code").and_then(Value::as_str);
    let user_code = data.get("user_code").and_then(Value::as_str);
    let verification_uri = data.get("verification_uri").and_then(Value::as_str);
    let (Some(device_code), Some(user_code), Some(verification_uri)) =
        (device_code, user_code, verification_uri)
    else {
        let msg = data
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Could not start GitHub login.");
        return json!({ "error": msg });
    };

    let _ = app.opener().open_url(verification_uri, None::<&str>);

    // Poll for the token in the background, then emit gh:auth.
    let http2 = http.clone();
    let app2 = app.clone();
    let device_code = device_code.to_string();
    let interval = data.get("interval").and_then(Value::as_u64).unwrap_or(5);
    let cid2 = cid.clone();
    tauri::async_runtime::spawn(async move {
        poll_device_token(&http2, &app2, &cid2, &device_code, interval).await;
    });

    json!({
        "userCode": user_code,
        "verificationUri": verification_uri,
        "expiresIn": data.get("expires_in").and_then(Value::as_u64).unwrap_or(900),
    })
}

async fn poll_device_token(http: &Client, app: &AppHandle, cid: &str, device_code: &str, interval: u64) {
    let mut wait = interval.max(5) * 1000;
    loop {
        tokio::time::sleep(Duration::from_millis(wait)).await;
        let res = http
            .post("https://github.com/login/oauth/access_token")
            .header(ACCEPT, "application/json")
            .json(&json!({
                "client_id": cid,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            }))
            .send()
            .await;
        let data: Value = match res {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => Value::Null,
        };
        if let Some(token) = data.get("access_token").and_then(Value::as_str) {
            secrets::set_token(token);
            let _ = app.emit("gh:auth", fetch_status(http).await);
            return;
        }
        match data.get("error").and_then(Value::as_str) {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                wait += 5000;
                continue;
            }
            other => {
                let reason = other.unwrap_or("Login failed.");
                let _ = app.emit("gh:auth", json!({ "connected": false, "reason": reason }));
                return;
            }
        }
    }
}

// ── operations ───────────────────────────────────────────────────────────────
async fn list_prs(st: &AppState) -> Result<Value, String> {
    let (owner, repo) = gh_context(st).await?;
    let raw = gh_fetch(
        st,
        &format!("/repos/{owner}/{repo}/pulls?state=all&per_page=50&sort=updated&direction=desc"),
        Method::GET,
        None,
    )
    .await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(map_pr).collect()).unwrap_or_default()))
}

async fn get_pr(st: &AppState, n: i64) -> Result<Value, String> {
    let (owner, repo) = gh_context(st).await?;
    let base = format!("/repos/{owner}/{repo}");
    let pr = gh_fetch(st, &format!("{base}/pulls/{n}"), Method::GET, None).await?;
    let head_sha = pr
        .get("head")
        .and_then(|h| h.get("sha"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    // Fetch files / comments / reviews / checks concurrently (the old Promise.all).
    let files_url = format!("{base}/pulls/{n}/files?per_page=100");
    let comments_url = format!("{base}/issues/{n}/comments?per_page=100");
    let reviews_url = format!("{base}/pulls/{n}/reviews?per_page=100");
    let checks_url = format!("{base}/commits/{head_sha}/check-runs");
    let (files, comments, reviews, checks_res) = tokio::join!(
        gh_fetch(st, &files_url, Method::GET, None),
        gh_fetch(st, &comments_url, Method::GET, None),
        gh_fetch(st, &reviews_url, Method::GET, None),
        gh_fetch(st, &checks_url, Method::GET, None),
    );
    let files = files?;
    let comments = comments?;
    let reviews = reviews?;
    let checks = match checks_res {
        Ok(cr) => cr
            .get("check_runs")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .map(|c| json!({
                        "name": c.get("name").cloned().unwrap_or(Value::Null),
                        "status": c.get("status").cloned().unwrap_or(Value::Null),
                        "conclusion": c.get("conclusion").cloned().unwrap_or(Value::Null),
                    }))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        Err(_) => vec![],
    };

    let files_out: Vec<Value> = files.as_array().map(|a| a.iter().map(|f| json!({
        "path": f.get("filename").cloned().unwrap_or(Value::Null),
        "status": f.get("status").cloned().unwrap_or(Value::Null),
        "additions": f.get("additions").cloned().unwrap_or(json!(0)),
        "deletions": f.get("deletions").cloned().unwrap_or(json!(0)),
        "patch": f.get("patch").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default();

    let comments_out: Vec<Value> = comments.as_array().map(|a| a.iter().map(|c| json!({
        "id": c.get("id").cloned().unwrap_or(Value::Null),
        "author": map_user(c.get("user").unwrap_or(&Value::Null)),
        "body": c.get("body").cloned().unwrap_or(Value::Null),
        "createdAt": c.get("created_at").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default();

    let reviews_out: Vec<Value> = reviews.as_array().map(|a| a.iter().map(|r| json!({
        "id": r.get("id").cloned().unwrap_or(Value::Null),
        "author": map_user(r.get("user").unwrap_or(&Value::Null)),
        "state": r.get("state").cloned().unwrap_or(Value::Null),
        "body": r.get("body").cloned().unwrap_or(Value::Null),
        "submittedAt": r.get("submitted_at").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default();

    let mut detail = map_pr(&pr);
    let obj = detail.as_object_mut().unwrap();
    obj.insert("body".into(), pr.get("body").cloned().unwrap_or(json!("")));
    obj.insert("mergeable".into(), pr.get("mergeable").cloned().unwrap_or(Value::Null));
    obj.insert("files".into(), Value::Array(files_out));
    obj.insert("comments_list".into(), Value::Array(comments_out));
    obj.insert("reviews".into(), Value::Array(reviews_out));
    obj.insert("checks".into(), Value::Array(checks));
    Ok(detail)
}

async fn list_collaborators(st: &AppState) -> Result<Value, String> {
    let (owner, repo) = gh_context(st).await?;
    let raw = gh_fetch(st, &format!("/repos/{owner}/{repo}/collaborators?per_page=100"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|c| json!({
        "login": c.get("login").cloned().unwrap_or(Value::Null),
        "avatarUrl": c.get("avatar_url").cloned().unwrap_or(Value::Null),
        "role": collab_role(c),
        "url": c.get("html_url").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default()))
}

async fn list_issues(st: &AppState) -> Result<Value, String> {
    let (owner, repo) = gh_context(st).await?;
    let raw = gh_fetch(st, &format!("/repos/{owner}/{repo}/issues?state=all&per_page=50&sort=updated"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter()
        .filter(|i| i.get("pull_request").is_none()) // GitHub lists PRs as issues too
        .map(|i| json!({
            "number": i.get("number").cloned().unwrap_or(Value::Null),
            "title": i.get("title").cloned().unwrap_or(Value::Null),
            "state": if i.get("state").and_then(Value::as_str) == Some("closed") { "closed" } else { "open" },
            "author": map_user(i.get("user").unwrap_or(&Value::Null)),
            "comments": i.get("comments").cloned().unwrap_or(json!(0)),
            "createdAt": i.get("created_at").cloned().unwrap_or(Value::Null),
            "url": i.get("html_url").cloned().unwrap_or(Value::Null),
        })).collect()).unwrap_or_default()))
}

async fn list_my_repos(st: &AppState) -> Result<Value, String> {
    let raw = gh_fetch(
        st,
        "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        Method::GET,
        None,
    )
    .await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|r| json!({
        "fullName": r.get("full_name").cloned().unwrap_or(Value::Null),
        "name": r.get("name").cloned().unwrap_or(Value::Null),
        "owner": r.get("owner").and_then(|o| o.get("login")).cloned().unwrap_or(Value::Null),
        "private": r.get("private").and_then(Value::as_bool).unwrap_or(false),
        "cloneUrl": r.get("clone_url").cloned().unwrap_or(Value::Null),
        "description": r.get("description").cloned().filter(|v| !v.is_null()).unwrap_or(json!("")),
        "updatedAt": r.get("updated_at").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default()))
}

async fn list_remote_branches(st: &AppState) -> Result<Value, String> {
    let (owner, repo) = gh_context(st).await?;
    let raw = gh_fetch(st, &format!("/repos/{owner}/{repo}/branches?per_page=100"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|b| json!({
        "name": b.get("name").cloned().unwrap_or(Value::Null),
        "sha": b.get("commit").and_then(|c| c.get("sha")).cloned().unwrap_or(Value::Null),
        "protected": b.get("protected").and_then(Value::as_bool).unwrap_or(false),
    })).collect()).unwrap_or_default()))
}

async fn merge_pr(st: &AppState, n: i64, method: &str) -> Result<(), String> {
    let (owner, repo) = gh_context(st).await?;
    gh_fetch(st, &format!("/repos/{owner}/{repo}/pulls/{n}/merge"), Method::PUT, Some(json!({ "merge_method": method }))).await?;
    Ok(())
}

async fn close_pr(st: &AppState, n: i64) -> Result<(), String> {
    let (owner, repo) = gh_context(st).await?;
    gh_fetch(st, &format!("/repos/{owner}/{repo}/pulls/{n}"), Method::PATCH, Some(json!({ "state": "closed" }))).await?;
    Ok(())
}

async fn comment_pr(st: &AppState, n: i64, body: &str) -> Result<(), String> {
    let (owner, repo) = gh_context(st).await?;
    gh_fetch(st, &format!("/repos/{owner}/{repo}/issues/{n}/comments"), Method::POST, Some(json!({ "body": body }))).await?;
    Ok(())
}

async fn review_pr(st: &AppState, n: i64, event: &str, body: &str) -> Result<(), String> {
    let (owner, repo) = gh_context(st).await?;
    gh_fetch(st, &format!("/repos/{owner}/{repo}/pulls/{n}/reviews"), Method::POST, Some(json!({ "event": event, "body": body }))).await?;
    Ok(())
}

async fn create_pr(st: &AppState, title: &str, body: &str, head: &str, base: &str, reviewers: Vec<String>) -> Result<(), String> {
    let (owner, repo) = gh_context(st).await?;
    let pr = gh_fetch(st, &format!("/repos/{owner}/{repo}/pulls"), Method::POST, Some(json!({ "title": title, "body": body, "head": head, "base": base }))).await?;
    if !reviewers.is_empty() {
        let n = pr.get("number").and_then(Value::as_i64).unwrap_or(0);
        gh_fetch(st, &format!("/repos/{owner}/{repo}/pulls/{n}/requested_reviewers"), Method::POST, Some(json!({ "reviewers": reviewers }))).await?;
    }
    Ok(())
}

// ── dispatch ─────────────────────────────────────────────────────────────────
fn ok() -> Value {
    json!({})
}
fn act(r: Result<(), String>) -> Value {
    match r {
        Ok(_) => ok(),
        Err(e) => json!({ "error": e }),
    }
}
fn read(r: Result<Value, String>) -> Value {
    match r {
        Ok(v) => v,
        Err(e) => json!({ "error": e }),
    }
}
fn i(args: &[Value], idx: usize) -> i64 {
    args.get(idx).and_then(Value::as_i64).unwrap_or(0)
}
fn s(args: &[Value], idx: usize) -> String {
    args.get(idx).and_then(Value::as_str).unwrap_or("").to_string()
}

pub async fn dispatch(st: &AppState, app: &AppHandle, name: &str, args: Vec<Value>) -> Value {
    match name {
        "tokenStatus" => fetch_status(&st.http).await,
        "setToken" => set_token(&st.http, &s(&args, 0)).await,
        "clearToken" => {
            secrets::clear_token();
            Value::Null
        }
        "deviceStart" => device_start(&st.http, app).await,
        "repoContext" => match gh_context(st).await {
            Ok((owner, repo)) => json!({ "owner": owner, "repo": repo }),
            Err(_) => Value::Null,
        },
        "invalidate" => {
            st.etag.lock().unwrap().clear();
            Value::Null
        }
        "listPRs" => read(list_prs(st).await),
        "getPR" => read(get_pr(st, i(&args, 0)).await),
        "mergePR" => act(merge_pr(st, i(&args, 0), &s(&args, 1)).await),
        "closePR" => act(close_pr(st, i(&args, 0)).await),
        "commentPR" => act(comment_pr(st, i(&args, 0), &s(&args, 1)).await),
        "reviewPR" => act(review_pr(st, i(&args, 0), &s(&args, 1), &s(&args, 2)).await),
        "createPR" => {
            let reviewers: Vec<String> = args
                .get(4)
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            act(create_pr(st, &s(&args, 0), &s(&args, 1), &s(&args, 2), &s(&args, 3), reviewers).await)
        }
        "listCollaborators" => read(list_collaborators(st).await),
        "listIssues" => read(list_issues(st).await),
        "listRemoteBranches" => read(list_remote_branches(st).await),
        "listMyRepos" => read(list_my_repos(st).await),
        _ => json!({ "error": format!("gh:{name} not implemented") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pr_mapping() {
        let p = json!({
            "number": 7, "title": "t", "state": "closed", "merged_at": "2020-01-01",
            "user": { "login": "a", "avatar_url": "u" },
            "base": { "ref": "main" }, "head": { "ref": "feat", "sha": "x" },
            "comments": 3, "created_at": "c", "updated_at": "d", "html_url": "url"
        });
        let m = map_pr(&p);
        assert_eq!(m["number"], 7);
        assert_eq!(m["state"], "closed");
        assert_eq!(m["merged"], true); // from merged_at
        assert_eq!(m["author"]["login"], "a");
        assert_eq!(m["author"]["avatarUrl"], "u");
        assert_eq!(m["base"], "main");
        assert_eq!(m["head"], "feat");
        assert_eq!(m["comments"], 3);
    }

    #[test]
    fn open_pr_default() {
        let p = json!({ "number": 1, "state": "open", "user": null, "base": {"ref":"m"}, "head": {"ref":"h"} });
        let m = map_pr(&p);
        assert_eq!(m["state"], "open");
        assert_eq!(m["merged"], false);
        assert!(m["author"].is_null());
    }

    #[test]
    fn user_null_when_absent() {
        assert!(map_user(&Value::Null).is_null());
        assert_eq!(map_user(&json!({"login":"x","avatar_url":"y"}))["login"], "x");
    }

    #[test]
    fn collaborator_role() {
        assert_eq!(collab_role(&json!({ "role_name": "maintain" })), "maintain");
        assert_eq!(collab_role(&json!({ "permissions": { "admin": true } })), "admin");
        assert_eq!(collab_role(&json!({ "permissions": { "push": true } })), "write");
        assert_eq!(collab_role(&json!({ "permissions": {} })), "read");
    }
}
