import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { toolTip } from './tool-tips'

/** How well one query word matches a tool: a label word beats a prefix, a prefix beats a substring. */
function wordScore(word: string, tool: SandboxTool, category: string): number {
  const label = tool.label.toLowerCase()
  const labelWords = label.split(/\s+/)
  if (labelWords.includes(word)) return 4
  if (labelWords.some((w) => w.startsWith(word))) return 3
  if (`${label} ${tool.id.toLowerCase()} ${category.toLowerCase()}`.includes(word)) return 2
  // The tooltip says what a tool does, so "forgive" can find a tool whose tip mentions it.
  if (toolTip(tool).toLowerCase().includes(word)) return 1
  return 0
}

export function searchWorldTools(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits = SANDBOX_CATEGORIES.flatMap((category) =>
    category.tools.map((tool) => ({ category: category.label, tool })),
  ).flatMap((hit) => {
    const scores = words.map((word) => wordScore(word, hit.tool, hit.category))
    if (scores.some((score) => score === 0)) return []
    return [{ ...hit, score: scores.reduce((sum, score) => sum + score, 0) }]
  })
  // Best matches first; the catalogue order breaks ties, so an empty query keeps the dock order.
  return hits.sort((a, b) => b.score - a.score).map(({ category, tool }) => ({ category, tool }))
}
