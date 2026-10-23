import { SANDBOX_CATEGORIES, type SandboxCategory, type SandboxTool } from '../../simulation/sandbox'
import { englishTip, toolName, toolTip } from './tool-tips'
import { groupName } from './dock-tabs'

/** The words a tool is found by, in one language: its name, id, category and tip. */
interface Words {
  label: string
  category: string
  tip: string
}

/** How well one query word matches a tool: a label word beats a prefix, a prefix beats a substring. */
function wordScore(word: string, tool: SandboxTool, { label, category, tip }: Words): number {
  const name = label.toLowerCase()
  const labelWords = name.split(/\s+/)
  if (labelWords.includes(word)) return 4
  if (labelWords.some((w) => w.startsWith(word))) return 3
  if (`${name} ${tool.id.toLowerCase()} ${category.toLowerCase()}`.includes(word)) return 2
  // The tooltip says what a tool does, so "forgive" can find a tool whose tip mentions it.
  if (tip.toLowerCase().includes(word)) return 1
  return 0
}

/**
 * A player may search in the active language or in English, so each word is scored against both
 * and keeps the better match.
 */
function bestScore(word: string, tool: SandboxTool, category: SandboxCategory): number {
  const inLanguage: Words = { label: toolName(tool), category: groupName(category), tip: toolTip(tool) }
  const inEnglish: Words = { label: tool.label, category: category.label, tip: englishTip(tool) }
  return Math.max(wordScore(word, tool, inLanguage), wordScore(word, tool, inEnglish))
}

export function searchWorldTools(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits = SANDBOX_CATEGORIES.flatMap((category) =>
    category.tools.map((tool) => ({ category, tool })),
  ).flatMap((hit) => {
    const scores = words.map((word) => bestScore(word, hit.tool, hit.category))
    if (scores.some((score) => score === 0)) return []
    return [{ ...hit, score: scores.reduce((sum, score) => sum + score, 0) }]
  })
  // Best matches first; the catalogue order breaks ties, so an empty query keeps the dock order.
  return hits
    .sort((a, b) => b.score - a.score)
    .map(({ category, tool }) => ({ category: groupName(category), tool }))
}
