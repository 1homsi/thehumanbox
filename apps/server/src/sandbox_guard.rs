//! Cross-site guard for the sandbox's mutating routes (`POST /command`, `POST /runtime`, `POST /save`).
//!
//! The local sim listens on loopback with no login, and `/command` accepts any content type, so a web
//! page the player happens to visit could fire a CORS "simple request" (no preflight) at it and meteor
//! their world. Browsers always attach `Origin` to such a request, so:
//! - no `Origin` (the desktop app's main process, curl) passes: not a browser, and loopback-only;
//! - an allow-listed web origin (the hosted site, the dev servers) passes;
//! - `Origin: null` (the desktop renderer loads from `file://`, but so does any sandboxed iframe or
//!   `data:` page) passes only with the per-launch `x-thb-token` the desktop app hands the sim and its
//!   renderer;
//! - anything else is refused.

use axum::extract::{Request, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

pub(super) const TOKEN_HEADER: &str = "x-thb-token";

#[derive(Clone)]
pub(super) struct SandboxGuard {
    allowed: Arc<Vec<HeaderValue>>,
    token: Option<Arc<str>>,
}

impl SandboxGuard {
    pub(super) fn new(allowed: Vec<HeaderValue>, token: Option<String>) -> Self {
        Self {
            allowed: Arc::new(allowed),
            token: token
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .map(Arc::from),
        }
    }

    fn permits(&self, origin: Option<&HeaderValue>, provided: Option<&HeaderValue>) -> bool {
        let Some(origin) = origin else {
            return true;
        };
        if origin.as_bytes() == b"null" {
            return match (&self.token, provided) {
                (Some(token), Some(provided)) => constant_time_eq(token.as_bytes(), provided.as_bytes()),
                _ => false,
            };
        }
        self.allowed.iter().any(|allowed| allowed == origin)
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |diff, (x, y)| diff | (x ^ y)) == 0
}

pub(super) async fn sandbox_guard(
    State(guard): State<SandboxGuard>,
    request: Request,
    next: Next,
) -> Response {
    let read_only = matches!(*request.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if read_only
        || guard.permits(
            request.headers().get(axum::http::header::ORIGIN),
            request.headers().get(TOKEN_HEADER),
        )
    {
        next.run(request).await
    } else {
        StatusCode::FORBIDDEN.into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::routing::{get, post};
    use axum::Router;
    use tower::ServiceExt;

    fn app(token: Option<&str>) -> Router {
        let allowed = vec![
            HeaderValue::from_static("https://thehumanbox.com"),
            HeaderValue::from_static("null"),
        ];
        let guard = SandboxGuard::new(allowed, token.map(str::to_string));
        Router::new()
            .route("/command", post(|| async { StatusCode::OK }))
            .route(
                "/runtime",
                get(|| async { StatusCode::OK }).post(|| async { StatusCode::OK }),
            )
            .route_layer(axum::middleware::from_fn_with_state(guard, sandbox_guard))
    }

    async fn status(app: Router, method: Method, uri: &str, headers: &[(&str, &str)]) -> StatusCode {
        let mut request = Request::builder().method(method).uri(uri);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        app.oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn a_cross_site_page_cannot_post_commands() {
        async fn cmd(headers: &[(&str, &str)], token: Option<&str>) -> StatusCode {
            status(app(token), Method::POST, "/command", headers).await
        }
        // The CORS "simple request" a hostile page can send without a preflight.
        assert_eq!(
            cmd(
                &[("origin", "https://evil.example"), ("content-type", "text/plain")],
                None
            )
            .await,
            StatusCode::FORBIDDEN
        );
        // A sandboxed iframe / data: page sends `Origin: null`; without the launch token it is refused.
        assert_eq!(
            cmd(&[("origin", "null")], Some("secret")).await,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            cmd(&[("origin", "null"), (TOKEN_HEADER, "wrong")], Some("secret")).await,
            StatusCode::FORBIDDEN
        );
        assert_eq!(cmd(&[("origin", "null")], None).await, StatusCode::FORBIDDEN);
        assert_eq!(
            cmd(&[("origin", "null"), (TOKEN_HEADER, "anything")], None).await,
            StatusCode::FORBIDDEN
        );
        // The desktop renderer (null origin plus token), the hosted site, and non-browser callers still work.
        assert_eq!(
            cmd(&[("origin", "null"), (TOKEN_HEADER, "secret")], Some("secret")).await,
            StatusCode::OK
        );
        assert_eq!(
            cmd(&[("origin", "https://thehumanbox.com")], None).await,
            StatusCode::OK
        );
        assert_eq!(cmd(&[], None).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn reads_stay_open_and_only_the_mutating_methods_are_guarded() {
        let hostile = [("origin", "https://evil.example")];
        assert_eq!(
            status(app(None), Method::GET, "/runtime", &hostile).await,
            StatusCode::OK
        );
        assert_eq!(
            status(app(None), Method::POST, "/runtime", &hostile).await,
            StatusCode::FORBIDDEN
        );
    }
}
