interface Props {
  onResume: () => void
}

export function IdleResumeOverlay({ onResume }: Props) {
  return (
    <div className="idle-resume-backdrop" role="dialog" aria-modal="true">
      <div className="idle-resume-panel">
        <div className="idle-resume-title">Are you still here?</div>
        <div className="idle-resume-sub">
          We paused the live stream to save bandwidth. The simulation is still running on
          the server — click Resume to reconnect.
        </div>
        <button className="idle-resume-btn" onClick={onResume} autoFocus>
          Resume
        </button>
      </div>
    </div>
  )
}
