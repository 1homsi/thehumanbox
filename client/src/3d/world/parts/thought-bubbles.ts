export function displayThought(thought: string): string | null {
  const clean = thought.replace(/[_\s]+/g, ' ').trim()
  if (clean.length < 5 || /^(idle|waiting|wandering|thinking)$/i.test(clean)) return null
  if (clean.length <= 42) return clean
  return `${clean.slice(0, 39).trimEnd()}...`
}
