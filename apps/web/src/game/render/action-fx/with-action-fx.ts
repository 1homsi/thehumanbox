import { t } from '../../../i18n'
import { describeOutcome, type CommandOutcome } from '../../../simulation/command-outcome'
import type { SandboxCommand } from '../../../simulation/sandbox'
import { fxForCommand, type PlannedFx } from './fx-kinds'
import { playFx, showFloat, type FloatTone } from './fx-store'

type Sender = (cmd: SandboxCommand) => Promise<CommandOutcome>

/** Result codes that tell of harm done, drawn in the warning colour. */
const HARM = new Set([
  'disaster_killed',
  'disaster_hurt',
  'disaster_sick',
  'disaster_food',
  'disaster_buildings',
  'smitten',
  'struck_beast',
  'struck_roof',
  'cursed',
])

/** The colour a result floats up in. */
export function floatTone(outcome: CommandOutcome): FloatTone {
  if (!outcome.applied) return 'info'
  if (HARM.has(outcome.code)) return 'harm'
  if (outcome.code.startsWith('disaster_') || outcome.code.startsWith('none_') || outcome.code === 'applied')
    return 'info'
  return 'help'
}

/** The short line that floats up where a tool landed, or null when there is nothing worth saying. */
export function floatText(outcome: CommandOutcome): string | null {
  const said = describeOutcome(outcome)
  if (said) return said
  return outcome.applied ? null : t('header.sandbox.float.noEffect')
}

/**
 * Wraps the command sender so every god tool plays its effect where it lands the moment it is sent,
 * and floats what it did up from that spot once the simulation answers.
 */
export function withActionFx(send: Sender): Sender {
  return (cmd) => {
    const planned: PlannedFx | null = fxForCommand(cmd)
    if (planned) playFx(planned.kind, planned.x, planned.y, planned.r)
    return send(cmd).then((outcome) => {
      if (planned && planned.x !== null && planned.y !== null) {
        const text = floatText(outcome)
        if (text) showFloat(text, planned.x, planned.y, floatTone(outcome))
      }
      return outcome
    })
  }
}
