import { t, type MessageKey } from '../../i18n'
import en from '../../i18n/locales/en'
import { commandReach, reachesArea, type SandboxTool } from '../../simulation/sandbox'

/** The dock's text for a tool, from `dock.tools` or `dock.tips`; undefined when the tool has none. */
function textFor(section: 'tools' | 'tips', id: string, own?: MessageKey): string | undefined {
  const key = own ?? (`dock.${section}.${id}` as MessageKey)
  const text = t(key)
  // t() hands back the key itself when no text exists for it.
  return text === key ? undefined : text
}

/** The tool's name in the active language. */
export function toolName(tool: SandboxTool): string {
  return textFor('tools', tool.id, tool.name) ?? tool.label
}

/** One-line description shown in dock tooltips. */
export function toolTip(tool: SandboxTool): string {
  return textFor('tips', tool.id, tool.tip) ?? tool.description ?? toolName(tool)
}

/** The English description, so search finds a tool by its English tip whatever the language. */
export function englishTip(tool: SandboxTool): string {
  const path = (tool.tip ?? `dock.tips.${tool.id}`).split('.')
  const text = path.reduce<unknown>(
    (node, part) =>
      node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, part)
        ? (node as Record<string, unknown>)[part]
        : undefined,
    en,
  )
  return typeof text === 'string' ? text : (tool.description ?? tool.label)
}

export function toolHowTo(tool: SandboxTool, brush = 0): string {
  if (tool.view) return t('dock.how.toggleLayer')
  if (tool.mode === 'instant') return t('dock.how.applyAtOnce')
  return t('dock.how.howTo', { reach: toolReach(tool, brush) })
}

/**
 * What a point tool reaches at this brush size: its radius in tiles, and how many it brings when
 * it has a count (animals, people). Read from the command the tool builds, so it follows the
 * tool's own rule. Empty for tools that take no brush.
 */
export function toolReach(tool: SandboxTool, brush: number): string {
  if (!tool.build) return ''
  const built = tool.build(0, 0, brush)
  const cmd = built as { radius?: number; count?: number }
  const bits: string[] = []
  if (reachesArea(built)) bits.push(t('dock.how.reachTiles', { tiles: Math.round(commandReach(built)) }))
  // One animal per click is the norm and not worth saying; only a tool that brings several does.
  if (typeof cmd.count === 'number' && cmd.count > 1) bits.push(t('dock.how.brings', { count: cmd.count }))
  return bits.length ? `${bits.join(' · ')} · ` : ''
}

/** Why a tool did nothing when the simulation rejects it. */
export function toolFailure(tool: SandboxTool): string {
  return t(tool.failure ?? 'dock.failures.didNotWork')
}

/**
 * Whether a tool acts on the world the moment it is picked (a storm, a drought), rather than arming
 * for a click on the map or changing what the map shows. On touch, where there is no hover to read
 * its name first, such a tool asks for a second tap.
 */
export function firesOnPick(tool: SandboxTool): boolean {
  return tool.mode === 'instant' && tool.fire !== undefined
}
