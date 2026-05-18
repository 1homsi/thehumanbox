//! HTTP and WebSocket route handlers.
//!
//! Pulled out of main.rs because the four HTTP handlers + the WS upgrade +
//! the per-connection handle_socket loop add up to ~150 lines of routing
//! plumbing that has nothing to do with the broadcast loop, the think
//! worker, or any of the bootstrap wiring still in main.rs.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::IntoResponse,
};
use tokio::sync::broadcast;

use super::{
    AppState, LatestFull, SharedSim, WS_RESYNC_LAG_THRESHOLD,
};
use crate::transport::{
    SharedTransportStats, encode_frame, now_ms,
};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(s): State<AppState>,
) -> impl IntoResponse {
    let rx              = s.tx.subscribe();
    let sim             = s.sim.clone();
    let latest_full     = s.latest_full.clone();
    let transport_stats = s.transport_stats.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, rx, sim, latest_full, transport_stats))
}

pub async fn snapshot_handler(
    State(s): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    let cached = s.latest_full.read().ok().and_then(|g| g.clone());
    match cached {
        Some(arc) => Ok((
            [
                // Same MessagePack format as WS frames so the client uses
                // one parser for both initial bootstrap and live updates.
                (axum::http::header::CONTENT_TYPE,  "application/msgpack".to_string()),
                (axum::http::header::CACHE_CONTROL, "no-store".to_string()),
            ],
            arc.as_ref().clone(),
        )),
        None => Err(StatusCode::SERVICE_UNAVAILABLE),
    }
}

pub async fn version_handler() -> impl IntoResponse {
    let built_at: u64 = env!("THB_BUILD_TS").parse().unwrap_or(0);
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(serde_json::json!({
            "name":     env!("CARGO_PKG_NAME"),
            "version":  env!("CARGO_PKG_VERSION"),
            "git_sha":  env!("THB_GIT_SHA"),
            "built_at": built_at,
        })),
    )
}

pub async fn org_detail_handler(
    Path(id): Path<String>,
    State(s): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    use crate::organism::organism::OrgDetailJson;
    let sim = s.sim.lock().await;
    let org = sim.organisms.iter().find(|o| o.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let detail: OrgDetailJson = org.to_detail_json();
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(detail),
    ))
}

pub async fn transport_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(s.transport_stats.snapshot()),
    )
}

/// Per-lane LLM latency + error counters. Useful during the dual-lane
/// migration: hit this endpoint to see if narration (Groq) and think
/// (local llama.cpp) are actually serving traffic and how the p95s
/// compare side-by-side.
pub async fn llm_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(s.llm_stats.snapshot()),
    )
}

/// /memory - process RSS and the top per-org map sizes. The c7g.medium
/// only has 2 GB; if the Q-tables or memory maps creep we want to
/// see it WAY before the kernel OOM-killer steps in.
///
/// Reads RSS from /proc/self/status on Linux (no extra crate). Falls
/// back to 0 when the file isn't readable (non-Linux dev box).
pub async fn memory_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    let rss_kb = read_self_rss_kb();
    let sim = s.sim.lock().await;
    let alive = sim.organisms.iter().filter(|o| o.alive).count();
    // Sum row + entry counts across living orgs so we can spot the
    // single-org outlier that triggers Q-cap pressure.
    let mut q_rows = 0usize;
    let mut q_max_per_org = 0usize;
    let mut food_entries = 0usize;
    let mut water_entries = 0usize;
    let mut danger_entries = 0usize;
    let mut trust_entries = 0usize;
    let mut discoveries  = 0usize;
    let mut thought_hist = 0usize;
    for o in &sim.organisms {
        if !o.alive { continue; }
        let qn = o.q_table.len();
        q_rows += qn;
        if qn > q_max_per_org { q_max_per_org = qn; }
        food_entries   += o.food_memory.len();
        water_entries  += o.water_memory.len();
        danger_entries += o.danger_memory.len();
        trust_entries  += o.org_trust.len();
        discoveries    += o.discoveries.len();
        thought_hist   += o.thought_history.len();
    }
    let n_actions = crate::organism::organism::N_ACTIONS;
    // Approximate Q-table footprint: rows * N_ACTIONS * 4 bytes/f32
    // (ignores HashMap overhead, which adds ~50%).
    let q_bytes = q_rows * n_actions * 4;
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(serde_json::json!({
            "rss_kb":          rss_kb,
            "rss_mb":          (rss_kb as f64) / 1024.0,
            "tick":            sim.tick_count,
            "alive_orgs":      alive,
            "events_buffered": sim.events.len(),
            "q_rows_total":         q_rows,
            "q_rows_max_per_org":   q_max_per_org,
            "q_bytes_approx":       q_bytes,
            "n_actions":            n_actions,
            "food_memory_entries":  food_entries,
            "water_memory_entries": water_entries,
            "danger_memory_entries": danger_entries,
            "org_trust_entries":    trust_entries,
            "discoveries_total":    discoveries,
            "thought_history_total": thought_hist,
        })),
    )
}

/// Read the running process's resident-set size from /proc/self/status.
/// Returns 0 on any failure - this endpoint is observability, not load
/// bearing.
fn read_self_rss_kb() -> u64 {
    let s = match std::fs::read_to_string("/proc/self/status") {
        Ok(s) => s,
        Err(_) => return 0,
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            let kb: u64 = rest.split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
            return kb;
        }
    }
    0
}

async fn handle_socket(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<Arc<Vec<u8>>>,
    _sim: SharedSim,
    _latest_full: LatestFull,
    transport_stats: SharedTransportStats,
) {
    // No on-connect primer. The client fetches the heavy bootstrap
    // snapshot via HTTP /snapshot (gzipped, single big response) and
    // then opens this WebSocket for live deltas + slim periodic fulls.
    // Keeping the WS bootstrap-free means the broadcaster never has to
    // serialize the heavy cold-metadata block on the hot path.
    //
    // The sim and latest_full handles are kept around (prefixed `_`)
    // because resync still uses them implicitly via the broadcast
    // channel - lag-recovery now just lets the client notice the gap
    // and re-fetch /snapshot at its own pace.

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Binary(msg.as_ref().clone().into())).await.is_err() { break; }
                        transport_stats.record_sent();
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        transport_stats.record_lagged(skipped);
                        // No longer replay latest_full inline - that was
                        // the freeze. Lag is reported via the client's
                        // gap detector (lastFrameIdRef jumps), which is
                        // its cue to re-fetch /snapshot over HTTP.
                        if skipped >= WS_RESYNC_LAG_THRESHOLD {
                            transport_stats.record_resync();
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
