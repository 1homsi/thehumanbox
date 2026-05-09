// Capture the git SHA and a build timestamp at compile time so the running
// binary can report which commit it was built from. Surfaced via /version.
//
// Runs once per cargo build that's seen a HEAD or index change; pure cargo
// caching otherwise. Falls back to "unknown" if git is not available (e.g.
// a vendored tarball build).

use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    // Short, 12-char SHA — long enough to be unique across our history,
    // short enough to fit in a UI badge without truncation.
    let sha = Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=THB_GIT_SHA={sha}");

    // Build timestamp as a Unix epoch second so the frontend can format
    // however it wants (relative time, ISO date, etc).
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=THB_BUILD_TS={ts}");

    // Bust the cache when HEAD or the index moves. The simulation crate is
    // nested inside the repo so the .git path is one level up.
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/index");
}
