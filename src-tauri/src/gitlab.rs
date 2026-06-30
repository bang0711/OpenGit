// GitLab provider: GitLab REST API v4, normalized into the SAME JSON shapes the
// GitHub module returns (shared/types.ts), so the existing PR workspace UI works
// unchanged. Auth is a personal access token (PRIVATE-TOKEN header), stored per
// provider in the OS keychain. Routed here by provider.rs when the active repo's
// origin is gitlab.com.
use crate::provider::{self, Provider};
use crate::{secrets, AppState};
use reqwest::header::{ACCEPT, USER_AGENT};
use reqwest::Method;
use serde_json::{json, Value};
use tauri::AppHandle;

const ACCOUNT: &str = "gitlab-token";

/// Percent-encode a project path ("group/sub/proj") for use as a project id.
fn enc(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// (host, url-encoded project id) for the active GitLab repo.
async fn gl_context(st: &AppState) -> Result<(String, String), String> {
    let (provider, host, path) = provider::active_remote(st).await?;
    if provider != Provider::GitLab {
        return Err("Not a GitLab repository.".into());
    }
    Ok((host, enc(&path)))
}

async fn gl_fetch(
    st: &AppState,
    host: &str,
    path: &str,
    method: Method,
    body: Option<Value>,
) -> Result<Value, String> {
    let token = secrets::get_token_for(ACCOUNT).ok_or("Not connected to GitLab.")?;
    let mut req = st
        .http
        .request(method, format!("https://{host}/api/v4{path}"))
        .header("PRIVATE-TOKEN", token)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "OpenGit");
    if let Some(b) = &body {
        req = req.json(b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    if status.as_u16() == 204 {
        return Ok(Value::Null);
    }
    let data: Value = res.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = data
            .get("message")
            .and_then(Value::as_str)
            .or_else(|| data.get("error").and_then(Value::as_str))
            .map(str::to_string)
            .unwrap_or_else(|| format!("GitLab request failed ({})", status.as_u16()));
        return Err(msg);
    }
    Ok(data)
}

// ── mappers (→ GitHub-shaped values) ─────────────────────────────────────────
fn map_user(u: &Value) -> Value {
    if u.is_object() && u.get("username").is_some() {
        json!({
            "login": u.get("username").cloned().unwrap_or(Value::Null),
            "avatarUrl": u.get("avatar_url").cloned().unwrap_or(Value::Null),
        })
    } else {
        Value::Null
    }
}

fn map_mr(m: &Value) -> Value {
    let state = m.get("state").and_then(Value::as_str).unwrap_or("opened");
    json!({
        "number": m.get("iid").cloned().unwrap_or(Value::Null),
        "title": m.get("title").cloned().unwrap_or(Value::Null),
        "state": if state == "opened" { "open" } else { "closed" },
        "draft": m.get("draft").and_then(Value::as_bool)
            .or_else(|| m.get("work_in_progress").and_then(Value::as_bool))
            .unwrap_or(false),
        "merged": state == "merged",
        "author": map_user(m.get("author").unwrap_or(&Value::Null)),
        "base": m.get("target_branch").cloned().unwrap_or(Value::Null),
        "head": m.get("source_branch").cloned().unwrap_or(Value::Null),
        "comments": m.get("user_notes_count").cloned().unwrap_or(json!(0)),
        "createdAt": m.get("created_at").cloned().unwrap_or(Value::Null),
        "updatedAt": m.get("updated_at").cloned().unwrap_or(Value::Null),
        "url": m.get("web_url").cloned().unwrap_or(Value::Null),
    })
}

fn access_role(level: i64) -> &'static str {
    match level {
        50 => "owner",
        40 => "maintainer",
        30 => "developer",
        20 => "reporter",
        _ => "guest",
    }
}

// ── token / status ───────────────────────────────────────────────────────────
async fn status(st: &AppState) -> Value {
    let Some(token) = secrets::get_token_for(ACCOUNT) else {
        return json!({ "connected": false });
    };
    // Use the active repo's host (self-managed support); default gitlab.com.
    let host = provider::active_remote(st)
        .await
        .map(|(_, h, _)| h)
        .unwrap_or_else(|_| "gitlab.com".into());
    let res = st
        .http
        .get(format!("https://{host}/api/v4/user"))
        .header("PRIVATE-TOKEN", token)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "OpenGit")
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => {
            let u: Value = r.json().await.unwrap_or(Value::Null);
            json!({
                "connected": true,
                "login": u.get("username").cloned().unwrap_or(Value::Null),
                "avatarUrl": u.get("avatar_url").cloned().unwrap_or(Value::Null),
            })
        }
        Ok(r) => json!({ "connected": false, "reason": format!("GitLab request failed ({})", r.status().as_u16()) }),
        Err(e) => json!({ "connected": false, "reason": e.to_string() }),
    }
}

async fn set_token(st: &AppState, token: &str) -> Value {
    secrets::set_token_for(ACCOUNT, token);
    let s = status(st).await;
    if s.get("connected").and_then(Value::as_bool) != Some(true) {
        secrets::clear_token_for(ACCOUNT);
    }
    s
}

// ── operations ───────────────────────────────────────────────────────────────
async fn list_prs(st: &AppState) -> Result<Value, String> {
    let (host, id) = gl_context(st).await?;
    let raw = gl_fetch(st, &host, &format!("/projects/{id}/merge_requests?state=all&order_by=updated_at&per_page=50"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(map_mr).collect()).unwrap_or_default()))
}

async fn get_pr(st: &AppState, n: i64) -> Result<Value, String> {
    let (host, id) = gl_context(st).await?;
    let base = format!("/projects/{id}/merge_requests/{n}");
    // Bind URLs to locals so they outlive the join! (which drops statement
    // temporaries before polling).
    let changes_url = format!("{base}/changes");
    let notes_url = format!("{base}/notes?per_page=100&sort=asc");
    let approvals_url = format!("{base}/approvals");
    let (mr, changes, notes, approvals) = tokio::join!(
        gl_fetch(st, &host, &base, Method::GET, None),
        gl_fetch(st, &host, &changes_url, Method::GET, None),
        gl_fetch(st, &host, &notes_url, Method::GET, None),
        gl_fetch(st, &host, &approvals_url, Method::GET, None),
    );
    let mr = mr?;

    let files_out: Vec<Value> = changes
        .ok()
        .and_then(|c| c.get("changes").and_then(Value::as_array).cloned())
        .map(|a| {
            a.iter()
                .map(|f| {
                    let status = if f.get("new_file").and_then(Value::as_bool).unwrap_or(false) {
                        "added"
                    } else if f.get("deleted_file").and_then(Value::as_bool).unwrap_or(false) {
                        "removed"
                    } else if f.get("renamed_file").and_then(Value::as_bool).unwrap_or(false) {
                        "renamed"
                    } else {
                        "modified"
                    };
                    json!({
                        "path": f.get("new_path").cloned().unwrap_or(Value::Null),
                        "status": status,
                        "additions": 0,
                        "deletions": 0,
                        "patch": f.get("diff").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let comments_out: Vec<Value> = notes
        .ok()
        .and_then(|n| n.as_array().cloned())
        .map(|a| {
            a.iter()
                .filter(|c| !c.get("system").and_then(Value::as_bool).unwrap_or(false))
                .map(|c| json!({
                    "id": c.get("id").cloned().unwrap_or(Value::Null),
                    "author": map_user(c.get("author").unwrap_or(&Value::Null)),
                    "body": c.get("body").cloned().unwrap_or(Value::Null),
                    "createdAt": c.get("created_at").cloned().unwrap_or(Value::Null),
                }))
                .collect()
        })
        .unwrap_or_default();

    let reviews_out: Vec<Value> = approvals
        .ok()
        .and_then(|ap| ap.get("approved_by").and_then(Value::as_array).cloned())
        .map(|a| {
            a.iter()
                .map(|x| json!({
                    "id": Value::Null,
                    "author": map_user(x.get("user").unwrap_or(&Value::Null)),
                    "state": "APPROVED",
                    "body": "",
                    "submittedAt": Value::Null,
                }))
                .collect()
        })
        .unwrap_or_default();

    let mut detail = map_mr(&mr);
    let obj = detail.as_object_mut().unwrap();
    obj.insert("body".into(), mr.get("description").cloned().unwrap_or(json!("")));
    obj.insert("mergeable".into(), Value::Null);
    obj.insert("files".into(), Value::Array(files_out));
    obj.insert("comments_list".into(), Value::Array(comments_out));
    obj.insert("reviews".into(), Value::Array(reviews_out));
    obj.insert("checks".into(), Value::Array(vec![]));
    Ok(detail)
}

async fn merge_pr(st: &AppState, n: i64) -> Result<(), String> {
    let (host, id) = gl_context(st).await?;
    gl_fetch(st, &host, &format!("/projects/{id}/merge_requests/{n}/merge"), Method::PUT, Some(json!({}))).await?;
    Ok(())
}

async fn close_pr(st: &AppState, n: i64) -> Result<(), String> {
    let (host, id) = gl_context(st).await?;
    gl_fetch(st, &host, &format!("/projects/{id}/merge_requests/{n}"), Method::PUT, Some(json!({ "state_event": "close" }))).await?;
    Ok(())
}

async fn comment_pr(st: &AppState, n: i64, body: &str) -> Result<(), String> {
    let (host, id) = gl_context(st).await?;
    gl_fetch(st, &host, &format!("/projects/{id}/merge_requests/{n}/notes"), Method::POST, Some(json!({ "body": body }))).await?;
    Ok(())
}

async fn review_pr(st: &AppState, n: i64, event: &str, body: &str) -> Result<(), String> {
    let (host, id) = gl_context(st).await?;
    if event == "APPROVE" {
        gl_fetch(st, &host, &format!("/projects/{id}/merge_requests/{n}/approve"), Method::POST, None).await?;
    } else {
        // REQUEST_CHANGES / COMMENT → leave a note (GitLab has no review state).
        let text = if body.is_empty() { "Requested changes." } else { body };
        gl_fetch(st, &host, &format!("/projects/{id}/merge_requests/{n}/notes"), Method::POST, Some(json!({ "body": text }))).await?;
    }
    Ok(())
}

async fn create_pr(st: &AppState, title: &str, body: &str, head: &str, base: &str, draft: bool) -> Result<(), String> {
    let (host, id) = gl_context(st).await?;
    let title = if draft { format!("Draft: {title}") } else { title.to_string() };
    gl_fetch(st, &host, &format!("/projects/{id}/merge_requests"), Method::POST, Some(json!({
        "source_branch": head, "target_branch": base, "title": title, "description": body,
    }))).await?;
    Ok(())
}

async fn list_collaborators(st: &AppState) -> Result<Value, String> {
    let (host, id) = gl_context(st).await?;
    let raw = gl_fetch(st, &host, &format!("/projects/{id}/members/all?per_page=100"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|c| json!({
        "login": c.get("username").cloned().unwrap_or(Value::Null),
        "avatarUrl": c.get("avatar_url").cloned().unwrap_or(Value::Null),
        "role": access_role(c.get("access_level").and_then(Value::as_i64).unwrap_or(10)),
        "url": c.get("web_url").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default()))
}

async fn list_issues(st: &AppState) -> Result<Value, String> {
    let (host, id) = gl_context(st).await?;
    let raw = gl_fetch(st, &host, &format!("/projects/{id}/issues?scope=all&per_page=50&order_by=updated_at"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|i| json!({
        "number": i.get("iid").cloned().unwrap_or(Value::Null),
        "title": i.get("title").cloned().unwrap_or(Value::Null),
        "state": if i.get("state").and_then(Value::as_str) == Some("opened") { "open" } else { "closed" },
        "author": map_user(i.get("author").unwrap_or(&Value::Null)),
        "comments": i.get("user_notes_count").cloned().unwrap_or(json!(0)),
        "createdAt": i.get("created_at").cloned().unwrap_or(Value::Null),
        "url": i.get("web_url").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default()))
}

async fn list_remote_branches(st: &AppState) -> Result<Value, String> {
    let (host, id) = gl_context(st).await?;
    let raw = gl_fetch(st, &host, &format!("/projects/{id}/repository/branches?per_page=100"), Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|b| json!({
        "name": b.get("name").cloned().unwrap_or(Value::Null),
        "sha": b.get("commit").and_then(|c| c.get("id")).cloned().unwrap_or(Value::Null),
        "protected": b.get("protected").and_then(Value::as_bool).unwrap_or(false),
    })).collect()).unwrap_or_default()))
}

async fn list_my_repos(st: &AppState) -> Result<Value, String> {
    let host = provider::active_remote(st).await.map(|(_, h, _)| h).unwrap_or_else(|_| "gitlab.com".into());
    let raw = gl_fetch(st, &host, "/projects?membership=true&per_page=100&order_by=last_activity_at", Method::GET, None).await?;
    Ok(Value::Array(raw.as_array().map(|a| a.iter().map(|r| json!({
        "fullName": r.get("path_with_namespace").cloned().unwrap_or(Value::Null),
        "name": r.get("path").cloned().unwrap_or(Value::Null),
        "owner": r.get("namespace").and_then(|n| n.get("path")).cloned().unwrap_or(Value::Null),
        "private": r.get("visibility").and_then(Value::as_str).map(|v| v != "public").unwrap_or(true),
        "cloneUrl": r.get("http_url_to_repo").cloned().unwrap_or(Value::Null),
        "description": r.get("description").cloned().filter(|v| !v.is_null()).unwrap_or(json!("")),
        "updatedAt": r.get("last_activity_at").cloned().unwrap_or(Value::Null),
    })).collect()).unwrap_or_default()))
}

// ── dispatch (same op names as github.rs) ────────────────────────────────────
fn act(r: Result<(), String>) -> Value {
    match r {
        Ok(_) => json!({}),
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

pub async fn dispatch(st: &AppState, _app: &AppHandle, name: &str, args: Vec<Value>) -> Value {
    match name {
        "tokenStatus" => status(st).await,
        "setToken" => set_token(st, &s(&args, 0)).await,
        "clearToken" => {
            secrets::clear_token_for(ACCOUNT);
            Value::Null
        }
        "deviceStart" => json!({ "error": "GitLab login uses a personal access token — paste one with the token option." }),
        "repoContext" => match provider::active_remote(st).await {
            Ok((_, _, path)) => {
                let (owner, repo) = path.rsplit_once('/').unwrap_or(("", path.as_str()));
                json!({ "owner": owner, "repo": repo })
            }
            Err(_) => Value::Null,
        },
        "invalidate" => {
            st.etag.lock().unwrap().clear();
            Value::Null
        }
        "listPRs" => read(list_prs(st).await),
        "getPR" => read(get_pr(st, i(&args, 0)).await),
        "mergePR" => act(merge_pr(st, i(&args, 0)).await),
        "closePR" => act(close_pr(st, i(&args, 0)).await),
        "commentPR" => act(comment_pr(st, i(&args, 0), &s(&args, 1)).await),
        "reviewPR" => act(review_pr(st, i(&args, 0), &s(&args, 1), &s(&args, 2)).await),
        "createPR" => {
            let draft = args.get(5).and_then(Value::as_bool).unwrap_or(false);
            act(create_pr(st, &s(&args, 0), &s(&args, 1), &s(&args, 2), &s(&args, 3), draft).await)
        }
        "listCollaborators" => read(list_collaborators(st).await),
        "listIssues" => read(list_issues(st).await),
        "listRemoteBranches" => read(list_remote_branches(st).await),
        "listMyRepos" => read(list_my_repos(st).await),
        _ => json!({ "error": format!("gitlab:{name} not implemented") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mr_mapping() {
        let m = json!({
            "iid": 5, "title": "t", "state": "merged",
            "author": { "username": "a", "avatar_url": "u" },
            "target_branch": "main", "source_branch": "feat",
            "user_notes_count": 2, "created_at": "c", "updated_at": "d", "web_url": "url"
        });
        let v = map_mr(&m);
        assert_eq!(v["number"], 5);
        assert_eq!(v["state"], "closed");
        assert_eq!(v["merged"], true);
        assert_eq!(v["author"]["login"], "a");
        assert_eq!(v["base"], "main");
        assert_eq!(v["head"], "feat");
    }

    #[test]
    fn encodes_path() {
        assert_eq!(enc("group/sub/proj"), "group%2Fsub%2Fproj");
    }

    #[test]
    fn roles() {
        assert_eq!(access_role(50), "owner");
        assert_eq!(access_role(30), "developer");
        assert_eq!(access_role(10), "guest");
    }
}
