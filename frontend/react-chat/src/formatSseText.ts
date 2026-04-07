// SPDX-License-Identifier: Apache-2.0
/**
 * Turn SSE `run_phase.detail` (and similar) into human-readable text.
 * Handles double JSON-encoded strings and literal \\n \\" sequences some backends emit.
 */
export function formatSseDetailText(detail: unknown): string {
  if (detail === null || detail === undefined) return ''
  if (typeof detail === 'object') return JSON.stringify(detail, null, 2)

  let s = String(detail)
  s = unwrapJsonStringBlob(s)
  if (hasLiteralBackslashEscapes(s)) s = unescapeLiteralSequences(s)
  return s
}

function unwrapJsonStringBlob(s: string): string {
  const t = s.trim()
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return s

  try {
    let cur: unknown = JSON.parse(t)
    // Occasionally the value is JSON-stringified more than once.
    for (let i = 0; i < 3 && typeof cur === 'string'; i++) {
      const inner = cur.trim()
      if (inner.length < 2 || !inner.startsWith('"') || !inner.endsWith('"')) return cur
      try {
        cur = JSON.parse(inner)
      } catch {
        return cur
      }
    }
    return typeof cur === 'string' ? cur : s
  } catch {
    return s
  }
}

function hasLiteralBackslashEscapes(s: string): boolean {
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '\\' && 'ntr"\\'.includes(s[i + 1]!)) return true
  }
  return false
}

function unescapeLiteralSequences(s: string): string {
  return s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
