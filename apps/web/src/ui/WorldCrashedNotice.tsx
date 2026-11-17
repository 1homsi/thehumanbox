import { t } from '../i18n'
import { reloadAppSafely } from '../simulation/worldSource'

interface Props {
  detail?: string
}

export function WorldCrashedNotice({ detail }: Props) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="world-crashed-title"
      aria-describedby="world-crashed-body"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: 'rgba(12, 10, 8, 0.88)',
        color: '#c8c0b0',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        zIndex: 99998,
      }}
    >
      <h1
        id="world-crashed-title"
        style={{ fontSize: 22, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        {t('dialogs.worldNotice.crashedTitle')}
      </h1>
      <p
        id="world-crashed-body"
        style={{ fontSize: 13, color: '#9a9080', maxWidth: 480, textAlign: 'center', margin: 0 }}
      >
        {t('dialogs.worldNotice.crashedBody')}
      </p>
      {detail && (
        <p
          style={{
            fontSize: 11,
            color: '#7e7568',
            maxWidth: 560,
            maxHeight: 96,
            overflow: 'auto',
            textAlign: 'center',
            margin: 0,
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {detail}
        </p>
      )}
      <button
        autoFocus
        onClick={() => reloadAppSafely()}
        style={{
          background: '#3a2618',
          color: '#d8d2c4',
          border: '1px solid #5a3a20',
          borderRadius: 4,
          padding: '8px 18px',
          fontSize: 12,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {t('dialogs.worldNotice.crashedReload')}
      </button>
    </div>
  )
}
