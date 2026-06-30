// Split a file's unified diff into header + individual hunks, ported from
// electron/main/diff-hunks.ts. A single hunk re-applies as `header + hunk`.

pub struct Hunks {
    pub header: String,
    pub hunks: Vec<String>,
}

pub fn split_diff_into_hunks(patch: &str) -> Hunks {
    let mut header: Vec<&str> = Vec::new();
    let mut hunks: Vec<String> = Vec::new();
    let mut cur: Option<Vec<&str>> = None;

    for line in patch.split('\n') {
        if line.starts_with("@@") {
            if let Some(c) = cur.take() {
                hunks.push(c.join("\n"));
            }
            cur = Some(vec![line]);
        } else if let Some(c) = cur.as_mut() {
            c.push(line);
        } else {
            header.push(line);
        }
    }
    if let Some(c) = cur {
        hunks.push(c.join("\n"));
    }
    Hunks {
        header: header.join("\n"),
        hunks,
    }
}

/// `@@ -oldStart[,len] +newStart[,len] @@` → (oldStart, newStart).
fn parse_starts(header: &str) -> Option<(i64, i64)> {
    let rest = header.strip_prefix("@@ -")?;
    let mut it = rest.split(" +");
    let old = it.next()?.split(',').next()?.trim();
    let new = it.next()?.split(" @@").next()?.split(',').next()?.trim();
    Some((old.parse().ok()?, new.parse().ok()?))
}

/// Rebuild `patch` keeping only the selected changed lines, so a subset of a
/// file's changes can be staged/unstaged/discarded. A line is identified by
/// `(is_addition, line_number)` — addition uses the new-file line, deletion the
/// old-file line (matching the renderer's rightNo / leftNo).
///
/// Unselected changes are folded back: under forward apply an unselected `-`
/// becomes context (the deletion isn't applied) and an unselected `+` is dropped;
/// under `reverse` the roles swap. Hunk counts are recomputed. Returns None when
/// no selected change survives (nothing to apply).
pub fn build_selected_patch(
    patch: &str,
    selected: &std::collections::HashSet<(bool, i64)>,
    reverse: bool,
) -> Option<String> {
    let all: Vec<&str> = patch.split('\n').collect();
    let mut i = 0;
    let mut header: Vec<String> = Vec::new();
    while i < all.len() && !all[i].starts_with("@@") {
        header.push(all[i].to_string());
        i += 1;
    }
    let mut out_hunks: Vec<String> = Vec::new();
    while i < all.len() {
        let Some((old_start, new_start)) = parse_starts(all[i]) else {
            i += 1;
            continue;
        };
        i += 1;
        let mut body: Vec<String> = Vec::new();
        let (mut old_no, mut new_no) = (old_start, new_start);
        let (mut old_count, mut new_count) = (0i64, 0i64);
        let mut changed = false;
        let mut prev_emitted = false;
        while i < all.len() && !all[i].starts_with("@@") {
            let line = all[i];
            i += 1;
            if line.is_empty() {
                continue;
            }
            let tag = line.as_bytes()[0] as char;
            let content = &line[1..];
            match tag {
                ' ' => {
                    body.push(line.to_string());
                    old_no += 1;
                    new_no += 1;
                    old_count += 1;
                    new_count += 1;
                    prev_emitted = true;
                }
                '+' => {
                    if selected.contains(&(true, new_no)) {
                        body.push(line.to_string());
                        new_count += 1;
                        changed = true;
                        prev_emitted = true;
                    } else if reverse {
                        body.push(format!(" {content}"));
                        old_count += 1;
                        new_count += 1;
                        prev_emitted = true;
                    } else {
                        prev_emitted = false;
                    }
                    new_no += 1;
                }
                '-' => {
                    if selected.contains(&(false, old_no)) {
                        body.push(line.to_string());
                        old_count += 1;
                        changed = true;
                        prev_emitted = true;
                    } else if !reverse {
                        body.push(format!(" {content}"));
                        old_count += 1;
                        new_count += 1;
                        prev_emitted = true;
                    } else {
                        prev_emitted = false;
                    }
                    old_no += 1;
                }
                '\\' => {
                    if prev_emitted {
                        body.push(line.to_string());
                    }
                }
                _ => {
                    body.push(line.to_string());
                    prev_emitted = true;
                }
            }
        }
        if changed {
            let hdr = format!("@@ -{old_start},{old_count} +{new_start},{new_count} @@");
            let mut h = vec![hdr];
            h.extend(body);
            out_hunks.push(h.join("\n"));
        }
    }
    if out_hunks.is_empty() {
        return None;
    }
    let mut result = header;
    result.extend(out_hunks);
    Some(format!("{}\n", result.join("\n")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits() {
        let patch = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n@@ -5 +5 @@\n-c\n+d";
        let h = split_diff_into_hunks(patch);
        assert!(h.header.starts_with("diff --git"));
        assert_eq!(h.hunks.len(), 2);
        assert!(h.hunks[0].starts_with("@@ -1 +1 @@"));
    }

    // file f: lines a,b,c,d → edited to a,B,c,D (two separate +/- pairs).
    const DIFF: &str = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,4 +1,4 @@\n a\n-b\n+B\n c\n-d\n+D\n";

    #[test]
    fn stage_only_first_change() {
        // Select the addition on new-line 2 ("B") and deletion on old-line 2 ("b").
        let mut sel = std::collections::HashSet::new();
        sel.insert((true, 2)); // +B
        sel.insert((false, 2)); // -b
        let patch = build_selected_patch(DIFF, &sel, false).unwrap();
        // Keeps the first change; the second (-d/+D) folds: -d → context, +D dropped.
        assert!(patch.contains("-b"));
        assert!(patch.contains("+B"));
        assert!(patch.contains(" d")); // unselected deletion kept as context
        assert!(!patch.contains("+D")); // unselected addition dropped
        // Recomputed counts: old = a,b,c,d = 4 ; new = a,B,c,d = 4.
        assert!(patch.contains("@@ -1,4 +1,4 @@"));
    }

    #[test]
    fn nothing_selected_returns_none() {
        let sel = std::collections::HashSet::new();
        assert!(build_selected_patch(DIFF, &sel, false).is_none());
    }
}
