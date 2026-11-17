import clsx from 'clsx'
import { PixelIcon, type SpriteName } from '../../toolbar/ToolSprite'
import { Tooltip } from '../../toolbar/Tooltip'

export function PersonAction({
  icon,
  label,
  text,
  onClick,
  active,
  className,
  disabled,
}: {
  icon: SpriteName
  label: string
  text?: string
  onClick: () => void
  active?: boolean
  className?: string
  disabled?: boolean
}) {
  return (
    <Tooltip tip={label}>
      <button
        type="button"
        className={clsx('person-action', text && 'with-text', active && 'active', className)}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <PixelIcon name={icon} size={text ? 16 : 14} />
        {text && <span>{text}</span>}
      </button>
    </Tooltip>
  )
}
