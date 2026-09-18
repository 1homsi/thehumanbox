/** Work poses come from current actions, never professions or planned jobs. */
export type WorkActivity = 'build' | 'chop' | 'mine' | 'farm' | 'fish' | 'gather' | 'rest' | null

export function workActivity(thought: string, moving: boolean): WorkActivity {
  if (moving) return null
  const t = thought.toLowerCase()
  if (/\b(seeking|looking|searching|heading|walking|traveling|going|planning|wanting)\b/.test(t)) return null
  if (/repairing|rebuilding|reclaiming|building|constructing|raising/.test(t)) return 'build'
  if (/chopping|cutting wood|gathering wood|felling/.test(t)) return 'chop'
  if (/mining|quarrying|gathering stone|digging ore/.test(t)) return 'mine'
  if (/harvesting|planting|sowing|irrigating|tending crops/.test(t)) return 'farm'
  if (/fishing/.test(t)) return 'fish'
  if (/foraging|gathering|picking berries/.test(t)) return 'gather'
  if (/sleeping|resting|dozing|napping/.test(t)) return 'rest'
  return null
}

export function drawWorkActivity(
  ctx: CanvasRenderingContext2D,
  activity: WorkActivity,
  x: number,
  y: number,
  flipped: boolean,
  time: number,
  phase: number,
) {
  if (!activity) return
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(flipped ? -1 : 1, 1)
  const swing = Math.sin(time / 180 + phase)
  if (activity === 'rest') {
    ctx.fillStyle = '#c8d3db'
    ctx.fillRect(5, -12, 3, 1)
    ctx.fillRect(6, -11, 1, 1)
    ctx.fillRect(5, -10, 3, 1)
  } else if (activity === 'fish') {
    ctx.strokeStyle = '#b99760'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(3, -3)
    ctx.lineTo(10, -13)
    ctx.stroke()
    ctx.strokeStyle = '#c4c5ad'
    ctx.beginPath()
    ctx.moveTo(10, -13)
    ctx.lineTo(15, 1)
    ctx.stroke()
    ctx.fillStyle = '#d99a59'
    ctx.fillRect(14, 1, 2, 2)
  } else if (activity === 'gather' || activity === 'farm') {
    ctx.fillStyle = '#9e703e'
    ctx.fillRect(5, 0, 5, 3)
    ctx.fillStyle = '#88a34c'
    ctx.fillRect(6, -1, 3, 2)
    ctx.fillStyle = '#d6b389'
    ctx.fillRect(3 + Math.round(swing), -3 + Math.round(swing), 3, 2)
  } else {
    ctx.translate(4, -4)
    ctx.rotate(-0.8 + swing * 0.85)
    ctx.fillStyle = '#b38b52'
    ctx.fillRect(0, -7, 1, 8)
    ctx.fillStyle = activity === 'build' ? '#93918b' : '#b5b5a5'
    ctx.fillRect(-2, -8, activity === 'mine' ? 7 : 4, activity === 'chop' ? 4 : 2)
    if (swing > 0.75) {
      ctx.fillStyle = '#c9b28a'
      ctx.fillRect(3, 3, 1, 1)
      ctx.fillRect(-3, 2, 1, 1)
    }
  }
  ctx.restore()
}
