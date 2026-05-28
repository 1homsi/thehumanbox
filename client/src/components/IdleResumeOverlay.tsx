interface Props {
  onResume: () => void
}

export function IdleResumeOverlay({ onResume }: Props) {
  return (
    <div className="idle-resume-backdrop" role="dialog" aria-modal="true">
      <div className="idle-resume-panel">
        <div className="idle-resume-eye" aria-hidden="true">
          <span className="idle-resume-eye-dot" />
        </div>
        <div className="idle-resume-title">Are you still here?</div>
        <button className="idle-resume-btn" onClick={onResume} autoFocus>
          Resume
        </button>
      </div>
    </div>
  )
}
