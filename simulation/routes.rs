

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
    // Clients never legitimately send anything beyond ping/pong/close
    // on this socket, so cap inbound frames hard. Axum's default is
    // 64 MiB which is a memory-exhaustion DoS vector.
    ws.max_message_size(4 * 1024)
        .max_frame_size(4 * 1024)
        .on_upgrade(move |socket| handle_socket(socket, rx, sim, latest_full, transport_stats))
}

/// OG (Open Graph) social-share image. Renders the current world map
/// to a 1200×630 PNG and caches it for 5 minutes so social crawlers
/// (Facebook, WhatsApp, Twitter, Discord, LinkedIn) don't hammer the
/// renderer. After the TTL elapses, the next request triggers a fresh
/// render. The render runs under `spawn_blocking` because PNG encoding
/// is CPU-bound and would otherwise stall the tokio reactor.
///
/// `Cache-Control: public, max-age=300` advertises the same TTL to
/// downstream CDNs / crawlers.
pub async fn og_handler(
    State(s): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    const TTL_MS: u64 = 5 * 60 * 1000;
    let now = crate::transport::now_ms();
    // Hold the cache mutex across the entire critical section so a
    // burst of N concurrent cold-cache requests serialises through
    // one render — not N independent sim-locks + PNG encodes. The
    // second request will find the cache populated by the first.
    let mut guard = s.og_cache.lock().await;
    if let Some((generated_at, bytes)) = guard.as_ref() {
        if now.saturating_sub(*generated_at) < TTL_MS {
            return Ok((
                [
                    (axum::http::header::CONTENT_TYPE,  "image/png".to_string()),
                    (axum::http::header::CACHE_CONTROL, "public, max-age=300".to_string()),
                ],
                bytes.as_ref().clone(),
            ));
        }
    }

    // Snapshot the world under the sim lock and release before the
    // CPU-heavy PNG encode. We deliberately clone the few small
    // vectors we need — the snapshot is far smaller than a full
    // wire frame and is dropped after render.
    let snapshot = {
        use crate::sim::config::DAY_LENGTH;
        let sim = s.sim.lock().await;
        use crate::og_image::{OgSnapshot, OgOrg, lineage_color};
        let g = &sim.grid;
        let mut orgs: Vec<OgOrg> = Vec::with_capacity(sim.organisms.len());
        let mut alive = 0u32;
        for o in sim.organisms.iter().filter(|o| o.alive) {
            alive += 1;
            orgs.push(OgOrg {
                x: o.x,
                y: o.y,
                color: lineage_color(&o.lineage_id),
            });
        }
        let phase = sim.tick_count % DAY_LENGTH;
        let day_t = phase as f32 / DAY_LENGTH as f32;
        let era = sim.current_era.clone();
        OgSnapshot {
            width:  crate::world::grid::WIDTH,
            height: crate::world::grid::HEIGHT,
            tiles:  g.tiles.clone(),
            biome:  g.biome.clone(),
            orgs,
            tick:   sim.tick_count,
            day_t,
            era,
            alive,
        }
    };

    // PNG encode off the reactor. spawn_blocking failure → 500.
    let bytes_arc: Arc<Vec<u8>> = match tokio::task::spawn_blocking(move || crate::og_image::render(&snapshot)).await {
        Ok(b) => Arc::new(b),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    *guard = Some((now, bytes_arc.clone()));
    drop(guard);

    Ok((
        [
            (axum::http::header::CONTENT_TYPE,  "image/png".to_string()),
            (axum::http::header::CACHE_CONTROL, "public, max-age=300".to_string()),
        ],
        bytes_arc.as_ref().clone(),
    ))
}

pub async fn snapshot_handler(
    State(s): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    let cached = s.latest_full.read().ok().and_then(|g| g.clone());
    match cached {
        Some(arc) => Ok((
            [
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

pub async fn org_life_handler(
    Path(id): Path<String>,
    State(s): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    use crate::organism::organism::OrgLifeJson;
    let sim = s.sim.lock().await;
    let org = sim.organisms.iter().find(|o| o.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let life: OrgLifeJson = org.to_life_json();
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(life),
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

pub async fn llm_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(s.llm_stats.snapshot()),
    )
}

pub async fn memory_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    let rss_kb = read_self_rss_kb();
    let sim = s.sim.lock().await;
    let alive = sim.organisms.iter().filter(|o| o.alive).count();
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
    let q_bytes = q_rows * n_actions * 4;
    let pressure = format!("{:?}", s.memory_watch.pressure());
    let box_avail_mb = s.memory_watch.box_available_mb();
    (
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(serde_json::json!({
            "rss_kb":          rss_kb,
            "rss_mb":          (rss_kb as f64) / 1024.0,
            "box_available_mb": box_avail_mb,
            "pressure":         pressure,
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

/// Aggregated health endpoint — single source of truth for "is the
/// box working." Returns 200 OK with degraded:false when all green,
/// 200 OK with degraded:true when any subsystem is in a warning state,
/// 503 when the sim hasn't ticked in a while (we're dying).
pub async fn health_handler(
    State(s): State<AppState>,
) -> impl IntoResponse {
    let now = crate::transport::now_ms();
    let last_full = s.latest_full_at.load(std::sync::atomic::Ordering::Relaxed);
    let last_full_age_ms = now.saturating_sub(last_full);

    let pressure = s.memory_watch.pressure();
    let mem_critical = matches!(pressure, crate::sim::memory_pressure::MemoryPressure::Critical);
    let mem_elevated = matches!(pressure, crate::sim::memory_pressure::MemoryPressure::Elevated);

    let groq_avail = s.groq_limiter.available();
    let groq_starved = groq_avail == 0;

    let llm_snap = s.llm_stats.snapshot();
    let narration_err_ratio = if llm_snap.narration.calls > 0 {
        llm_snap.narration.errors as f64 / llm_snap.narration.calls as f64
    } else { 0.0 };
    let think_err_ratio = if llm_snap.think.calls > 0 {
        llm_snap.think.errors as f64 / llm_snap.think.calls as f64
    } else { 0.0 };
    let llm_failing = narration_err_ratio > 0.5 || think_err_ratio > 0.5;

    // Sim alive check: latest_full should refresh every ~3s. If it's
    // been stale for 30s the sim is wedged.
    let stale_ms = 30_000;
    let sim_alive = last_full > 0 && last_full_age_ms < stale_ms;

    let degraded = mem_elevated || mem_critical || groq_starved || llm_failing;
    let status_code = if sim_alive {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };

    let body = serde_json::json!({
        "ok": sim_alive && !degraded,
        "sim_alive": sim_alive,
        "degraded": degraded,
        "uptime_ms": now.saturating_sub(s.start_ms),
        "last_full_frame_age_ms": last_full_age_ms,
        "memory": {
            "pressure": format!("{:?}", pressure),
            "box_available_mb": s.memory_watch.box_available_mb(),
            "rss_mb": s.memory_watch.rss_mb(),
        },
        "groq": {
            "available_permits": groq_avail,
            "starved": groq_starved,
        },
        "llm": {
            "narration_err_ratio": narration_err_ratio,
            "think_err_ratio": think_err_ratio,
            "failing": llm_failing,
        },
    });

    (
        status_code,
        [(axum::http::header::CACHE_CONTROL, "no-store".to_string())],
        Json(body),
    )
}

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
    latest_full: LatestFull,
    transport_stats: SharedTransportStats,
) {

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
                            transport_stats.record_resync();
                            // Without this, the client only learns it's
                            // drifted via the next frame-id gap detection
                            // (which only triggers a snapshot fetch if the
                            // gap is > 2). Push the cached latest_full
                            // directly so the laggy client catches up
                            // immediately instead of running stale for
                            // minutes.
                            // Snapshot the Arc<Vec<u8>> while we hold the
                            // RwLockReadGuard, then drop the guard before
                            // .await — guards aren't Send across awaits.
                            let payload: Option<Arc<Vec<u8>>> = latest_full.read().ok()
                                .and_then(|slot| slot.clone());
                            if let Some(full) = payload {
                                let bytes: Vec<u8> = full.as_ref().clone();
                                if socket.send(Message::Binary(bytes.into())).await.is_err() {
                                    break;
                                }
                                transport_stats.record_sent();
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
