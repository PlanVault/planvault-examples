// SPDX-License-Identifier: Apache-2.0
/**
 * Incrementally parse PlanVault session SSE (`GET /api/v1/sessions/{id}/chat`).
 * Each complete block may include `event:` and one or more `data:` lines; yields the tail
 * that has not yet ended with a blank line.
 */
export function consumeSseBuffer(
  buffer: string,
  onEvent: (eventName: string, dataJson: string) => void
): string {
  const parts = buffer.split(/\r\n\r\n|\n\n/)
  const complete = parts.slice(0, -1)
  const rest = parts[parts.length - 1] ?? ''
  for (const block of complete) {
    if (!block.trim()) continue
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length) onEvent(eventName, dataLines.join('\n'))
  }
  return rest
}
