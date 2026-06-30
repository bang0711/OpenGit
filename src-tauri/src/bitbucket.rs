// Bitbucket Cloud provider: REST API 2.0, normalized into the same JSON shapes
// the GitHub module returns so the existing PR workspace UI works unchanged. Auth
// is a repo/workspace access token (Bearer), stored per provider in the keychain.
// Routed here by provider.rs when the origin is bitbucket.org.
use crate::provider::{self, Provider};
use crate::{secrets, AppState};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::Method;
use serde_json::{json, Value};
use tauri::AppHandle;

const ACCOUNT: &str = "bitbucket-token";
const API: &str = "https://api.bitbucket.org/2.0";

/// (workspace, repo_slug) for the active Bitbucket repo.
async fn bb_context(st: &AppState) -> Result<(String, String), String> {
    let (provider, _host, path) = provider::active_remote(st).await?;
    if provider != Provider::Bitbucket {
        return Err("Not a Bitbucket repository.".into());
    }
    let (ws, repo) = path.split_once('/').ok_or("Could not parse Bitbucket remote.")?;
    Ok((ws.to_string(), repo.to_string()))
}

async fn bb_fetch(
    st: &AppState,
    path: &str,
    method: Method,
    body: Option<Value>,
) -> Result<Value, String> {
    let token = secrets::get_token_for(ACCOUNT).ok_or("Not connected to Bitbucket.")?;
    let mut req = st
        .http
        .request(method, format!("{API}{path}"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
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
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Bitbucket request failed ({})", status.as_u16()));
        return Err(msg);
    }
    Ok(data)
}

/// Bitbucket list endpoints wrap results in `{ "values": [...] }`.
fn values(v: &Value) -> Vec<Value> {
    v.get("values").and_then(Value::as_array).cloned().unwrap_or_default()
}

// ── mappers ──────────────────────────────────────────────────────────────────
fn map_user(u: &Value) -> Value {
    if u.is_object() {
        let login = u
            .get("nickname")
            .or_else(|| u.get("display_name"))
            .cloned()
            .unwrap_or(Value::Null);
        json!({
            "login": login,
            "avatarUrl": u.get("links").and_then(|l| l.get("avatar")).and_then(|a| a.get("href")).cloned().unwrap_or(Value::Null),
        })
    } else {
        Value::Null
    }
}

fn html_url(v: &Value) -> Value {
    v.get("links").and_then(|l| l.get("html")).and_then(|h| h.get("href")).cloned().unwrap_or(Value::Null)
}

fn map_pr(p: &Value) -> Value {
    let state = p.get("state").and_then(Value::as_str).unwrap_or("OPEN");
    json!({
        "number": p.get("id").cloned().unwrap_or(Value::Null),
        "title": p.get("title").cloned().unwrap_or(Value::Null),
        "state": if state == "OPEN" { "open" } else { "closed" },
        "draft": p.get("draft").and_then(Value::as_bool).unwrap_or(false),
        "merged": state == "MERGED",
        "author": map_user(p.get("author").unwrap_or(&Value::Null)),
        "base": p.get("destination").and_then(|d| d.get("branch")).and_then(|b| b.get("name")).cloned().unwrap_or(Value::Null),
        "head": p.get("source").and_then(|s| s.get("branch")).and_then(|b| b.get("name")).cloned().unwrap_or(Value::Null),
        "comments": p.get("comment_count").cloned().unwrap_or(json!(0)),
        "createdAt": p.get("created_on").cloned().unwrap_or(Value::Null),
        "updatedAt": p.get("updated_on").cloned().unwrap_or(Value::Null),
        "url": html_url(p),
    })
}

// ── token / status ───────────────────────────────────────────────────────────
async fn status(st: &AppState) -> Value {
    let Some(token) = secrets::get_token_for(ACCOUNT) else {
        return json!({ "connected": false });
    };
    let res = st
        .http
        .get(format!("{API}/user"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "OpenGit")
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => {
            let u: Value = r.json().await.unwrap_or(Value::Null);
            json!({
                "connected": true,
                "login": u.get("nickname").or_else(|| u.get("display_name")).cloned().unwrap_or(Value::Null),
                "avatarUrl": u.get("links").and_then(|l| l.get("avatar")).and_then(|a| a.get("href")).cloned().unwrap_or(Value::Null),
            })
        }
        Ok(r) => json!({ "connected": false, "reason": format!("Bitbucket request failed ({})", r.status().as_u16()) }),
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
    let (ws, repo) = bb_context(st).await?;
    let raw = bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests?state=OPEN&state=MERGED&state=DECLINED&pagelen=50"), Method::GET, None).await?;
    Ok(Value::Array(values(&raw).iter().map(map_pr).collect()))
}

async fn get_pr(st: &AppState, n: i64) -> Result<Value, String> {
    let (ws, repo) = bb_context(st).await?;
    let base = format!("/repositories/{ws}/{repo}/pullrequests/{n}");
    let diffstat_url = format!("{base}/diffstat?pagelen=100");
    let comments_url = format!("{base}/comments?pagelen=100");
    let (pr, diffstat, comments) = tokio::join!(
        bb_fetch(st, &base, Method::GET, None),
        bb_fetch(st, &diffstat_url, Method::GET, None),
        bb_fetch(st, &comments_url, Method::GET, None),
    );
    let pr = pr?;

    let files_out: Vec<Value> = diffstat
        .ok()
        .map(|d| values(&d))
        .unwrap_or_default()
        .iter()
        .map(|f| {
            let status = f.get("status").and_then(Value::as_str).unwrap_or("modified");
            let path = f
                .get("new")
                .and_then(|x| x.get("path"))
                .or_else(|| f.get("old").and_then(|x| x.get("path")))
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "path": path,
                "status": match status { "added" => "added", "removed" => "removed", "renamed" => "renamed", _ => "modified" },
                "additions": f.get("lines_added").cloned().unwrap_or(json!(0)),
                "deletions": f.get("lines_removed").cloned().unwrap_or(json!(0)),
                "patch": Value::Null,
            })
        })
        .collect();

    let comments_out: Vec<Value> = comments
        .ok()
        .map(|c| values(&c))
        .unwrap_or_default()
        .iter()
        .filter(|c| c.get("deleted").and_then(Value::as_bool) != Some(true))
        .map(|c| json!({
            "id": c.get("id").cloned().unwrap_or(Value::Null),
            "author": map_user(c.get("user").unwrap_or(&Value::Null)),
            "body": c.get("content").and_then(|x| x.get("raw")).cloned().unwrap_or(Value::Null),
            "createdAt": c.get("created_on").cloned().unwrap_or(Value::Null),
        }))
        .collect();

    let reviews_out: Vec<Value> = pr
        .get("participants")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter(|p| p.get("approved").and_then(Value::as_bool).unwrap_or(false))
                .map(|p| json!({
                    "id": Value::Null,
                    "author": map_user(p.get("user").unwrap_or(&Value::Null)),
                    "state": "APPROVED",
                    "body": "",
                    "submittedAt": Value::Null,
                }))
                .collect()
        })
        .unwrap_or_default();

    let mut detail = map_pr(&pr);
    let obj = detail.as_object_mut().unwrap();
    obj.insert("body".into(), pr.get("description").cloned().unwrap_or(json!("")));
    obj.insert("mergeable".into(), Value::Null);
    obj.insert("files".into(), Value::Array(files_out));
    obj.insert("comments_list".into(), Value::Array(comments_out));
    obj.insert("reviews".into(), Value::Array(reviews_out));
    obj.insert("checks".into(), Value::Array(vec![]));
    Ok(detail)
}

async fn merge_pr(st: &AppState, n: i64) -> Result<(), String> {
    let (ws, repo) = bb_context(st).await?;
    bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests/{n}/merge"), Method::POST, Some(json!({}))).await?;
    Ok(())
}

async fn close_pr(st: &AppState, n: i64) -> Result<(), String> {
    let (ws, repo) = bb_context(st).await?;
    bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests/{n}/decline"), Method::POST, Some(json!({}))).await?;
    Ok(())
}

async fn comment_pr(st: &AppState, n: i64, body: &str) -> Result<(), String> {
    let (ws, repo) = bb_context(st).await?;
    bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests/{n}/comments"), Method::POST, Some(json!({ "content": { "raw": body } }))).await?;
    Ok(())
}

async fn review_pr(st: &AppState, n: i64, event: &str, body: &str) -> Result<(), String> {
    let (ws, repo) = bb_context(st).await?;
    if event == "APPROVE" {
        bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests/{n}/approve"), Method::POST, None).await?;
    } else {
        let text = if body.is_empty() { "Requested changes." } else { body };
        bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests/{n}/comments"), Method::POST, Some(json!({ "content": { "raw": text } }))).await?;
    }
    Ok(())
}

async fn create_pr(st: &AppState, title: &str, body: &str, head: &str, base: &str) -> Result<(), String> {
    let (ws, repo) = bb_context(st).await?;
    bb_fetch(st, &format!("/repositories/{ws}/{repo}/pullrequests"), Method::POST, Some(json!({
        "title": title,
        "description": body,
        "source": { "branch": { "name": head } },
        "destination": { "branch": { "name": base } },
    }))).await?;
    Ok(())
}

async fn list_collaborators(st: &AppState) -> Result<Value, String> {
    let (ws, _repo) = bb_context(st).await?;
    let raw = bb_fetch(st, &format!("/workspaces/{ws}/members?pagelen=100"), Method::GET, None).await?;
    Ok(Value::Array(values(&raw).iter().map(|m| {
        let user = m.get("user").unwrap_or(&Value::Null);
        json!({
            "login": user.get("nickname").or_else(|| user.get("display_name")).cloned().unwrap_or(Value::Null),
            "avatarUrl": user.get("links").and_then(|l| l.get("avatar")).and_then(|a| a.get("href")).cloned().unwrap_or(Value::Null),
            "role": "member",
            "url": Value::Null,
        })
    }).collect()))
}

async fn list_issues(st: &AppState) -> Result<Value, String> {
    let (ws, repo) = bb_context(st).await?;
    let raw = bb_fetch(st, &format!("/repositories/{ws}/{repo}/issues?pagelen=50&sort=-updated_on"), Method::GET, None).await?;
    Ok(Value::Array(values(&raw).iter().map(|i| json!({
        "number": i.get("id").cloned().unwrap_or(Value::Null),
        "title": i.get("title").cloned().unwrap_or(Value::Null),
        "state": match i.get("state").and_then(Value::as_str) {
            Some("resolved") | Some("closed") | Some("invalid") | Some("duplicate") | Some("wontfix") => "closed",
            _ => "open",
        },
        "author": map_user(i.get("reporter").unwrap_or(&Value::Null)),
        "comments": i.get("comment_count").cloned().unwrap_or(json!(0)),
        "createdAt": i.get("created_on").cloned().unwrap_or(Value::Null),
        "url": html_url(i),
    })).collect()))
}

async fn list_remote_branches(st: &AppState) -> Result<Value, String> {
    let (ws, repo) = bb_context(st).await?;
    let raw = bb_fetch(st, &format!("/repositories/{ws}/{repo}/refs/branches?pagelen=100"), Method::GET, None).await?;
    Ok(Value::Array(values(&raw).iter().map(|b| json!({
        "name": b.get("name").cloned().unwrap_or(Value::Null),
        "sha": b.get("target").and_then(|t| t.get("hash")).cloned().unwrap_or(Value::Null),
        "protected": false,
    })).collect()))
}

async fn list_my_repos(st: &AppState) -> Result<Value, String> {
    let raw = bb_fetch(st, "/repositories?role=member&pagelen=100&sort=-updated_on", Method::GET, None).await?;
    Ok(Value::Array(values(&raw).iter().map(|r| {
        let clone_url = r
            .get("links")
            .and_then(|l| l.get("clone"))
            .and_then(Value::as_array)
            .and_then(|a| a.iter().find(|c| c.get("name").and_then(Value::as_str) == Some("https")))
            .and_then(|c| c.get("href"))
            .cloned()
            .unwrap_or(Value::Null);
        json!({
            "fullName": r.get("full_name").cloned().unwrap_or(Value::Null),
            "name": r.get("name").cloned().unwrap_or(Value::Null),
            "owner": r.get("workspace").and_then(|w| w.get("slug")).cloned().unwrap_or(Value::Null),
            "private": r.get("is_private").and_then(Value::as_bool).unwrap_or(true),
            "cloneUrl": clone_url,
            "description": r.get("description").cloned().filter(|v| !v.is_null()).unwrap_or(json!("")),
            "updatedAt": r.get("updated_on").cloned().unwrap_or(Value::Null),
        })
    }).collect()))
}

// ── dispatch ─────────────────────────────────────────────────────────────────
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
        "deviceStart" => json!({ "error": "Bitbucket login uses an access token — paste one with the token option." }),
        "repoContext" => match bb_context(st).await {
            Ok((owner, repo)) => json!({ "owner": owner, "repo": repo }),
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
        "createPR" => act(create_pr(st, &s(&args, 0), &s(&args, 1), &s(&args, 2), &s(&args, 3)).await),
        "listCollaborators" => read(list_collaborators(st).await),
        "listIssues" => read(list_issues(st).await),
        "listRemoteBranches" => read(list_remote_branches(st).await),
        "listMyRepos" => read(list_my_repos(st).await),
        _ => json!({ "error": format!("bitbucket:{name} not implemented") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pr_mapping() {
        let p = json!({
            "id": 9, "title": "t", "state": "MERGED",
            "author": { "nickname": "a", "links": { "avatar": { "href": "u" } } },
            "destination": { "branch": { "name": "main" } },
            "source": { "branch": { "name": "feat" } },
            "comment_count": 1, "created_on": "c", "updated_on": "d",
            "links": { "html": { "href": "url" } }
        });
        let m = map_pr(&p);
        assert_eq!(m["number"], 9);
        assert_eq!(m["state"], "closed");
        assert_eq!(m["merged"], true);
        assert_eq!(m["author"]["login"], "a");
        assert_eq!(m["base"], "main");
        assert_eq!(m["head"], "feat");
        assert_eq!(m["url"], "url");
    }
}
