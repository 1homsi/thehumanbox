import type { SceneFixture } from '../../../core/types'

interface Props {
  fixture: SceneFixture
}

export function Furniture({ fixture }: Props) {
  const { kind, x, y, label } = fixture
  switch (kind) {
    case 'hearth':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="6" rx="14" ry="4" fill="rgba(0,0,0,0.35)" />
          <circle cx="0" cy="0" r="11" fill="#3a2618" stroke="#1c0e08" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="7" fill="#e08038">
            <animate attributeName="r" values="6.5;7.5;6.5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="0" cy="0" r="3.5" fill="#f5d672" />
          <title>{label}</title>
        </g>
      )
    case 'mat':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-13" y="-5" width="26" height="10" rx="3" fill="#7c5a3a" stroke="#3a2618" strokeWidth="1" />
          <line x1="-13" y1="-2" x2="13" y2="-2" stroke="#3a2618" strokeWidth="0.5" opacity="0.5" />
          <line x1="-13" y1="2"  x2="13" y2="2"  stroke="#3a2618" strokeWidth="0.5" opacity="0.5" />
          <title>{label}</title>
        </g>
      )
    case 'storage':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-9" y="-7" width="18" height="14" fill="#6a4825" stroke="#2a1810" strokeWidth="1" rx="1.5" />
          <rect x="-9" y="-7" width="18" height="3"  fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'bench':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-12" y="-3" width="24" height="6" fill="#9b7042" stroke="#3a2618" strokeWidth="1" />
          <rect x="-10" y="3"  width="2" height="4"  fill="#3a2618" />
          <rect x="8"   y="3"  width="2" height="4"  fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'table':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-14" y="-4" width="28" height="8" fill="#a78050" stroke="#3a2618" strokeWidth="1" />
          <rect x="-13" y="4"  width="2"  height="5" fill="#3a2618" />
          <rect x="11"  y="4"  width="2"  height="5" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'shelf':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-7" width="20" height="14" fill="#7c5a3a" stroke="#3a2618" strokeWidth="1" />
          <line x1="-10" y1="-2" x2="10" y2="-2" stroke="#3a2618" strokeWidth="0.7" />
          <line x1="-10" y1="3"  x2="10" y2="3"  stroke="#3a2618" strokeWidth="0.7" />
          <rect x="-8" y="-6" width="3" height="3" fill="#d8b270" />
          <rect x="-2" y="-6" width="2" height="3" fill="#9b7042" />
          <rect x="2"  y="-1" width="3" height="3" fill="#d8b270" />
          <title>{label}</title>
        </g>
      )
    default:
      return null
  }
}
