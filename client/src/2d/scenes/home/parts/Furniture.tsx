import type { SceneFixture } from '../../../../scenes/core/types'

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
          <line x1="-13" y1="2" x2="13" y2="2" stroke="#3a2618" strokeWidth="0.5" opacity="0.5" />
          <title>{label}</title>
        </g>
      )
    case 'storage':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-9" y="-7" width="18" height="14" fill="#6a4825" stroke="#2a1810" strokeWidth="1" rx="1.5" />
          <rect x="-9" y="-7" width="18" height="3" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'bench':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-12" y="-3" width="24" height="6" fill="#9b7042" stroke="#3a2618" strokeWidth="1" />
          <rect x="-10" y="3" width="2" height="4" fill="#3a2618" />
          <rect x="8" y="3" width="2" height="4" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'table':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-14" y="-4" width="28" height="8" fill="#a78050" stroke="#3a2618" strokeWidth="1" />
          <rect x="-13" y="4" width="2" height="5" fill="#3a2618" />
          <rect x="11" y="4" width="2" height="5" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'shelf':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-7" width="20" height="14" fill="#7c5a3a" stroke="#3a2618" strokeWidth="1" />
          <line x1="-10" y1="-2" x2="10" y2="-2" stroke="#3a2618" strokeWidth="0.7" />
          <line x1="-10" y1="3" x2="10" y2="3" stroke="#3a2618" strokeWidth="0.7" />
          <rect x="-8" y="-6" width="3" height="3" fill="#d8b270" />
          <rect x="-2" y="-6" width="2" height="3" fill="#9b7042" />
          <rect x="2" y="-1" width="3" height="3" fill="#d8b270" />
          <title>{label}</title>
        </g>
      )
    case 'rug':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-16" y="-8" width="32" height="16" rx="1" fill="#8a3a3a" stroke="#3a1818" strokeWidth="0.8" />
          <rect x="-13" y="-5" width="26" height="10" fill="none" stroke="#d8b270" strokeWidth="0.7" />
          <rect x="-2" y="-2" width="4" height="4" fill="#d8b270" opacity="0.7" />
          <title>{label}</title>
        </g>
      )
    case 'oil_lamp':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="3" rx="4" ry="1.4" fill="#3a2618" />
          <rect x="-3" y="-2" width="6" height="5" rx="1.5" fill="#a87850" stroke="#3a2618" strokeWidth="0.8" />
          <circle cx="0" cy="-3" r="1.4" fill="#ffd06a">
            <animate attributeName="r" values="1.2;1.6;1.2" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <title>{label}</title>
        </g>
      )
    case 'clay_pot':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="0" rx="5" ry="6" fill="#a86848" stroke="#3a2618" strokeWidth="0.8" />
          <ellipse cx="0" cy="-5" rx="4" ry="1" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'wine_jug':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="6" rx="4" ry="1" fill="#1a1208" />
          <path d="M -4 4 Q -5 -2 -2 -6 L 2 -6 Q 5 -2 4 4 Z" fill="#6a3838" stroke="#3a1818" strokeWidth="0.8" />
          <path d="M 3 -3 Q 6 -2 5 1" fill="none" stroke="#3a1818" strokeWidth="1" />
          <title>{label}</title>
        </g>
      )
    case 'painting':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-9" y="-7" width="18" height="14" fill="#3a2618" />
          <rect x="-7.5" y="-5.5" width="15" height="11" fill="#5e7090" />
          <circle cx="3" cy="-1" r="3" fill="#f8d870" />
          <path d="M -7 5 L -3 1 L 0 3 L 7 -2 L 7 5 Z" fill="#5a4030" />
          <title>{label}</title>
        </g>
      )
    case 'bookshelf':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-10" width="20" height="20" fill="#5a3818" stroke="#1c0e08" strokeWidth="1" />
          {[-8, -4, 0, 4].map((py, i) => (
            <g key={i}>
              <line x1="-10" y1={py + 1} x2="10" y2={py + 1} stroke="#1c0e08" strokeWidth="0.6" />
              <rect x={-9 + i * 0.3} y={py - 2} width="2" height="4" fill="#8a3a3a" />
              <rect x={-6 + i * 0.3} y={py - 2.5} width="1.8" height="4.5" fill="#3a5a8a" />
              <rect x={-3 + i * 0.3} y={py - 2} width="2" height="4" fill="#d8b270" />
              <rect x={0 + i * 0.3} y={py - 2.2} width="1.6" height="4.2" fill="#5a8a3a" />
            </g>
          ))}
          <title>{label}</title>
        </g>
      )
    case 'writing_desk':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-13" y="-4" width="26" height="8" fill="#7c5a3a" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-12" y="4" width="2" height="6" fill="#3a2618" />
          <rect x="10" y="4" width="2" height="6" fill="#3a2618" />
          <rect x="-5" y="-3" width="6" height="4" fill="#f0e8d0" />
          <rect x="2" y="-3" width="2" height="2" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'wardrobe':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-7" y="-12" width="14" height="24" fill="#6a4825" stroke="#1c0e08" strokeWidth="1" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke="#1c0e08" strokeWidth="0.8" />
          <circle cx="-2" cy="0" r="0.6" fill="#d8b270" />
          <circle cx="2" cy="0" r="0.6" fill="#d8b270" />
          <title>{label}</title>
        </g>
      )
    case 'mirror':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-5" y="-10" width="10" height="20" rx="5" fill="#a09078" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-3.5" y="-8.5" width="7" height="17" rx="3.5" fill="#c8d8e8" opacity="0.9" />
          <line x1="-2.5" y1="-6" x2="2.5" y2="6" stroke="#fff" strokeWidth="0.8" opacity="0.5" />
          <title>{label}</title>
        </g>
      )
    case 'vase_flowers':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d="M -3 6 L -3 0 Q -3 -2 -2 -3 L 2 -3 Q 3 -2 3 0 L 3 6 Z" fill="#6890b0" stroke="#1c0e08" strokeWidth="0.6" />
          <circle cx="-2" cy="-5" r="2" fill="#d8485e" />
          <circle cx="2" cy="-6" r="1.8" fill="#f8c060" />
          <circle cx="0" cy="-7" r="1.6" fill="#e88da0" />
          <line x1="-2" y1="-4" x2="-2" y2="-2" stroke="#3a6020" strokeWidth="0.6" />
          <line x1="2" y1="-5" x2="2" y2="-2" stroke="#3a6020" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'potted_plant':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d="M -4 6 L -3 0 L 3 0 L 4 6 Z" fill="#8a4828" stroke="#1c0e08" strokeWidth="0.6" />
          <ellipse cx="-2" cy="-3" rx="2.5" ry="3.5" fill="#3a6020" />
          <ellipse cx="2" cy="-2" rx="2.2" ry="3" fill="#5a8030" />
          <ellipse cx="0" cy="-5" rx="2" ry="2.5" fill="#3a6020" />
          <title>{label}</title>
        </g>
      )
    case 'fireplace':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-10" width="20" height="20" fill="#5a4030" stroke="#1c0e08" strokeWidth="1" />
          <rect x="-7" y="-3" width="14" height="13" fill="#1a0e08" />
          <path d="M -5 9 Q -3 0 0 -1 Q 3 0 5 9 Z" fill="#e08038">
            <animate attributeName="opacity" values="0.85;1;0.85" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M -2 9 Q -1 4 0 3 Q 1 4 2 9 Z" fill="#f5d672" />
          <rect x="-10" y="-11" width="20" height="2" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'four_poster_bed':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-14" y="-6" width="28" height="12" fill="#6a3838" stroke="#1c0e08" strokeWidth="1" />
          <rect x="-14" y="-6" width="28" height="3" fill="#e8d0a0" />
          <rect x="-13" y="-10" width="1.5" height="16" fill="#3a2618" />
          <rect x="11.5" y="-10" width="1.5" height="16" fill="#3a2618" />
          <line x1="-13" y1="-10" x2="13" y2="-10" stroke="#3a2618" strokeWidth="1" />
          <ellipse cx="-10" cy="-4" rx="2.5" ry="1.5" fill="#f5eada" />
          <ellipse cx="-6" cy="-4" rx="2.5" ry="1.5" fill="#f5eada" />
          <title>{label}</title>
        </g>
      )
    case 'armchair':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-8" y="-2" width="16" height="10" rx="2" fill="#5a3838" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-10" y="-8" width="3" height="14" rx="1.5" fill="#5a3838" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="7" y="-8" width="3" height="14" rx="1.5" fill="#5a3838" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-7" y="-8" width="14" height="6" rx="2" fill="#6a4848" stroke="#1c0e08" strokeWidth="0.8" />
          <title>{label}</title>
        </g>
      )
    case 'sofa':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-15" y="-2" width="30" height="9" rx="2" fill="#3a5a7a" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-17" y="-5" width="3" height="12" rx="1.5" fill="#3a5a7a" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="14" y="-5" width="3" height="12" rx="1.5" fill="#3a5a7a" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-14" y="-7" width="28" height="6" rx="2" fill="#4a6a8a" stroke="#1c0e08" strokeWidth="0.8" />
          <line x1="0" y1="-7" x2="0" y2="-1" stroke="#1c0e08" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'coffee_table':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-10" y="-3" width="20" height="5" rx="0.8" fill="#3a2618" stroke="#1c0e08" strokeWidth="0.6" />
          <rect x="-9" y="2" width="1.5" height="4" fill="#3a2618" />
          <rect x="7.5" y="2" width="1.5" height="4" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'piano':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-12" y="-7" width="24" height="14" fill="#1c0e08" stroke="#000" strokeWidth="0.8" />
          <rect x="-11" y="3" width="22" height="4" fill="#f5eada" />
          {[-9, -6, -3, 0, 3, 6, 9].map((kx, i) => (
            <rect key={i} x={kx - 0.4} y={3} width="0.8" height="3" fill="#1c0e08" />
          ))}
          <title>{label}</title>
        </g>
      )
    case 'gramophone':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-6" y="2" width="12" height="6" fill="#5a3818" stroke="#1c0e08" strokeWidth="0.6" />
          <circle cx="0" cy="2" r="3.5" fill="#1c0e08" />
          <circle cx="0" cy="2" r="0.6" fill="#d8b270" />
          <path d="M 0 -1 L -4 -8 L 4 -8 Z" fill="#a87850" stroke="#1c0e08" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'clock':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle cx="0" cy="0" r="6" fill="#f0e8d0" stroke="#1c0e08" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="-4" stroke="#1c0e08" strokeWidth="1" />
          <line x1="0" y1="0" x2="3" y2="0" stroke="#1c0e08" strokeWidth="0.8" />
          <circle cx="0" cy="0" r="0.6" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'globe':
      return (
        <g transform={`translate(${x} ${y})`}>
          <line x1="0" y1="6" x2="0" y2="9" stroke="#3a2618" strokeWidth="1" />
          <circle cx="0" cy="0" r="6" fill="#3a6890" stroke="#1c0e08" strokeWidth="0.8" />
          <path d="M -4 -1 Q -2 -3 0 -2 Q 2 -1 4 -3" fill="none" stroke="#3a8a3a" strokeWidth="1.4" />
          <path d="M -3 3 Q -1 4 1 3 Q 3 2 4 3" fill="none" stroke="#3a8a3a" strokeWidth="1.2" />
          <title>{label}</title>
        </g>
      )
    case 'telescope_decor':
      return (
        <g transform={`translate(${x} ${y})`}>
          <line x1="0" y1="6" x2="-3" y2="8" stroke="#1c0e08" strokeWidth="1.5" />
          <line x1="0" y1="6" x2="3" y2="8" stroke="#1c0e08" strokeWidth="1.5" />
          <line x1="0" y1="6" x2="0" y2="8" stroke="#1c0e08" strokeWidth="1.5" />
          <rect x="-1.5" y="-6" width="3" height="12" transform="rotate(25)" fill="#3a4868" stroke="#1c0e08" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'radio_set':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-7" y="-5" width="14" height="10" rx="1" fill="#5a3818" stroke="#1c0e08" strokeWidth="0.6" />
          <rect x="-5" y="-3.5" width="6" height="5" fill="#1c0e08" />
          <circle cx="3.5" cy="-1" r="1.2" fill="#d8b270" />
          <circle cx="3.5" cy="2" r="1.2" fill="#d8b270" />
          <line x1="0" y1="-7" x2="0" y2="-5" stroke="#1c0e08" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'television':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-12" y="-7" width="24" height="14" rx="1.5" fill="#1c0e08" stroke="#000" strokeWidth="0.8" />
          <rect x="-10" y="-5" width="20" height="10" fill="#506880">
            <animate attributeName="fill" values="#506880;#607890;#506880" dur="3s" repeatCount="indefinite" />
          </rect>
          <rect x="-3" y="7" width="6" height="2" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'refrigerator':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-6" y="-12" width="12" height="24" rx="1" fill="#e8e8e8" stroke="#1c0e08" strokeWidth="0.8" />
          <line x1="-6" y1="-3" x2="6" y2="-3" stroke="#1c0e08" strokeWidth="0.6" />
          <rect x="4" y="-9" width="0.8" height="2.5" fill="#1c0e08" />
          <rect x="4" y="2" width="0.8" height="2.5" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'desk_lamp':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="6" rx="3" ry="1" fill="#3a2618" />
          <line x1="0" y1="5" x2="0" y2="-3" stroke="#3a2618" strokeWidth="1.5" />
          <line x1="0" y1="-3" x2="-3" y2="-6" stroke="#3a2618" strokeWidth="1.5" />
          <path d="M -5 -4 L -1 -8 L -7 -8 Z" fill="#d8b270" stroke="#1c0e08" strokeWidth="0.6" />
          <circle cx="-4" cy="-6" r="0.8" fill="#ffd06a">
            <animate attributeName="r" values="0.7;0.9;0.7" dur="2s" repeatCount="indefinite" />
          </circle>
          <title>{label}</title>
        </g>
      )
    case 'computer_desk':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-13" y="-2" width="26" height="6" fill="#5a3a28" stroke="#1c0e08" strokeWidth="0.8" />
          <rect x="-12" y="4" width="2" height="6" fill="#3a2618" />
          <rect x="10" y="4" width="2" height="6" fill="#3a2618" />
          <rect x="-7" y="-9" width="14" height="9" fill="#1c0e08" stroke="#000" strokeWidth="0.5" />
          <rect x="-6" y="-8" width="12" height="7" fill="#3a6890">
            <animate attributeName="fill" values="#3a6890;#4a7aa0;#3a6890" dur="3.5s" repeatCount="indefinite" />
          </rect>
          <rect x="-2" y="0.5" width="4" height="1.5" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'monitor':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-8" y="-6" width="16" height="10" fill="#1c0e08" stroke="#000" strokeWidth="0.6" />
          <rect x="-7" y="-5" width="14" height="8" fill="#3a6a8a">
            <animate attributeName="fill" values="#3a6a8a;#4a7a9a;#3a6a8a" dur="4s" repeatCount="indefinite" />
          </rect>
          <rect x="-1.5" y="4" width="3" height="2" fill="#1c0e08" />
          <rect x="-3" y="6" width="6" height="1" fill="#3a2618" />
          <title>{label}</title>
        </g>
      )
    case 'smart_speaker':
      return (
        <g transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="5" rx="4" ry="1" fill="#1c0e08" />
          <rect x="-3.5" y="-5" width="7" height="10" rx="3" fill="#2a2a3a" stroke="#1c0e08" strokeWidth="0.6" />
          <circle cx="0" cy="-2" r="1.2" fill="#5a8aff" opacity="0.8">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <title>{label}</title>
        </g>
      )
    case 'standing_plant':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d="M -5 8 L -3 -2 L 3 -2 L 5 8 Z" fill="#8a4828" stroke="#1c0e08" strokeWidth="0.6" />
          <ellipse cx="-3" cy="-6" rx="3" ry="5" fill="#3a6020" />
          <ellipse cx="3" cy="-5" rx="3.2" ry="5.5" fill="#5a8030" />
          <ellipse cx="0" cy="-9" rx="2.5" ry="4" fill="#3a6020" />
          <ellipse cx="-1" cy="-4" rx="2" ry="3" fill="#4a7028" />
          <title>{label}</title>
        </g>
      )
    case 'art_print':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-7" y="-9" width="14" height="18" fill="#f0e8d0" stroke="#3a2618" strokeWidth="0.8" />
          <rect x="-6" y="-8" width="12" height="16" fill="none" stroke="#a87850" strokeWidth="0.4" />
          <circle cx="-2" cy="-3" r="2.5" fill="#d8485e" opacity="0.6" />
          <circle cx="2" cy="2" r="2" fill="#3a6890" opacity="0.6" />
          <circle cx="0" cy="-1" r="1.5" fill="#f8c060" opacity="0.6" />
          <title>{label}</title>
        </g>
      )
    case 'photo_frame':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-6" y="-7" width="12" height="14" fill="#3a2618" />
          <rect x="-5" y="-6" width="10" height="12" fill="#e8d8b0" />
          <circle cx="-1" cy="-2" r="2" fill="#a87858" />
          <rect x="-5" y="2" width="10" height="4" fill="#5a7890" opacity="0.5" />
          <title>{label}</title>
        </g>
      )
    case 'kitchen_stove':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-8" y="-7" width="16" height="14" rx="1" fill="#c8c8c8" stroke="#1c0e08" strokeWidth="0.8" />
          <circle cx="-4" cy="-3" r="1.4" fill="#1c0e08" />
          <circle cx="4" cy="-3" r="1.4" fill="#1c0e08" />
          <circle cx="-4" cy="2" r="1.4" fill="#1c0e08" />
          <circle cx="4" cy="2" r="1.4" fill="#1c0e08" />
          <rect x="-7" y="5" width="14" height="2" fill="#1c0e08" />
          <title>{label}</title>
        </g>
      )
    case 'loom':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-9" y="-8" width="2" height="16" fill="#5a3818" />
          <rect x="7" y="-8" width="2" height="16" fill="#5a3818" />
          <rect x="-7" y="-7" width="14" height="2" fill="#3a2618" />
          <rect x="-7" y="5" width="14" height="2" fill="#3a2618" />
          {[-5, -3, -1, 1, 3, 5].map((wx, i) => (
            <line key={i} x1={wx} y1="-5" x2={wx} y2="5" stroke="#d8b270" strokeWidth="0.4" />
          ))}
          <rect x="-7" y="-1" width="14" height="2" fill="#a87850" />
          <title>{label}</title>
        </g>
      )
    case 'anvil':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x="-5" y="2" width="10" height="5" fill="#3a2618" stroke="#1c0e08" strokeWidth="0.6" />
          <rect x="-3" y="0" width="6" height="2" fill="#5a4838" />
          <path d="M -8 -4 L -8 0 L 8 0 L 8 -4 L 6 -6 L -6 -6 Z" fill="#4a4858" stroke="#1c0e08" strokeWidth="0.6" />
          <title>{label}</title>
        </g>
      )
    default:
      return null
  }
}
