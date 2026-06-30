// Azure DevOps provider: Git REST API (api-version 7.1), normalized into the same
// JSON shapes the GitHub module returns. Auth is a Personal Access Token sent as
// HTTP Basic (empty username). Routed here by provider.rs when the origin host is
// dev.azure.com / *.visualstudio.com.
//
// Azure's model (org → project → repo, comment "threads", work items instead of
// issues) diverges most; a few surfaces are intentionally simplified: issues +
// collaborators return empty (work items are a separate product), and non-approve
// reviews post a comment (Azure votes need the reviewer's user id).
use crate::provider::{self, Provider};
use crate::{secrets, AppState};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::Method;
use serde_json::{json, Value};
use tauri::AppHandle;

const ACCOUNT: &str = "azure-token";

struct Ctx {
    base: String, // https://dev.azure.com/{org}  (or https://{org}.visualstudio.com)
    project: String,
    repo: String,
}

/// Resolve org base URL + project + repo from the active Azure repo's remote.
/// Paths look like "org/project/_git/repo" (dev.azure.com) or "project/_git/repo"
/// (host = {org}.visualstudio.com).
async fn az_context(st: &AppState) -> Result<Ctx, String> {
    let (provider, host, path) = provider::active_remote(st).await?;
    if provider != Provider::Azure {
        return Err("Not an Azure DevOps repository.".into());
    }
    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let git_idx = parts.iter().position(|p| *p == "_git").ok_or("Could not parse Azure remote.")?;
    let repo = parts.get(git_idx + 1).ok_or("Missing repo in remote.")?.to_string();
    let (base, project) = if host.ends_with("visualstudio.com") {
        let org = host.split('.').next().unwrap_or("");
        (format!("https://{org}.visualstudio.com"), parts[..git_idx].join("/"))
    } else {
        let org = parts.first().ok_or("Missing org in remote.")?;
        (format!("https://dev.azure.com/{org}"), parts[1..git_idx].join("/"))
    };
    if project.is_empty() {
        return Err("Missing project in remote.".into());
    }
    Ok(Ctx { base, project, repo })
}

fn auth(token: &str) -> String {
    format!("Basic {}", STANDARD.encode(format!(":{token}")))
}

async fn az_fetch(st: &AppState, url: &str, method: Method, body: Option<Value>) -> Result<Value, String> {
    let token = secrets::get_token_for(ACCOUNT).ok_or("Not connected to Azure DevOps.")?;
    let sep = if url.contains('?') { '&' } else { '?' };
    let full = format!("{url}{sep}api-version=7.1");
    let mut req = st
        .http
        .request(method, full)
        .header(AUTHORIZATION, auth(&token))
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
            .map(str::to_string)
            .unwrap_or_else(|| format!("Azure request failed ({})", status.as_u16()));
        return Err(msg);
    }
    Ok(data)
}

fn vals(v: &Value) -> Vec<Value> {
    v.get("value").and_then(Value::as_array).cloned().unwrap_or_default()
}

fn strip_ref(r: Option<&str>) -> Value {
    r.map(|s| s.trim_start_matches("refs/heads/").to_string())
        .map(Value::String)
        .unwrap_or(Value::Null)
}

fn map_user(u: &Value) -> Value {
    if u.is_object() {
        json!({
            "login": u.get("displayName").or_else(|| u.get("uniqueName")).cloned().unwrap_or(Value::Null),
            "avatarUrl": u.get("_links").and_then(|l| l.get("avatar")).and_then(|a| a.get("href"))
                .or_else(|| u.get("imageUrl")).cloned().unwrap_or(Value::Null),
        })
    } else {
        Value::Null
    }
}

fn map_pr(p: &Value) -> Value {
    let st = p.get("status").and_then(Value::as_str).unwrap_or("active");
    json!({
        "number": p.get("pullRequestId").cloned().unwrap_or(Value::Null),
        "title": p.get("title").cloned().unwrap_or(Value::Null),
        "state": if st == "active" { "open" } else { "closed" },
        "draft": p.get("isDraft").and_then(Value::as_bool).unwrap_or(false),
        "merged": st == "completed",
        "author": map_user(p.get("createdBy").unwrap_or(&Value::Null)),
        "base": strip_ref(p.get("targetRefName").and_then(Value::as_str)),
        "head": strip_ref(p.get("sourceRefName").and_then(Value::as_str)),
        "comments": json!(0),
        "createdAt": p.get("creationDate").cloned().unwrap_or(Value::Null),
        "updatedAt": p.get("creationDate").cloned().unwrap_or(Value::Null),
        "url": Value::Null,
    })
}

// ── token / status ───────────────────────────────────────────────────────────
async fn status(st: &AppState) -> Value {
    let Some(token) = secrets::get_token_for(ACCOUNT) else {
        return json!({ "connected": false });
    };
    // Validate the PAT against the org's profile endpoint.
    let base = az_context(st).await.map(|c| c.base).ok();
    let url = match base {
        Some(b) => format!("{b}/_apis/connectionData"),
        None => return json!({ "connected": false, "reason": "Open an Azure repo to verify the token." }),
    };
    let res = st
        .http
        .get(format!("{url}?api-version=7.1"))
        .header(AUTHORIZATION, auth(&token))
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "OpenGit")
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => {
            let d: Value = r.json().await.unwrap_or(Value::Null);
            let user = d.get("authenticatedUser").cloned().unwrap_or(Value::Null);
            json!({
                "connected": true,
                "login": user.get("providerDisplayName").cloned().unwrap_or(Value::Null),
                "avatarUrl": Value::Null,
            })
        }
        Ok(r) => json!({ "connected": false, "reason": format!("Azure request failed ({})", r.status().as_u16()) }),
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

fn git_base(c: &Ctx) -> String {
    format!("{}/{}/_apis/git/repositories/{}", c.base, c.project, c.repo)
}

// ── operations ───────────────────────────────────────────────────────────────
async fn list_prs(st: &AppState) -> Result<Value, String> {
    let c = az_context(st).await?;
    let raw = az_fetch(st, &format!("{}/pullrequests?searchCriteria.status=all&$top=50", git_base(&c)), Method::GET, None).await?;
    Ok(Value::Array(vals(&raw).iter().map(map_pr).collect()))
}

async fn get_pr(st: &AppState, n: i64) -> Result<Value, String> {
    let c = az_context(st).await?;
    let gb = git_base(&c);
    let pr_url = format!("{gb}/pullrequests/{n}");
    let threads_url = format!("{gb}/pullrequests/{n}/threads");
    let iters_url = format!("{gb}/pullrequests/{n}/iterations");
    let (pr, threads, iters) = tokio::join!(
        az_fetch(st, &pr_url, Method::GET, None),
        az_fetch(st, &threads_url, Method::GET, None),
        az_fetch(st, &iters_url, Method::GET, None),
    );
    let pr = pr?;

    // Files: the changes of the latest iteration.
    let last_iter = iters.ok().map(|i| vals(&i)).unwrap_or_default();
    let files_out: Vec<Value> = if let Some(iter) = last_iter.last() {
        let iid = iter.get("id").and_then(Value::as_i64).unwrap_or(1);
        let changes = az_fetch(st, &format!("{gb}/pullrequests/{n}/iterations/{iid}/changes"), Method::GET, None).await;
        changes
            .ok()
            .and_then(|c| c.get("changeEntries").and_then(Value::as_array).cloned())
            .map(|a| {
                a.iter()
                    .map(|ch| {
                        let kind = ch.get("changeType").and_then(Value::as_str).unwrap_or("edit");
                        json!({
                            "path": ch.get("item").and_then(|i| i.get("path")).cloned().unwrap_or(Value::Null),
                            "status": if kind.contains("add") { "added" } else if kind.contains("delete") { "removed" } else if kind.contains("rename") { "renamed" } else { "modified" },
                            "additions": 0,
                            "deletions": 0,
                            "patch": Value::Null,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };

    // Comments: non-system threads' comments.
    let comments_out: Vec<Value> = threads
        .ok()
        .map(|t| vals(&t))
        .unwrap_or_default()
        .iter()
        .flat_map(|thread| {
            thread
                .get("comments")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|cm| cm.get("commentType").and_then(Value::as_str) != Some("system"))
                .map(|cm| json!({
                    "id": cm.get("id").cloned().unwrap_or(Value::Null),
                    "author": map_user(cm.get("author").unwrap_or(&Value::Null)),
                    "body": cm.get("content").cloned().unwrap_or(Value::Null),
                    "createdAt": cm.get("publishedDate").cloned().unwrap_or(Value::Null),
                }))
                .collect::<Vec<_>>()
        })
        .collect();

    let reviews_out: Vec<Value> = pr
        .get("reviewers")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter(|r| r.get("vote").and_then(Value::as_i64).unwrap_or(0) > 0)
                .map(|r| json!({
                    "id": Value::Null,
                    "author": map_user(r),
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
    let c = az_context(st).await?;
    let gb = git_base(&c);
    // Completing a PR needs the last merge source commit.
    let pr = az_fetch(st, &format!("{gb}/pullrequests/{n}"), Method::GET, None).await?;
    let commit = pr.get("lastMergeSourceCommit").cloned().unwrap_or(Value::Null);
    az_fetch(st, &format!("{gb}/pullrequests/{n}"), Method::PATCH, Some(json!({
        "status": "completed",
        "lastMergeSourceCommit": commit,
    }))).await?;
    Ok(())
}

async fn close_pr(st: &AppState, n: i64) -> Result<(), String> {
    let c = az_context(st).await?;
    az_fetch(st, &format!("{}/pullrequests/{n}", git_base(&c)), Method::PATCH, Some(json!({ "status": "abandoned" }))).await?;
    Ok(())
}

async fn comment_pr(st: &AppState, n: i64, body: &str) -> Result<(), String> {
    let c = az_context(st).await?;
    az_fetch(st, &format!("{}/pullrequests/{n}/threads", git_base(&c)), Method::POST, Some(json!({
        "comments": [{ "parentCommentId": 0, "content": body, "commentType": "text" }],
        "status": "active",
    }))).await?;
    Ok(())
}

async fn review_pr(st: &AppState, n: i64, _event: &str, body: &str) -> Result<(), String> {
    // Azure votes require the reviewer's user id; fall back to a comment thread.
    let text = if body.is_empty() { "Review note." } else { body };
    comment_pr(st, n, text).await
}

async fn create_pr(st: &AppState, title: &str, body: &str, head: &str, base: &str) -> Result<(), String> {
    let c = az_context(st).await?;
    az_fetch(st, &format!("{}/pullrequests", git_base(&c)), Method::POST, Some(json!({
        "sourceRefName": format!("refs/heads/{head}"),
        "targetRefName": format!("refs/heads/{base}"),
        "title": title,
        "description": body,
    }))).await?;
    Ok(())
}

async fn list_remote_branches(st: &AppState) -> Result<Value, String> {
    let c = az_context(st).await?;
    let raw = az_fetch(st, &format!("{}/refs?filter=heads/", git_base(&c)), Method::GET, None).await?;
    Ok(Value::Array(vals(&raw).iter().map(|b| json!({
        "name": strip_ref(b.get("name").and_then(Value::as_str)),
        "sha": b.get("objectId").cloned().unwrap_or(Value::Null),
        "protected": false,
    })).collect()))
}

async fn list_my_repos(st: &AppState) -> Result<Value, String> {
    let c = az_context(st).await?;
    let raw = az_fetch(st, &format!("{}/{}/_apis/git/repositories", c.base, c.project), Method::GET, None).await?;
    Ok(Value::Array(vals(&raw).iter().map(|r| {
        let project = r.get("project").and_then(|p| p.get("name")).and_then(Value::as_str).unwrap_or("");
        let name = r.get("name").and_then(Value::as_str).unwrap_or("");
        json!({
            "fullName": format!("{project}/{name}"),
            "name": name,
            "owner": project,
            "private": true,
            "cloneUrl": r.get("remoteUrl").cloned().unwrap_or(Value::Null),
            "description": "",
            "updatedAt": Value::Null,
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
        "deviceStart" => json!({ "error": "Azure DevOps login uses a Personal Access Token — paste one with the token option." }),
        "repoContext" => match az_context(st).await {
            Ok(c) => json!({ "owner": c.project, "repo": c.repo }),
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
        // Work items / project members are a separate product surface — empty here.
        "listCollaborators" => json!([]),
        "listIssues" => json!([]),
        "listRemoteBranches" => read(list_remote_branches(st).await),
        "listMyRepos" => read(list_my_repos(st).await),
        _ => json!({ "error": format!("azure:{name} not implemented") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pr_mapping() {
        let p = json!({
            "pullRequestId": 12, "title": "t", "status": "completed",
            "createdBy": { "displayName": "a", "imageUrl": "u" },
            "targetRefName": "refs/heads/main", "sourceRefName": "refs/heads/feat",
            "creationDate": "c"
        });
        let m = map_pr(&p);
        assert_eq!(m["number"], 12);
        assert_eq!(m["state"], "closed");
        assert_eq!(m["merged"], true);
        assert_eq!(m["author"]["login"], "a");
        assert_eq!(m["base"], "main");
        assert_eq!(m["head"], "feat");
    }
}
