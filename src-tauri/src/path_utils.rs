// Path / remote-URL helpers, ported from electron/main/path-utils.ts.
use base64::{engine::general_purpose::STANDARD, Engine};

/// Ephemeral `-c http.extraHeader` git args authenticating an HTTPS clone of a
/// private repo with a token. Empty when no token. Basic auth, token as password,
/// passed per-command (never written to .git/config or the URL).
pub fn clone_auth_args(token: Option<&str>) -> Vec<String> {
    let t = token.map(str::trim).unwrap_or("");
    if t.is_empty() {
        return vec![];
    }
    let basic = STANDARD.encode(format!("x-access-token:{t}"));
    vec![
        "-c".into(),
        format!("http.extraHeader=Authorization: Basic {basic}"),
    ]
}

/// Parse owner/repo from a GitHub remote URL. None for non-GitHub.
/// Mirrors /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/.
pub fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let u = url.trim();
    let idx = u.find("github.com")?;
    let mut rest = u[idx + "github.com".len()..].chars();
    match rest.next()? {
        '/' | ':' => {}
        _ => return None,
    }
    let after = rest.as_str();
    let slash = after.find('/')?;
    let owner = &after[..slash];
    if owner.is_empty() {
        return None;
    }
    let mut repo = after[slash + 1..].trim_end_matches('/');
    repo = repo.strip_suffix(".git").unwrap_or(repo);
    repo = repo.trim_end_matches('/');
    if repo.is_empty() {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

/// True when `path` is a Windows drive root like `C:\`. Drives a "show This PC"
/// up-navigation. Always false off Windows.
pub fn is_windows_drive_root(path: &str) -> bool {
    let b = path.as_bytes();
    cfg!(windows) && b.len() == 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_args() {
        assert!(clone_auth_args(None).is_empty());
        assert!(clone_auth_args(Some("  ")).is_empty());
        let a = clone_auth_args(Some("tok"));
        assert_eq!(a[0], "-c");
        // base64("x-access-token:tok")
        assert_eq!(a[1], "http.extraHeader=Authorization: Basic eC1hY2Nlc3MtdG9rZW46dG9r");
    }

    #[test]
    fn remotes() {
        assert_eq!(
            parse_github_remote("https://github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("git@github.com:foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/foo/bar/"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(parse_github_remote("https://gitlab.com/foo/bar"), None);
    }
}
