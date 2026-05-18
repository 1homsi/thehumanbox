#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const SKIP_DIRS = new Set([
  'node_modules', 'target', 'dist', '.git', 'build', '.next', '.cache',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'coverage', '.turbo',
  'out', '.idea', '.vscode', 'scripts',
])
const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock',
  'uv.lock', 'yarn.lock',
])

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP_DIRS.has(entry.name)) continue
    if (SKIP_FILES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile()) out.push(full)
  }
}

const PRESERVE_RE = /(eslint-(disable|enable)|@ts-(ignore|expect-error|nocheck)|prettier-ignore|c8 ignore|istanbul ignore|biome-ignore|deno-(lint|fmt)|@vite-ignore|@webpack[A-Z]|@__PURE__|webpackIgnore|webpackChunkName|<reference\b|@jsxImportSource|@license|shellcheck|noqa|type:\s*ignore)/

function preserve(body) { return PRESERVE_RE.test(body) }

function lineStartIsBlank(src, pos) {
  let i = pos - 1
  while (i >= 0 && src[i] !== '\n') {
    if (src[i] !== ' ' && src[i] !== '\t') return false
    i--
  }
  return true
}

function applyRanges(src, ranges) {
  if (ranges.length === 0) return src
  let out = ''
  let cursor = 0
  for (const [s, e] of ranges) {
    out += src.slice(cursor, s)
    const standalone = lineStartIsBlank(src, s)
    let trim = out.length
    while (trim > 0 && (out[trim - 1] === ' ' || out[trim - 1] === '\t')) trim--
    if (trim < out.length) out = out.slice(0, trim)
    cursor = e
    if (standalone && out.length > 0 && out[out.length - 1] === '\n' && src[cursor] === '\n') {
      cursor++
    }
  }
  out += src.slice(cursor)
  return collapse(out)
}

const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'throw', 'delete',
  'void', 'await', 'yield', 'case', 'do', 'else', 'if', 'while', 'for',
  'try', 'finally', 'switch', 'extends',
])

function findJsComments(src) {
  const ranges = []
  let i = 0
  const n = src.length
  let exprEnd = false

  const isIdStart = c => c && /[A-Za-z_$]/.test(c)
  const isIdCont  = c => c && /[A-Za-z0-9_$]/.test(c)
  const isDigit   = c => c && /[0-9]/.test(c)

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }

    if (c === '/' && c2 === '/') {
      const start = i
      let end = src.indexOf('\n', i)
      if (end === -1) end = n
      const body = src.slice(start, end)
      if (!preserve(body)) ranges.push([start, end])
      i = end
      continue
    }
    if (c === '/' && c2 === '*') {
      const start = i
      let end = src.indexOf('*/', i + 2)
      if (end === -1) end = n; else end += 2
      const body = src.slice(start, end)
      if (!preserve(body)) ranges.push([start, end])
      i = end
      continue
    }

    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < n) {
        const ch = src[i]
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        i++
        if (ch === q) break
      }
      exprEnd = true
      continue
    }

    if (c === '`') {
      i++
      while (i < n) {
        const ch = src[i]
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        if (ch === '$' && src[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < n && depth > 0) {
            const d = src[i]
            if (d === '"' || d === "'") {
              const q = d
              i++
              while (i < n) {
                const cc = src[i]
                if (cc === '\\' && i + 1 < n) { i += 2; continue }
                i++
                if (cc === q) break
              }
              continue
            }
            if (d === '`') {
              i++
              while (i < n) {
                const cc = src[i]
                if (cc === '\\' && i + 1 < n) { i += 2; continue }
                i++
                if (cc === '`') break
              }
              continue
            }
            if (d === '{') depth++
            else if (d === '}') depth--
            i++
          }
          continue
        }
        if (ch === '`') { i++; break }
        i++
      }
      exprEnd = true
      continue
    }

    if (c === '/') {
      if (!exprEnd) {
        i++
        let inClass = false
        while (i < n) {
          const r = src[i]
          if (r === '\\' && i + 1 < n) { i += 2; continue }
          if (r === '[' && !inClass) { inClass = true; i++; continue }
          if (r === ']' && inClass)  { inClass = false; i++; continue }
          if (r === '/' && !inClass) { i++; break }
          if (r === '\n') break
          i++
        }
        while (i < n && /[a-z]/.test(src[i])) i++
        exprEnd = true
        continue
      }
      i++
      exprEnd = false
      continue
    }

    if (isIdStart(c)) {
      const start = i
      while (i < n && isIdCont(src[i])) i++
      const tok = src.slice(start, i)
      exprEnd = !KEYWORDS_BEFORE_REGEX.has(tok)
      continue
    }

    if (isDigit(c)) {
      while (i < n && /[0-9a-fA-FxX._neE+\-bo]/.test(src[i])) {
        if ((src[i] === '+' || src[i] === '-') && !(src[i - 1] === 'e' || src[i - 1] === 'E')) break
        i++
      }
      exprEnd = true
      continue
    }

    if (c === ')' || c === ']' || c === '}') {
      exprEnd = true
      i++
      continue
    }

    if (c === '+' && c2 === '+') { i += 2; continue }
    if (c === '-' && c2 === '-') { i += 2; continue }

    exprEnd = false
    i++
  }
  return ranges
}

function stripJs(src) { return applyRanges(src, findJsComments(src)) }

function findRustComments(src) {
  const ranges = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '"') {
      i++
      while (i < n) {
        const ch = src[i]
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        i++
        if (ch === '"') break
      }
      continue
    }
    if (c === "'") {
      let j = i + 1
      while (j < n && src[j] !== "'" && src[j] !== '\n') {
        if (src[j] === '\\' && j + 1 < n) j += 2
        else j++
      }
      if (src[j] === "'" && j - i <= 4) { i = j + 1; continue }
      i++
      continue
    }
    if (c === 'r' && (c2 === '"' || c2 === '#')) {
      let hashes = 0
      let j = i + 1
      while (j < n && src[j] === '#') { hashes++; j++ }
      if (src[j] === '"') {
        const end = '"' + '#'.repeat(hashes)
        const k = src.indexOf(end, j + 1)
        if (k !== -1) { i = k + end.length; continue }
      }
    }
    if (c === '/' && c2 === '/') {
      const start = i
      let end = src.indexOf('\n', i)
      if (end === -1) end = n
      const body = src.slice(start, end)
      if (!preserve(body)) ranges.push([start, end])
      i = end
      continue
    }
    if (c === '/' && c2 === '*') {
      const start = i
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (src[j] === '/' && src[j + 1] === '*') { depth++; j += 2; continue }
        if (src[j] === '*' && src[j + 1] === '/') { depth--; j += 2; continue }
        j++
      }
      const body = src.slice(start, j)
      if (!preserve(body)) ranges.push([start, j])
      i = j
      continue
    }
    i++
  }
  return ranges
}

function stripRust(src) { return applyRanges(src, findRustComments(src)) }

function stripPython(src) {
  const lines = src.split('\n')
  const out = []
  let inTriple = null
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (li === 0 && line.startsWith('#!')) { out.push(line); continue }
    let j = 0, N = line.length, outLine = '', dropLine = false
    while (j < N) {
      const ch = line[j]
      const tri = line.slice(j, j + 3)
      if (inTriple) {
        outLine += ch
        if (tri === inTriple) { outLine += line[j + 1] + line[j + 2]; inTriple = null; j += 3; continue }
        j++
        continue
      }
      if (tri === '"""' || tri === "'''") { inTriple = tri; outLine += tri; j += 3; continue }
      if (ch === '"' || ch === "'") {
        const q = ch
        outLine += ch
        j++
        while (j < N) {
          const c2 = line[j]
          if (c2 === '\\' && j + 1 < N) { outLine += c2 + line[j + 1]; j += 2; continue }
          outLine += c2
          j++
          if (c2 === q) break
        }
        continue
      }
      if (ch === '#') {
        const rest = line.slice(j)
        if (preserve(rest)) { outLine += rest; j = N; break }
        if (outLine.replace(/\s+$/, '').length > 0) outLine = outLine.replace(/\s+$/, '')
        else dropLine = true
        j = N
        break
      }
      outLine += ch
      j++
    }
    if (!dropLine) out.push(outLine)
  }
  return collapse(out.join('\n'))
}

function stripHashLine(src, allowPreserve) {
  const lines = src.split('\n')
  const out = []
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (li === 0 && line.startsWith('#!')) { out.push(line); continue }
    let j = 0, N = line.length, outLine = '', inStr = null, dropLine = false
    while (j < N) {
      const ch = line[j]
      if (inStr) {
        outLine += ch
        if (ch === '\\' && j + 1 < N) { outLine += line[j + 1]; j += 2; continue }
        if (ch === inStr) inStr = null
        j++
        continue
      }
      if (ch === '"' || ch === "'") { inStr = ch; outLine += ch; j++; continue }
      if (ch === '#') {
        const rest = line.slice(j)
        if (allowPreserve && preserve(rest)) { outLine += rest; j = N; break }
        if (outLine.replace(/\s+$/, '').length > 0) outLine = outLine.replace(/\s+$/, '')
        else dropLine = true
        j = N
        break
      }
      outLine += ch
      j++
    }
    if (!dropLine) out.push(outLine)
  }
  return collapse(out.join('\n'))
}

function collapse(src) {
  return src.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

function processFile(file) {
  const ext = path.extname(file).toLowerCase()
  let stripper = null
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs')
    stripper = stripJs
  else if (ext === '.rs') stripper = stripRust
  else if (ext === '.py') stripper = stripPython
  else if (ext === '.yml' || ext === '.yaml' || ext === '.toml')
    stripper = s => stripHashLine(s, false)
  else if (ext === '.sh' || ext === '.bash' || ext === '.zsh')
    stripper = s => stripHashLine(s, true)
  if (!stripper) return false
  const src = fs.readFileSync(file, 'utf8')
  const out = stripper(src)
  if (out === src) return false
  fs.writeFileSync(file, out)
  return true
}

const all = []
walk(root, all)
let changed = 0, errors = 0
for (const f of all) {
  try { if (processFile(f)) changed++ }
  catch (e) { errors++; console.error(`! ${path.relative(root, f)}: ${e.message}`) }
}
console.log(`${changed}/${all.length} files updated, ${errors} errors`)
