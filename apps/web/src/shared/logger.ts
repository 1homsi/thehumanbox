/**
 * Tiny global logger. All log calls in the client go through here so we
 * have one place to gate verbosity, attach context, or swap sinks
 * later.
 *
 * Behaviour:
 * - debug / info: only emitted when `import.meta.env.DEV` is true.
 * - warn / error: always emitted (these signal real problems).
 *
 * The first argument is a short "tag" (subsystem name) - keeps the
 * output greppable without making every call site assemble its own
 * prefix.
 */
const isDev = (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.DEV) === true

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, tag: string, args: unknown[]) {
  const prefix = `[${tag}]`
  // This is the only place in the app that touches console directly.
  // The lint rule in eslint.config.js + the per-file override pins
  // that contract.
  const fn =
    level === 'warn'
      ? console.warn
      : level === 'error'
        ? console.error
        : level === 'info'
          ? console.info
          : console.debug
  fn(prefix, ...args)
}

export const logger = {
  debug(tag: string, ...args: unknown[]) {
    if (isDev) emit('debug', tag, args)
  },
  info(tag: string, ...args: unknown[]) {
    if (isDev) emit('info', tag, args)
  },
  warn(tag: string, ...args: unknown[]) {
    emit('warn', tag, args)
  },
  error(tag: string, ...args: unknown[]) {
    emit('error', tag, args)
  },
}
