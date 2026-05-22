export function loadString(key: string): string | null {
  try { return window.localStorage.getItem(key) }
  catch { return null }
}

export function saveString(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) }
  catch { /* ignore */ }
}

export function loadBool(key: string, fallback = false): boolean {
  const v = loadString(key)
  if (v === '1') return true
  if (v === '0') return false
  return fallback
}

export function saveBool(key: string, value: boolean): void {
  saveString(key, value ? '1' : '0')
}

export function loadJson<T>(key: string, fallback: T): T {
  const raw = loadString(key)
  if (raw == null) return fallback
  try { return JSON.parse(raw) as T }
  catch { return fallback }
}

export function saveJson<T>(key: string, value: T): void {
  try { saveString(key, JSON.stringify(value)) }
  catch { /* ignore */ }
}
