// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { formatSseDetailText } from './formatSseText'

describe('formatSseDetailText', () => {
  it('returns empty for nullish', () => {
    expect(formatSseDetailText(null)).toBe('')
    expect(formatSseDetailText(undefined)).toBe('')
  })

  it('pretty-prints objects', () => {
    expect(formatSseDetailText({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('unwraps double JSON-encoded string', () => {
    const inner = 'Line one\n\n- bullet'
    const blob = JSON.stringify(JSON.stringify(inner))
    expect(formatSseDetailText(blob)).toBe(inner)
  })

  it('unwraps single JSON string blob with escapes', () => {
    const raw = '"Я можу\\n\\n- Виконувати"'
    expect(formatSseDetailText(raw)).toBe('Я можу\n\n- Виконувати')
  })

  it('unescapes literal backslash sequences when not valid JSON blob', () => {
    expect(formatSseDetailText('hello\\nworld')).toBe('hello\nworld')
    expect(formatSseDetailText('say \\"hi\\"')).toBe('say "hi"')
  })
})
