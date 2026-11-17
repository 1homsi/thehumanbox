import { Tooltip } from '../../toolbar/Tooltip'

function InfoTip({ tip }: { tip: string }) {
  return (
    <Tooltip tip={tip}>
      <span className="wp-info" role="img" aria-label={tip} tabIndex={0}>
        i
      </span>
    </Tooltip>
  )
}

export function SectionHead({ title, tip }: { title: string; tip?: string }) {
  return (
    <div className="section-title wp-section-title">
      <span>{title}</span>
      {tip && <InfoTip tip={tip} />}
    </div>
  )
}
