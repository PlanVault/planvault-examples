// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import { consumeSseBuffer } from './sseParse'

describe('consumeSseBuffer', () => {
  it('parses event name and single data line', () => {
    const fn = vi.fn()
    const rest = consumeSseBuffer('event: tool_start\ndata: {"tool":"x"}\n\n', fn)
    expect(rest).toBe('')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('tool_start', '{"tool":"x"}')
  })

  it('defaults event to message when omitted', () => {
    const fn = vi.fn()
    consumeSseBuffer('data: hello\n\n', fn)
    expect(fn).toHaveBeenCalledWith('message', 'hello')
  })

  it('joins multi-line data fields per SSE spec', () => {
    const fn = vi.fn()
    consumeSseBuffer('event: ping\ndata: {"a":\ndata: 1}\n\n', fn)
    expect(fn).toHaveBeenCalledWith('ping', '{"a":\n1}')
  })

  it('returns incomplete buffer tail', () => {
    const fn = vi.fn()
    const rest = consumeSseBuffer('event: x\ndata: y', fn)
    expect(fn).not.toHaveBeenCalled()
    expect(rest).toBe('event: x\ndata: y')
  })

  it('handles CRLF block separators', () => {
    const fn = vi.fn()
    consumeSseBuffer('event: done\r\ndata: {}\r\n\r\n', fn)
    expect(fn).toHaveBeenCalledWith('done', '{}')
  })
})
