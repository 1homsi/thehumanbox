//! The Human Box simulation core: pure, deterministic, IO-free.
//!
//! This crate holds the entire simulation (organisms, world, physics, and
//! the civ/tick logic) with no server, async, networking, filesystem, or
//! database coupling. Every consumer is a thin shell around it:
//!   * the `simulation-rs` server binary (HTTP/WS + LLM workers),
//!   * the `headless` binary (a tick loop, for CI / profiling),
//!   * the browser WASM build (own-world local mode),
//!   * the desktop app (spawns the native server binary).
//!
//! Adding simulation logic here flows to all of them with zero per-target
//! work. Only features that reach OUTSIDE the pure sim (LLM narration,
//! SQLite archive) live in the server shell and are absent here — the sim
//! already falls back to templated text and skips persistence when those
//! aren't present, which is exactly the browser/headless case.
pub mod organism;
pub mod physics;
pub mod sim;
pub mod world;
