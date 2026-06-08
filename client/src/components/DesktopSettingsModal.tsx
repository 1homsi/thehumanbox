import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { getDesktop } from '../lib/desktop'
import type {
  DesktopBridge,
  DesktopSettings,
  ModelProvider,
  SimMode,
  SimStatus,
  UpdateCheckResult,
} from '../lib/desktop'
import {
  getWorldSource,
  setWorldSourceAndReload,
  clearOwnWorldSeed,
  OWN_WORLD_ID,
} from '../simulation/worldSource'
import { deleteWorld } from '../simulation/wasmDb'

interface Props {
  onClose: () => void
}

async function resetOwnWorld() {
  await deleteWorld(OWN_WORLD_ID)
  clearOwnWorldSeed()
  window.location.reload()
}

function WorldSourceSection() {
  const source = getWorldSource()
  return (
    <Section title="World">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className={'lang-btn' + (source === 'remote' ? ' active' : '')}
          aria-pressed={source === 'remote'}
          onClick={() => source !== 'remote' && setWorldSourceAndReload('remote')}
        >
          📡 human box
        </button>
        <button
          className={'lang-btn' + (source === 'wasm' ? ' active' : '')}
          aria-pressed={source === 'wasm'}
          onClick={() => source !== 'wasm' && setWorldSourceAndReload('wasm')}
        >
          🧪 my world
        </button>
        {source === 'wasm' && (
          <button className="lang-btn" onClick={() => void resetOwnWorld()}>
            ↺ reset
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 8, lineHeight: 1.5 }}>
        <strong style={{ color: '#bfae90' }}>Human Box</strong> is the shared world everyone watches, streamed
        live. <strong style={{ color: '#bfae90' }}>My World</strong> runs entirely in this browser — nothing
        streamed, saved locally so it resumes when you return. (beta)
      </div>
    </Section>
  )
}

const PROVIDER_DEFAULTS: Record<ModelProvider, { url: string; model: string }> = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5' },
  ollama: { url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
  'llama-cpp': { url: 'http://localhost:8080/v1/chat/completions', model: 'default' },
  none: { url: '', model: '' },
}

export function DesktopSettingsModal({ onClose }: Props) {
  const desktop = getDesktop()
  const [settings, setSettings] = useState<DesktopSettings | null>(null)
  const [status, setStatus] = useState<SimStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!desktop) return
    void desktop.settings.get().then(setSettings)
    void desktop.sim.status().then(setStatus)
  }, [desktop])

  if (!desktop) {
    return (
      <Modal open onClose={onClose} className="settings-modal" title="Settings" hideTitle>
        <div className="lang-modal-header">
          <span className="lang-modal-title">SETTINGS</span>
          <button aria-label="Close" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
          <WorldSourceSection />
        </div>
      </Modal>
    )
  }

  if (!settings) {
    return (
      <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
        <div style={{ padding: 24, color: '#999', fontSize: 12 }}>loading…</div>
      </Modal>
    )
  }

  const update = (patch: Partial<DesktopSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s))
  const updateModel = (patch: Partial<DesktopSettings['model']>) =>
    setSettings((s) => (s ? { ...s, model: { ...s.model, ...patch } } : s))

  async function save() {
    if (!settings || !desktop) return
    setBusy(true)
    try {
      await desktop.settings.set(settings)
      await desktop.app.applyAutoLaunch()
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    if (!settings || !desktop) return
    setBusy(true)
    setStatus(null)
    try {
      await desktop.settings.set(settings)
      await desktop.app.applyAutoLaunch()
      const next = await desktop.sim.restart()
      setStatus(next)
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  const justSaved = savedAt && Date.now() - savedAt < 2500

  return (
    <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">DESKTOP SETTINGS</span>
        <span className="tree-modal-sub">
          v{desktop.appVersion} · {desktop.platform}
        </span>
        <button aria-label="Close" className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
        <Section title="Mode">
          <Radio
            name="mode"
            value="local"
            current={settings.mode}
            onChange={(v) => update({ mode: v as SimMode })}
            label="Local — run a private simulation on this machine"
          />
          <Radio
            name="mode"
            value="remote"
            current={settings.mode}
            onChange={(v) => update({ mode: v as SimMode })}
            label="Remote — connect to the live shared world"
          />
          {settings.mode === 'remote' && (
            <Field label="Remote URL">
              <input
                type="text"
                value={settings.remoteUrl}
                onChange={(e) => update({ remoteUrl: e.target.value })}
                style={inputStyle}
              />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button onClick={restart} disabled={busy} style={btnPrimary}>
              {busy ? 'restarting…' : 'apply mode + restart'}
            </button>
            {status && (
              <span style={{ fontSize: 11, color: '#888' }}>
                {status.mode === 'remote'
                  ? `remote: ${status.remoteUrl ?? settings.remoteUrl}`
                  : status.running
                    ? `local sim @ :${status.port}`
                    : 'no local sim running'}
                {status.error && <span style={{ color: '#e85040', marginLeft: 6 }}>{status.error}</span>}
              </span>
            )}
          </div>
        </Section>

        <Section title="Simulation">
          <Field label={`Tick interval — ${settings.tickMs} ms`}>
            <input
              type="range"
              min={30}
              max={2000}
              step={10}
              value={settings.tickMs}
              onChange={(e) => update({ tickMs: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              Lower = faster world (more CPU). Default 100 ms.
            </div>
          </Field>
        </Section>

        <Section title="AI model (local mode only)">
          <Field label="Provider">
            <select
              value={settings.model.provider}
              onChange={(e) => {
                const provider = e.target.value as ModelProvider
                const defaults = PROVIDER_DEFAULTS[provider]
                updateModel({
                  provider,
                  apiUrl: defaults.url,
                  modelName: defaults.model,
                })
              }}
              style={inputStyle}
            >
              <option value="none">none (sim still runs, just no LLM narration)</option>
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama (local)</option>
              <option value="llama-cpp">llama.cpp (local)</option>
            </select>
          </Field>
          {settings.model.provider !== 'none' && (
            <>
              <Field label="API URL">
                <input
                  type="text"
                  value={settings.model.apiUrl}
                  onChange={(e) => updateModel({ apiUrl: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="API key">
                <input
                  type="password"
                  value={settings.model.apiKey}
                  onChange={(e) => updateModel({ apiKey: e.target.value })}
                  placeholder={
                    settings.model.provider === 'ollama' || settings.model.provider === 'llama-cpp'
                      ? '(not needed for local)'
                      : 'sk-...'
                  }
                  style={inputStyle}
                />
              </Field>
              <Field label="Model name">
                <input
                  type="text"
                  value={settings.model.modelName}
                  onChange={(e) => updateModel({ modelName: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </>
          )}
        </Section>

        <Section title="Updates">
          <Toggle
            checked={settings.autoUpdate}
            onChange={(v) => update({ autoUpdate: v })}
            label="Auto-check for updates and prompt when ready"
          />
          <UpdateCheckButton desktop={desktop} />
        </Section>

        <Section title="Desktop behaviour">
          <Toggle
            checked={settings.autoLaunch}
            onChange={(v) => update({ autoLaunch: v })}
            label="Launch automatically when I sign in"
          />
          <Toggle
            checked={settings.startMinimized}
            onChange={(v) => update({ startMinimized: v })}
            label="Start hidden in the tray (no window on launch)"
          />
          <Toggle
            checked={settings.pauseWhenHidden}
            onChange={(v) => update({ pauseWhenHidden: v })}
            label="Pause renderer when window is minimized (saves CPU)"
          />
        </Section>

        <Section title="Save location">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: 180,
                fontSize: 10,
                color: '#bfae90',
                background: '#1a1612',
                border: '1px solid #3a2e25',
                borderRadius: 4,
                padding: '6px 8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {settings.saveLocationOverride ?? 'default (app data folder)'}
            </code>
            <button
              onClick={async () => {
                const dir = await desktop?.app.pickSaveDir()
                if (dir) update({ saveLocationOverride: dir })
              }}
              style={btnSecondary}
            >
              choose…
            </button>
            {settings.saveLocationOverride && (
              <button onClick={() => update({ saveLocationOverride: null })} style={btnSecondary}>
                reset
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 6 }}>
            Where worlds are stored. Save + restart for the change to take effect.
          </div>
        </Section>

        <Section title="Tools">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void desktop?.app.screenshot()} style={btnSecondary}>
              take screenshot
            </button>
            <button onClick={() => void desktop?.app.openWorlds()} style={btnSecondary}>
              open worlds folder
            </button>
            <button onClick={() => void desktop?.app.openLogs()} style={btnSecondary}>
              open logs folder
            </button>
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={save} disabled={busy} style={btnPrimary}>
            {busy ? 'saving…' : 'save settings'}
          </button>
          {justSaved && <span style={{ fontSize: 11, color: '#7ed957' }}>saved</span>}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: '#666' }}>
            Restart for mode/tick/model changes to take full effect.
          </span>
        </div>
      </div>
    </Modal>
  )
}

function updateCheckMessage(result: UpdateCheckResult | null): string {
  if (!result) return ''
  if (result.status === 'checking') return 'checking...'
  if (result.status === 'available')
    return result.version ? `v${result.version} available` : 'update available'
  if (result.status === 'downloaded') return result.version ? `v${result.version} ready` : 'update ready'
  if (result.status === 'up-to-date') return 'up to date'
  if (result.status === 'unsupported') return result.message ?? 'only available in packaged builds'
  return result.message ?? 'update check failed'
}

function UpdateCheckButton({ desktop }: { desktop: DesktopBridge }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    setResult({ status: 'checking' })
    try {
      setResult(await desktop.app.checkForUpdates())
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <button onClick={check} disabled={checking} style={btnSecondary}>
        {checking ? 'checking...' : 'check for updates'}
      </button>
      {result && (
        <span
          style={{
            color: result.status === 'error' ? '#e85040' : '#888',
            fontSize: 11,
          }}
        >
          {updateCheckMessage(result)}
        </span>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#777', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Radio({
  name,
  value,
  current,
  onChange,
  label,
}: {
  name: string
  value: string
  current: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '4px 0',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{label}</span>
    </label>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="desktop-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1c1612',
  border: '1px solid #3a3028',
  color: '#d0c8c0',
  padding: '6px 8px',
  borderRadius: 3,
  fontSize: 12,
  fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  background: '#3a2d22',
  border: '1px solid #5e5648',
  color: '#f0d088',
  padding: '6px 14px',
  borderRadius: 4,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #443329',
  color: '#bfae90',
  padding: '5px 12px',
  borderRadius: 4,
  fontSize: 10,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
