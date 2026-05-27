import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import {
  DesktopSettings,
  ModelProvider,
  SimMode,
  SimStatus,
  getDesktop,
} from '../lib/desktop'

interface Props {
  onClose: () => void
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
      <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
        <div className="lang-modal-header">
          <span className="lang-modal-title">DESKTOP SETTINGS</span>
          <button aria-label="Close" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ padding: 24, color: '#999', fontSize: 12 }}>
          Desktop settings are only available in the desktop app.
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

  const update = (patch: Partial<DesktopSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s))
  const updateModel = (patch: Partial<DesktopSettings['model']>) =>
    setSettings((s) => (s ? { ...s, model: { ...s.model, ...patch } } : s))

  async function save() {
    if (!settings || !desktop) return
    setBusy(true)
    try {
      await desktop.settings.set(settings)
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    if (!desktop) return
    setBusy(true)
    setStatus(null)
    try {
      const next = await desktop.sim.restart()
      setStatus(next)
    } finally {
      setBusy(false)
    }
  }

  const justSaved = savedAt && Date.now() - savedAt < 2500

  return (
    <Modal open onClose={onClose} className="settings-modal" title="Desktop Settings" hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">DESKTOP SETTINGS</span>
        <span className="tree-modal-sub">v{desktop.appVersion} · {desktop.platform}</span>
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
                {status.running ? `local sim @ :${status.port}` : 'no local sim running'}
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
                  placeholder={settings.model.provider === 'ollama' || settings.model.provider === 'llama-cpp' ? '(not needed for local)' : 'sk-...'}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
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
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
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
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
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
