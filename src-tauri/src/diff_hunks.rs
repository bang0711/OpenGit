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
}
