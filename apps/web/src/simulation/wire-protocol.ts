/**
 * The version of the websocket conversation with the simulation server. The server sends a `hello` as its first
 * message, naming the protocol it speaks; a window that speaks another one, or a server that sends no `hello` at
 * all (a build from before the handshake), refuses the connection rather than decoding frames it cannot read.
 *
 * Must match `WIRE_PROTOCOL` in `apps/server/src/routes.rs` and `SIM_WIRE_PROTOCOL` in `apps/desktop/main/sim-ready.ts`.
 */
export const WIRE_PROTOCOL = 1

export interface ServerHello {
  protocol: number
  /** The server's crate version, or 'unknown' when it does not say. */
  version: string
}

export type HandshakeVerdict =
  | { ok: true }
  /** The first message was not a hello: the server predates the handshake, so it cannot be read. */
  | { ok: false; reason: 'no-hello' }
  /** The server speaks another protocol. */
  | { ok: false; reason: 'protocol'; server: ServerHello }

/** The server's hello, when `first` is one; null for anything else (a world frame, a stray message). */
export function readHello(first: unknown): ServerHello | null {
  if (typeof first !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(first)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const hello = parsed as Record<string, unknown>
  if (hello.type !== 'hello' || typeof hello.protocol !== 'number') return null
  return {
    protocol: hello.protocol,
    version: typeof hello.version === 'string' ? hello.version : 'unknown',
  }
}

/** Whether the first message from a server lets this window carry on. */
export function judgeHandshake(first: unknown): HandshakeVerdict {
  const hello = readHello(first)
  if (!hello) return { ok: false, reason: 'no-hello' }
  if (hello.protocol !== WIRE_PROTOCOL) return { ok: false, reason: 'protocol', server: hello }
  return { ok: true }
}
