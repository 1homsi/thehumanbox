

#![cfg(feature = "webtransport")]
#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use tokio::sync::broadcast;
use wtransport::{Endpoint, Identity, ServerConfig};

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
            Err(e) => { tracing::warn!(target: "wt", "connect error: {e}"); continue; }
        };
        let session = match session_req.accept().await {
            Ok(s) => s,
            Err(e) => { tracing::warn!(target: "wt", "accept error: {e}"); continue; }
        };

        let mut session_rx = rx.resubscribe();
        tokio::spawn(async move {
            while let Ok(frame) = session_rx.recv().await {
                if let Ok(mut stream) = session.open_uni().await {
                    if let Ok(mut s) = stream.await {
                        let _ = s.write_all(frame.as_ref()).await;
                        let _ = s.finish().await;
                    }
                }
            }
        });

        rx = rx.resubscribe();
    }
}
