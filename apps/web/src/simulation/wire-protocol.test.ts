import { describe, expect, it } from 'vitest'
import { judgeHandshake, readHello, WIRE_PROTOCOL } from './wire-protocol'

const hello = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'hello', protocol: WIRE_PROTOCOL, name: 'simulation-rs', version: '0.7.6', ...over })

describe('the websocket handshake', () => {
  it('lets a server that speaks this window protocol carry on', () => {
    expect(judgeHandshake(hello())).toEqual({ ok: true })
  })

  it('refuses a server that sends a world frame first, the way a build from before the handshake does', () => {
    // A world frame is msgpack bytes, or a JSON object without a `type` of 'hello'.
    expect(judgeHandshake(new Uint8Array([0, 0x81]).buffer)).toEqual({ ok: false, reason: 'no-hello' })
    expect(judgeHandshake(JSON.stringify({ frame_id: 12, organisms: [] }))).toEqual({
      ok: false,
      reason: 'no-hello',
    })
  })

  it('refuses a server that speaks another protocol, and says which version it is', () => {
    expect(judgeHandshake(hello({ protocol: WIRE_PROTOCOL + 1, version: '0.8.0' }))).toEqual({
      ok: false,
      reason: 'protocol',
      server: { protocol: WIRE_PROTOCOL + 1, version: '0.8.0' },
    })
  })

  it('reads a hello that does not name its version as an unknown version', () => {
    expect(readHello(JSON.stringify({ type: 'hello', protocol: 3 }))).toEqual({
      protocol: 3,
      version: 'unknown',
    })
  })

  it('treats a hello without a protocol number, or something that is not JSON, as no hello', () => {
    expect(readHello(JSON.stringify({ type: 'hello' }))).toBeNull()
    expect(readHello('not json')).toBeNull()
    expect(readHello('[1,2]')).toBeNull()
    expect(readHello(null)).toBeNull()
  })
})
