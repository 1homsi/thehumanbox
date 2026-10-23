import { useMemo, useState } from 'react'
import type { OrganismState } from '../../shared/types'
import { lineageColor } from '../../shared/constants'
import { useFrozenSnapshot } from '../../shared/hooks/useFrozenSnapshot'
import { Modal } from './Modal'
import { formatNumber, t, type MessageKey } from '../../i18n'

const CONCEPT_SECTIONS: { label: MessageKey; concepts: string[] }[] = [
  {
    label: 'dialogs.language.sections.coreSurvival',
    concepts: [
      'food',
      'water',
      'fire',
      'danger',
      'friend',
      'foe',
      'shelter',
      'hunt',
      'night',
      'day',
      'sick',
      'home',
      'group',
      'alone',
    ],
  },
  {
    label: 'dialogs.language.sections.skyWeather',
    concepts: ['sun', 'moon', 'star', 'sky', 'rain', 'storm', 'wind', 'snow', 'ice', 'cloud'],
  },
  {
    label: 'dialogs.language.sections.landWater',
    concepts: [
      'river',
      'lake',
      'sea',
      'mountain',
      'forest',
      'tree',
      'grass',
      'stone',
      'sand',
      'earth',
      'cave',
      'path',
      'world',
    ],
  },
  {
    label: 'dialogs.language.sections.bodyVital',
    concepts: [
      'hunger',
      'thirst',
      'pain',
      'tired',
      'strong',
      'weak',
      'hurt',
      'heal',
      'rest',
      'sleep',
      'breath',
      'blood',
      'old',
      'young',
      'born',
      'death',
      'life',
    ],
  },
  {
    label: 'dialogs.language.sections.emotions',
    concepts: [
      'fear',
      'joy',
      'anger',
      'sad',
      'love',
      'hate',
      'calm',
      'brave',
      'lonely',
      'hope',
      'trust',
      'grief',
      'pride',
      'shame',
      'curious',
    ],
  },
  {
    label: 'dialogs.language.sections.kinRoles',
    concepts: ['kin', 'child', 'mother', 'father', 'elder', 'mate', 'stranger', 'leader', 'tribe', 'ally'],
  },
  {
    label: 'dialogs.language.sections.socialActs',
    concepts: [
      'gift',
      'share',
      'help',
      'teach',
      'learn',
      'story',
      'song',
      'dance',
      'play',
      'talk',
      'listen',
      'greet',
      'fight',
      'war',
      'peace',
      'trade',
    ],
  },
  {
    label: 'dialogs.language.sections.motionAction',
    concepts: [
      'go',
      'come',
      'stay',
      'run',
      'climb',
      'swim',
      'dig',
      'build',
      'break',
      'carry',
      'give',
      'find',
      'see',
      'hear',
      'hide',
      'watch',
      'follow',
      'lead',
      'gather',
      'plant',
      'make',
    ],
  },
  {
    label: 'dialogs.language.sections.qualitiesRelations',
    concepts: [
      'cold',
      'warm',
      'dark',
      'light',
      'big',
      'small',
      'near',
      'far',
      'many',
      'good',
      'bad',
      'new',
      'here',
      'there',
    ],
  },
  {
    label: 'dialogs.language.sections.toolsResources',
    concepts: [
      'meat',
      'berry',
      'root',
      'wood',
      'tool',
      'trap',
      'spear',
      'basket',
      'medicine',
      'farm',
      'nest',
      'name',
      'time',
      'season',
    ],
  },
  {
    label: 'dialogs.language.sections.bodySenses',
    concepts: ['eye', 'ear', 'hand', 'foot', 'mouth', 'skin', 'heart', 'voice', 'scent', 'bone'],
  },
  {
    label: 'dialogs.language.sections.familyLife',
    concepts: [
      'birth',
      'wedding',
      'funeral',
      'ancestor',
      'twin',
      'orphan',
      'widow',
      'sibling',
      'blood-kin',
      'lineage',
    ],
  },
  {
    label: 'dialogs.language.sections.animals',
    concepts: [
      'wolf',
      'bird',
      'deer',
      'bear',
      'snake',
      'insect',
      'beast',
      'prey',
      'predator',
      'flock',
      'pack',
      'swarm',
    ],
  },
  {
    label: 'dialogs.language.sections.terrain',
    concepts: [
      'cliff',
      'ridge',
      'plain',
      'marsh',
      'swamp',
      'oasis',
      'dune',
      'glacier',
      'shore',
      'island',
      'crater',
      'gorge',
      'meadow',
      'grove',
      'thicket',
      'clearing',
      'valley',
      'hill',
      'spring',
    ],
  },
  {
    label: 'dialogs.language.sections.weatherSky',
    concepts: [
      'dawn',
      'dusk',
      'twilight',
      'fog',
      'frost',
      'hail',
      'thunder',
      'lightning',
      'rainbow',
      'drought',
      'flood',
      'heat',
      'eclipse',
    ],
  },
  {
    label: 'dialogs.language.sections.materials',
    concepts: [
      'clay',
      'mud',
      'hide',
      'fur',
      'feather',
      'shell',
      'salt',
      'charcoal',
      'ore',
      'metal',
      'gem',
      'flint',
      'thread',
    ],
  },
  {
    label: 'dialogs.language.sections.abstract',
    concepts: [
      'truth',
      'lie',
      'secret',
      'promise',
      'oath',
      'law',
      'custom',
      'tradition',
      'memory',
      'dream',
      'idea',
      'plan',
      'choice',
      'fate',
      'luck',
      'omen',
      'sign',
      'mystery',
      'wisdom',
      'honor',
      'duty',
      'freedom',
      'power',
      'change',
      'beginning',
      'ending',
      'journey',
      'return',
      'loss',
      'gain',
      'debt',
      'balance',
    ],
  },
  {
    label: 'dialogs.language.sections.moreActs',
    concepts: [
      'bless',
      'curse',
      'forgive',
      'betray',
      'protect',
      'abandon',
      'rescue',
      'sacrifice',
      'scatter',
      'destroy',
      'create',
      'mend',
      'sharpen',
      'carve',
      'weave',
      'guard',
      'chase',
      'flee',
      'attack',
      'defend',
    ],
  },
  {
    label: 'dialogs.language.sections.quantity',
    concepts: [
      'one',
      'two',
      'three',
      'half',
      'whole',
      'none',
      'all',
      'more',
      'less',
      'enough',
      'empty',
      'full',
    ],
  },
  {
    label: 'dialogs.language.sections.colours',
    concepts: ['red', 'blue', 'green', 'yellow', 'white', 'black', 'brown', 'grey'],
  },
  {
    label: 'dialogs.language.sections.plants',
    concepts: [
      'flower',
      'leaf',
      'seed',
      'vine',
      'moss',
      'fern',
      'reed',
      'bark',
      'branch',
      'thorn',
      'fruit',
      'nut',
      'herb',
      'sprout',
      'blossom',
    ],
  },
  {
    label: 'dialogs.language.sections.finerTime',
    concepts: [
      'morning',
      'noon',
      'evening',
      'midnight',
      'year',
      'moment',
      'forever',
      'soon',
      'early',
      'late',
    ],
  },
  {
    label: 'dialogs.language.sections.directions',
    concepts: [
      'north',
      'south',
      'east',
      'west',
      'up',
      'down',
      'forward',
      'back',
      'between',
      'above',
      'below',
      'inside',
      'outside',
      'around',
    ],
  },
  {
    label: 'dialogs.language.sections.sounds',
    concepts: [
      'cry',
      'shout',
      'whisper',
      'laugh',
      'roar',
      'howl',
      'call',
      'echo',
      'silence',
      'noise',
      'growl',
      'hum',
    ],
  },
  {
    label: 'dialogs.language.sections.finerFeelings',
    concepts: [
      'worry',
      'relief',
      'longing',
      'envy',
      'gratitude',
      'regret',
      'awe',
      'disgust',
      'surprise',
      'sorrow',
      'delight',
      'dread',
      'yearning',
      'serenity',
    ],
  },
  {
    label: 'dialogs.language.sections.socialStructures',
    concepts: [
      'council',
      'clan',
      'family',
      'band',
      'gathering',
      'market',
      'border',
      'neighbor',
      'kinship',
      'guest',
    ],
  },
  {
    label: 'dialogs.language.sections.bodyActions',
    concepts: [
      'jump',
      'crawl',
      'crouch',
      'reach',
      'grab',
      'throw',
      'push',
      'pull',
      'kick',
      'bite',
      'sniff',
      'blink',
      'nod',
      'point',
      'wave',
      'kneel',
    ],
  },
  {
    label: 'dialogs.language.sections.languageMeaning',
    concepts: [
      'question',
      'answer',
      'word',
      'language',
      'speech',
      'skill',
      'craft',
      'work',
      'effort',
      'ease',
      'meaning',
      'purpose',
      'reason',
      'cause',
    ],
  },
  {
    label: 'dialogs.language.sections.physicalQualities',
    concepts: [
      'heavy',
      'hard',
      'soft',
      'sharp',
      'dull',
      'smooth',
      'rough',
      'wet',
      'dry',
      'hot',
      'fast',
      'slow',
      'loud',
      'quiet',
      'bright',
      'deep',
      'shallow',
      'high',
      'low',
      'wide',
    ],
  },
]

const ALL_CONCEPTS = CONCEPT_SECTIONS.flatMap((s) => s.concepts)

interface Props {
  organisms: OrganismState[]
  lineageWords?: Record<string, Record<string, string>>
  sexWords?: [string, string]
  onClose: () => void
  lineageNames?: Record<string, string>
}

interface LineageVocab {
  lineageId: string
  words: Record<string, string>
  count: number
}

function buildLineageVocabs(
  organisms: OrganismState[],
  lineageWords?: Record<string, Record<string, string>>,
): LineageVocab[] {
  const byLineage: Record<string, OrganismState[]> = {}
  for (const org of organisms) {
    if (!byLineage[org.lineage_id]) byLineage[org.lineage_id] = []
    byLineage[org.lineage_id].push(org)
  }

  return Object.entries(byLineage)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([lid, orgs]) => {
      const words =
        lineageWords?.[lid] ??
        (() => {
          const legacyWords: Record<string, string> = {}
          for (const concept of ALL_CONCEPTS) {
            const counts: Record<string, number> = {}
            for (const org of orgs) {
              const w = org.vocabulary?.[concept]
              if (w) counts[w] = (counts[w] ?? 0) + 1
            }
            const entries = Object.entries(counts)
            if (entries.length) {
              legacyWords[concept] = entries.sort((a, b) => b[1] - a[1])[0][0]
            }
          }
          return legacyWords
        })()
      return { lineageId: lid, words, count: orgs.length }
    })
}

export function LanguageModal({ organisms, lineageWords, sexWords, onClose, lineageNames }: Props) {
  const { frozen, reload } = useFrozenSnapshot(() => ({ organisms, lineageWords }))
  const lineages = buildLineageVocabs(frozen.organisms, frozen.lineageWords)
  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filteredSections = useMemo(() => {
    if (!q) return CONCEPT_SECTIONS
    return CONCEPT_SECTIONS.map((s) => ({
      label: s.label,
      concepts: s.concepts.filter((c) => {
        if (c.toLowerCase().includes(q)) return true
        return lineages.some((l) => l.words[c]?.toLowerCase().includes(q))
      }),
    })).filter((s) => s.concepts.length > 0)
  }, [q, lineages])

  const totalMatches = filteredSections.reduce((n, s) => n + s.concepts.length, 0)

  return (
    <Modal open onClose={onClose} className="lang-modal" title={t('dialogs.language.title')} hideTitle>
      <div className="lang-modal-header">
        <span className="lang-modal-title">{t('dialogs.language.heading')}</span>
        <div className="modal-header-actions">
          <button className="reload-btn" onClick={reload} title={t('dialogs.language.reload')}>
            ⟳
          </button>
          <button aria-label={t('dialogs.language.close')} className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="lang-modal-body">
        <p className="lang-modal-sub">{t('dialogs.language.intro')}</p>

        {sexWords && (
          <div className="lang-sex-words">
            <span className="lang-sex-label">{t('dialogs.language.sexWords')}</span>
            <span className="lang-sex-word lang-sex-word-0">{sexWords[0]}</span>
            <span className="lang-sex-divider">·</span>
            <span className="lang-sex-word lang-sex-word-1">{sexWords[1]}</span>
            <span className="lang-sex-note">{t('dialogs.language.sexNote')}</span>
          </div>
        )}

        <div className="lang-search-row">
          <input
            className="lang-search"
            type="text"
            placeholder={t('dialogs.language.placeholder', { count: formatNumber(ALL_CONCEPTS.length) })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {q && (
            <span className="lang-search-count">
              {t('dialogs.language.matches', { count: totalMatches })}
              <button className="lang-search-clear" onClick={() => setQuery('')}>
                ✕
              </button>
            </span>
          )}
        </div>

        <div className="lang-table-wrap">
          {filteredSections.map((section) => (
            <div key={section.label} className="lang-section">
              <div className="lang-section-header">{t(section.label)}</div>
              <div
                className="lang-table"
                style={{ gridTemplateColumns: `120px repeat(${lineages.length}, 1fr)` }}
              >
                <div className="lang-th lang-concept-col">{t('dialogs.language.concept')}</div>
                {lineages.map((l) => (
                  <div key={l.lineageId} className="lang-th lang-lineage-col">
                    <span className="lang-lineage-dot" style={{ background: lineageColor(l.lineageId) }} />
                    {tn(l.lineageId)}
                    <span className="lang-lineage-count">×{l.count}</span>
                  </div>
                ))}

                {section.concepts.map((concept) => (
                  <div key={concept} className="lang-row-wrapper" style={{ display: 'contents' }}>
                    <div className="lang-td lang-concept-col lang-english">{concept}</div>
                    {lineages.map((l) => {
                      const word = l.words[concept]
                      const isMatch = q && word?.toLowerCase().includes(q)
                      return (
                        <div
                          key={`${l.lineageId}-${concept}`}
                          className={`lang-td lang-lineage-col lang-word ${isMatch ? 'lang-word-match' : ''}`}
                        >
                          {word ?? <span className="lang-unknown">-</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredSections.length === 0 && (
            <div className="lang-empty">{t('dialogs.language.noMatch', { query })}</div>
          )}
        </div>
      </div>
    </Modal>
  )
}
