//! WebTransport (HTTP/3 + QUIC) sketch.
//!
//! Compiled only when --features webtransport is set, so the default
//! build path is unchanged and there's zero added risk to the live
//! deployment. The module wires nothing into main() automatically -
//! see docs/TRANSPORT.md for the full migration plan, then enable from
//! main.rs when the cert + deploy story is ready.
//!
//! Why this is staged behind a feature flag:
//! - WebTransport needs a real TLS cert (no self-signed, browsers
//!   reject ECH/serverHello on those for HTTP/3). Today the cert is
//!   inside Cloudflare Tunnel; moving off the tunnel requires Let's
//!   Encrypt on the EC2 host directly.
//! - Browser support is Chromium-good, Firefox partial, Safari behind
//!   a flag. The fallback to WebSocket has to stay until parity.
//! - Cloudflare Tunnel doesn't proxy HTTP/3 today, so until the
//!   tunnel comes out of the path WebTransport can't actually be
//!   tried end-to-end.
//!
//! Once enabled the broadcaster will send the same MessagePack +
//! quantized-SoA payload over a WebTransport bidirectional stream
//! (reliable, in-order - so no protocol change downstream). The
//! aspirational follow-up is splitting positions onto datagrams
//! (unreliable, drop-stale instead of retransmit) for the ultimate
//! latency cut, but that's a separate redesign of the broadcaster.

#![cfg(feature = "webtransport")]
#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use tokio::sync::broadcast;
use wtransport::{Endpoint, Identity, ServerConfig};

/// Spawn a WebTransport server. Mirrors the broadcast channel that the
/// existing WS path uses, so a single sim->broadcaster pipeline drives
/// both transports for the duration of the migration.
///
/// `cert_path` / `key_path` point at the same PEM files Let's Encrypt
/// writes; `bind` is the local address (usually `0.0.0.0:443`).
pub async fn serve(
    bind: SocketAddr,
    cert_path: &str,
    key_path: &str,
    mut rx: broadcast::Receiver<Arc<Vec<u8>>>,
) -> anyhow::Result<()> {
    let identity = Identity::load_pemfiles(cert_path, key_path).await?;
    let cfg = ServerConfig::builder()
        .with_bind_address(bind)
        .with_identity(identity)
        .build();
    let server = Endpoint::server(cfg)?;

    loop {
        let incoming = server.accept().await;
        let session_req = match incoming.await {
            Ok(s) => s,
            Err(e) => { eprintln!("[wt] connect error: {e}"); continue; }
        };
        let session = match session_req.accept().await {
            Ok(s) => s,
            Err(e) => { eprintln!("[wt] accept error: {e}"); continue; }
        };

        // Each client gets its own subscriber so a slow consumer
        // doesn't stall others. Same backpressure semantics as the
        // WS broadcaster - tokio::broadcast yields Lagged when the
        // per-receiver buffer overflows.
        let mut session_rx = rx.resubscribe();
        tokio::spawn(async move {
            while let Ok(frame) = session_rx.recv().await {
                // Open a fresh unidirectional stream per frame for now;
                // the proper redesign is one long-lived bidirectional
                // stream + datagrams for position state. Functional
                // parity with WS first, perf optimisations second.
                if let Ok(mut stream) = session.open_uni().await {
                    if let Ok(mut s) = stream.await {
                        let _ = s.write_all(frame.as_ref()).await;
                        let _ = s.finish().await;
                    }
                }
            }
        });

        // rx is the outer subscriber - re-arm for the next connection.
        rx = rx.resubscribe();
    }
}
