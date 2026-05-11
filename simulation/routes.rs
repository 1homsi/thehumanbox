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

async fn handle_socket(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<Arc<Vec<u8>>>,
    sim: SharedSim,
    latest_full: LatestFull,
    transport_stats: SharedTransportStats,
) {
    let cached = latest_full.read().ok().and_then(|g| g.clone());
    let snapshot: Arc<Vec<u8>> = if let Some(s) = cached {
        s
    } else {
        // Fallback bootstrap: the broadcaster hadn't yet primed `latest_full`
        // when this client connected. We mint a one-off full frame straight
        // from the sim and tag it frame_id=0 as a sentinel meaning "before
        // any broadcast frame the client will see". Real broadcaster frames
        // start at 1 (next_frame_id is fetch_add+1 from an initial 0). The
        // client's `lastFrameIdRef` also starts at 0, so the dedupe gate
        // skips frame_id=0 only after a real frame has been processed -
        // this bootstrap is always accepted on first arrival.
        let frame_started = std::time::Instant::now();
        let mut sim = sim.lock().await;
        let payload = encode_frame(sim.state_json(), 0, now_ms(), "full");
        transport_stats.record_generated(payload.len(), frame_started.elapsed().as_millis() as u64);
        Arc::new(payload)
    };
    if socket.send(Message::Binary(snapshot.as_ref().clone().into())).await.is_err() { return; }
    transport_stats.record_sent();

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
                        if skipped >= WS_RESYNC_LAG_THRESHOLD {
                            let cached = latest_full.read().ok().and_then(|g| g.clone());
                            if let Some(full) = cached {
                                if socket.send(Message::Binary(full.as_ref().clone().into())).await.is_err() {
                                    break;
                                }
                                transport_stats.record_sent();
                                transport_stats.record_resync();
                            }
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
