// Shared by report.mjs and score.mjs: loads results.json files and boils the runs down to medians.

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}
export const spread = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x))
  return v.length > 1 ? [Math.min(...v), Math.max(...v)] : null
}

export function load(input) {
  const file = statSync(input).isDirectory() ? path.join(input, 'results.json') : input
  return { label: path.basename(path.dirname(file)), rows: JSON.parse(readFileSync(file, 'utf8')) }
}

/** The conditions a result was measured under: viewport, phone preset, CPU throttle, software GPU. */
export function conditionOf(r) {
  const parts = [r.viewport ?? '1280x800@1']
  if (r.mobile) parts.push('mobile')
  if (r.cpuThrottle > 1) parts.push(`cpu x${r.cpuThrottle}`)
  if (r.gpuOff) parts.push('gpu off')
  return parts.join(', ')
}

/** One row per fixture / zoom / mode: the median of every metric over the runs and passes. */
export function summarize(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (r.error) continue
    const key = `${r.fixture}|${r.zoom}|${r.mode}|${conditionOf(r)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const [fixture, zoom, mode, condition] = key.split('|')
    const col = (name, pass) => list.filter((r) => !pass || r.pass === pass).map((r) => r[name])
    const trace = list.filter((r) => r.pass === 'trace')
    const metrics = list.filter((r) => r.pass === 'metrics')
    // Frames delivered come from the trace pass; a metrics-only run has the engine's own frame count.
    const fps = median(col('fps', 'trace')) ?? median(col('engineFps', 'metrics'))
    const windowSec = (median(col('windowMs', 'metrics')) ?? 8000) / 1000
    const scriptMs = median(col('scriptMs', 'metrics'))
    out.push({
      fixture,
      zoom,
      mode,
      condition,
      runs: Math.max(trace.length, metrics.length),
      fps,
      busy: median(col('mainBusyPct', 'metrics')),
      busyRange: spread(col('mainBusyPct', 'metrics')),
      cpu: median(col('mainCpuPct', 'metrics')),
      jsPerFrame: fps && scriptMs !== null ? scriptMs / (fps * windowSec) : null,
      gpuProc: median(col('gpuMainBusyPct', 'trace')),
      gpuMs: median(col('gpuMsAvg', 'metrics')),
      gpuProcCpu: median(col('gpuProcessCpuPct', 'metrics')),
      rendererCpu: median(col('rendererProcessCpuPct', 'metrics')),
      gcPerSec:
        (median(col('gcPauseMs', 'trace')) ?? 0) / ((median(col('traceWindowMs', 'trace')) ?? 8000) / 1000),
      gcMax: median(col('gcMaxMs', 'trace')),
      longTasks: median(col('longTasks', 'metrics')),
      heapGc: median(col('heapAfterGcMB', 'metrics')),
      heapEnd: median(col('heapUsedEndMB', 'metrics')),
      textureMB: median(col('textureMB', 'metrics')),
      gpuMB: median(col('gpuAngleMB', 'memory')),
      rendererMB: median(col('rendererFootprintMB', 'memory')),
      canvasMB: median(col('rendererCanvasMB', 'memory')),
      drawCalls: median(metrics.map((r) => r.render?.drawCalls)),
      instances: median(metrics.map((r) => r.render?.instances)),
      uploads: median(col('textureUploadsPerSec', 'metrics')),
      firstFrame: median(list.map((r) => r.firstFrameMs)),
      load: median(list.map((r) => r.loadAvg1m)),
    })
  }
  return out
}
