# Realtime transport

## Today (production)

```
Rust sim (10 Hz tick)
    │ broadcasts a frame every 100 ms (NETWORK_MS)
    ▼
broadcaster: encode_frame(...) -> MessagePack + SoA + quantized
    │ Arc<Vec<u8>>
    ▼
tokio::broadcast (300-slot backpressure buffer)
    │ Message::Binary
    ▼
axum WebSocket / wss://
    │
    ▼
Cloudflare Tunnel  (HTTP/2, terminates TLS)
    │
    ▼
Browser  ws.onmessage  -> msgpack decode -> cache merge
```

What's optimised already in this stack:
- One sim task, one broadcaster task, no lock contention
- MessagePack binary format
- Per-tick payload slimmed: cold/warm fields ride on full snapshots only
- Hot deltas are structure-of-arrays with i16 positions + u8 percents
- Client renders with a ~half-interval render lag to absorb packet jitter
- Frame-id sequence numbers so the client can detect drops and resync

Remaining ceiling: the Cloudflare Tunnel hop. It's HTTP/2-only, it batches,
and it adds 30-100 ms of RTT depending on PoP distance.

## Target (post-tunnel)

```
Rust sim
    │
    ▼
broadcaster (unchanged)
    │ Arc<Vec<u8>>
    ▼
       ┌─────────────────────────┬───────────────────────────┐
       ▼                         ▼                           ▼
axum WebSocket             wtransport endpoint        (future) wtransport
(fallback for non-          (HTTP/3, bidi stream,     datagrams for
 Chromium browsers)          same payload)            positions only

Direct from EC2 / origin host, no Cloudflare Tunnel in the path.
TLS via Let's Encrypt on the EC2 host directly.
```

## What's scaffolded today

A feature-flagged `webtransport` module (`simulation/webtransport.rs`)
sketches the wtransport-based server. The module is compiled out unless
you build with `--features webtransport`, so the default deploy path is
zero risk:

```sh
cargo build --release                        # ships today's pipeline
cargo build --release --features webtransport  # also compiles the WT path
```

The compiled-in version doesn't wire itself into `main.rs` automatically;
flip a switch there when you're ready.

## Migration steps (in order)

1. **Provision a TLS cert on EC2 directly.**
   - Install `certbot` and point a subdomain (e.g. `ws.thehumanbox.com`)
     at the EC2 public IP via an A record, bypassing Cloudflare proxy.
   - Run `certbot certonly --standalone -d ws.thehumanbox.com` to mint
     a Let's Encrypt cert. Auto-renew via systemd timer.

2. **Open UDP/443 on the EC2 security group.** WebTransport rides on
   HTTP/3, which is UDP. The current security group only allows TCP/443
   for HTTP/2 WS.

3. **Plumb cert paths into the build.** Add `WT_CERT_PATH` /
   `WT_KEY_PATH` env vars (defaulting to the certbot output dir). Wire
   them into `webtransport::serve()` from `main()` behind the same
   feature flag.

4. **Spawn the WebTransport server alongside the WS broadcaster.** The
   broadcaster pushes the same `Arc<Vec<u8>>` into both channels - WS
   and WT subscribers each get a `resubscribe()` on the
   `tokio::broadcast`. Same frames, two protocols.

5. **Client preference order.** Update `useSimulation.ts` to feature-
   detect `WebTransport in globalThis`. If present, try the WT URL
   first and fall back to WS on connection failure. Same parser path
   for both - frames are msgpack regardless of transport.

6. **Cut over DNS.** Once metrics on the WT path are at least as good
   as the WS path (similar `/transport` lagged/overrun rates, lower
   p95 latency), point the production frontend at the direct host and
   drop the Cloudflare Tunnel route. Keep the WS fallback live.

## Why not datagrams yet

WebTransport's killer feature for games is unreliable datagrams - drop
stale positions instead of retransmitting them. Our broadcaster is
currently reliable end-to-end: every frame must arrive in order. To
use datagrams properly we'd split the payload:

- Reliable bidi stream: events, full snapshots, history. Must arrive.
- Datagrams: hot position deltas. Drop them when stale.

That's a real protocol redesign - probably another two commits worth.
Worth doing once the rest of the pipeline is on WebTransport.

## Browser support cheat-sheet (May 2026)

| Browser  | WebTransport | Notes                                 |
| -------- | ------------ | ------------------------------------- |
| Chrome   | yes          | stable since v97                      |
| Edge     | yes          | matches Chromium                      |
| Firefox  | partial      | behind `network.webtransport.enabled` |
| Safari   | flag         | desktop / iOS gated                   |

So WebSocket fallback stays in the codebase until further notice.

## Quick check before flipping

After cutover, watch `/transport` for ~10 minutes:

- `lagged_frames` should be near zero (was the tunnel-buffering tell)
- `resync_frames` should also drop
- `p95_sim_tick_ms` should be unchanged (this is server-side, not
  network)
- `avg_payload_bytes` should be identical (same frames)

If `lagged_frames` doesn't drop, the bottleneck was server-side after
all and WebTransport won't help. Don't flip.
