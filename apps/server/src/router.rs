//! The HTTP router: public read routes, the sandbox and admin routes that are
//! only mounted when enabled, CORS and compression.

use super::*;

pub(super) fn build_app(state: AppState) -> Router {
    // CORS: restrict origins to the production frontend + common dev
    // hosts. Set `THB_EXTRA_CORS_ORIGINS` (comma-separated) to allow
    // additional origins for staging environments. Wide-open `Any`
    // origin lets any site embed our endpoints (cost amplification +
    // scraping risk), so we lock it down by default.
    let local_profile = std::env::var("THB_PROFILE")
        .map(|profile| profile.trim().eq_ignore_ascii_case("local"))
        .unwrap_or(false);
    let mut allowed: Vec<HeaderValue> = default_cors_origins(local_profile)
        .into_iter()
        .filter_map(|s| HeaderValue::from_str(s).ok())
        .collect();
    if let Ok(extra) = std::env::var("THB_EXTRA_CORS_ORIGINS") {
        for origin in extra.split(',') {
            let trimmed = origin.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(hv) = HeaderValue::from_str(trimmed) {
                allowed.push(hv);
            }
        }
    }
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed))
        .allow_methods(Any)
        .allow_headers(Any);

    let compression = CompressionLayer::new().gzip(true);

    let mut app = Router::new()
        .route("/ws", get(routes::ws_handler))
        .route("/org/{id}", get(routes::org_detail_handler))
        .route("/org/{id}/life", get(routes::org_life_handler))
        .route("/org/{id}/conversations", get(routes::org_conversations_handler))
        .route("/version", get(routes::version_handler))
        .route("/snapshot", get(routes::snapshot_handler))
        .route("/transport", get(routes::transport_handler))
        .route("/memory", get(routes::memory_handler))
        .route("/health", get(routes::health_handler))
        .route("/metrics", get(routes::metrics_handler))
        .route("/og.png", get(routes::og_handler))
        .route("/worlds", get(routes::list_worlds_handler))
        .route("/worlds/{hash}/meta", get(routes::world_meta_handler))
        .route("/worlds/{hash}/snapshot", get(routes::world_snapshot_handler))
        .route("/worlds/{hash}/save", get(routes::world_save_handler));

    if std::env::var("THB_SANDBOX").ok().as_deref() == Some("1") {
        app = app
            .route("/command", post(routes::command_handler))
            .route(
                "/runtime",
                get(routes::runtime_status_handler).post(routes::runtime_handler),
            )
            .route("/save", post(routes::save_handler));
        tracing::info!(
            "sandbox enabled: local game controls expose POST /command, GET/POST /runtime, and POST /save"
        );
    }

    if std::env::var("THB_ADMIN_TOKEN")
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
    {
        app = app.route("/admin/reset-world", post(routes::admin_reset_world_handler));
        tracing::info!("admin enabled: POST /admin/reset-world (x-admin-token gated)");
    }

    app.layer(compression).layer(cors).with_state(state)
}
