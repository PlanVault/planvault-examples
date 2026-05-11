// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal Runtime UI: create session, send prompts, subscribe to SSE (fetch + stream),
 * show tool timeline, optional slot form (`slots_required` + `fill_slots`), and plan-approval modal when `confirm_plan_required` arrives.
 */
import { useCallback, useEffect, useState } from 'react'
import { formatSseDetailText } from './formatSseText'
import { consumeSseBuffer } from './sseParse'

type ToolStep = { name: string; status: 'running' | 'done' | 'error' }

type UiSlotField = { variable: string; prompt: string; options: string[] }

function parseSlotsPayload(raw: unknown): UiSlotField[] | null {
  if (!Array.isArray(raw)) return null
  const out: UiSlotField[] = []
  for (const x of raw) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const o = x as Record<string, unknown>
      const variable = typeof o.variable === 'string' ? o.variable : ''
      if (!variable) continue
      const prompt = typeof o.prompt === 'string' ? o.prompt : variable
      const options = Array.isArray(o.options) ? o.options.filter((t): t is string => typeof t === 'string') : []
      out.push({ variable, prompt, options })
    }
  }
  return out.length ? out : null
}

function newRequestIdHeader(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `react-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

/** Merge auth headers with a fresh X-Request-Id per HTTP call (PlanVault echoes it; errors may duplicate in `instance`). */
function headersForApiCall(base: HeadersInit): Headers {
  const h = new Headers(base)
  h.set('X-Request-Id', newRequestIdHeader())
  return h
}

/** Prefer RFC 7807 `detail` / `title` when the API returns `application/problem+json`. */
async function formatHttpError(res: Response): Promise<string> {
  const raw = await res.text()
  const hdrId = res.headers.get('X-Request-Id')?.trim()
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('json') && raw) {
    try {
      const j = JSON.parse(raw) as { title?: string; detail?: string; instance?: string }
      const msg = j.detail?.trim() || j.title?.trim()
      const supportId = hdrId || (typeof j.instance === 'string' ? j.instance.trim() : '')
      const suffix = supportId ? ` [support id: ${supportId}]` : ''
      if (msg) return msg + suffix
    } catch {
      /* use raw */
    }
  }
  const base = raw.trim() || `HTTP ${res.status}`
  return hdrId ? `${base} [support id: ${hdrId}]` : base
}

export default function App() {
  const [apiBase, setApiBase] = useState(
    () => import.meta.env.VITE_PLANVAULT_BASE_URL?.trim() || 'https://api.planvault.ai',
  )
  const [projectId, setProjectId] = useState(
    () => import.meta.env.VITE_PLANVAULT_PROJECT_ID?.trim() || '',
  )
  const [apiKey, setApiKey] = useState(() => import.meta.env.VITE_PLANVAULT_API_KEY?.trim() || '')
  const [externalUserId, setExternalUserId] = useState('demo-user')
  /** Comma-separated session tags (optional); sent as string[] — case-sensitive on the server. */
  const [tagsText, setTagsText] = useState('react-chat-example')
  const [contextVarsText, setContextVarsText] = useState('{}')
  const [contextError, setContextError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [message, setMessage] = useState('Hello — run a short plan.')
  const [sendError, setSendError] = useState<string | null>(null)
  /** Last successful POST /messages acknowledgement (API returns messageId immediately; pipeline runs async). */
  const [sendAck, setSendAck] = useState<{ status: string; messageId: string } | null>(null)

  const [planGraph, setPlanGraph] = useState<unknown | null>(null)
  const [tools, setTools] = useState<ToolStep[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamConn, setStreamConn] = useState<'off' | 'connecting' | 'live' | 'error'>('off')
  const [lastRunPhase, setLastRunPhase] = useState<string | null>(null)

  const [confirmPayload, setConfirmPayload] = useState<{
    tools: string[]
    toolDescriptions: Record<string, string>
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const [pendingSignal, setPendingSignal] = useState<{
    tokenId: string
    nodeId: string
    expiresAt: string
    onTimeout: string
  } | null>(null)
  const [signalSecret, setSignalSecret] = useState('')
  const [signalPayloadText, setSignalPayloadText] = useState('{}')
  const [signalBusy, setSignalBusy] = useState(false)
  const [signalError, setSignalError] = useState<string | null>(null)
  const [signalStatus, setSignalStatus] = useState<string | null>(null)

  const [pendingSlots, setPendingSlots] = useState<UiSlotField[] | null>(null)
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  const [slotsPlanSummary, setSlotsPlanSummary] = useState<string | null>(null)
  const [slotsBusy, setSlotsBusy] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) h.Authorization = `Bearer ${apiKey}`
    return h
  }, [apiKey])

  const sessionsPrefix = useCallback((root: string) => {
    const pid = projectId.trim()
    return `${root}/api/v1/projects/${encodeURIComponent(pid)}/sessions`
  }, [projectId])

  const createSession = async () => {
    setSessionError(null)
    setContextError(null)
    let ctx: Record<string, unknown>
    try {
      ctx = JSON.parse(contextVarsText) as Record<string, unknown>
      if (ctx === null || typeof ctx !== 'object' || Array.isArray(ctx))
        throw new Error('contextVars must be a JSON object')
    } catch (e) {
      setContextError(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    if (!apiKey.trim()) {
      setSessionError('API key is required')
      return
    }
    if (!projectId.trim()) {
      setSessionError('Project ID is required (must match this API key)')
      return
    }
    const tags = tagsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const body: Record<string, unknown> = { contextVars: ctx }
    const ext = externalUserId.trim()
    if (ext) body.externalUserId = ext
    if (tags.length) body.tags = tags
    const root = apiBase.replace(/\/$/, '')
    const res = await fetch(sessionsPrefix(root), {
      method: 'POST',
      headers: headersForApiCall(authHeaders()),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setSessionError(await formatHttpError(res))
      return
    }
    const data = (await res.json()) as { id: string }
    setSessionId(data.id)
    setPlanGraph(null)
    setTools([])
    setStreamError(null)
    setLastRunPhase(null)
    setPendingSlots(null)
    setSlotValues({})
    setSlotsPlanSummary(null)
    setSlotsError(null)
    setSendAck(null)
    setPendingSignal(null)
    setSignalSecret('')
    setSignalPayloadText('{}')
    setSignalError(null)
    setSignalStatus(null)
  }

  const sendMessage = async () => {
    if (!sessionId) return
    setSendError(null)
    setSendAck(null)
    setPendingSlots(null)
    setSlotValues({})
    setSlotsPlanSummary(null)
    setSlotsError(null)
    const root = apiBase.replace(/\/$/, '')
    const res = await fetch(`${sessionsPrefix(root)}/${sessionId}/messages`, {
      method: 'POST',
      headers: headersForApiCall(authHeaders()),
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      setSendError(await formatHttpError(res))
      return
    }
    const data = (await res.json()) as { status?: string; messageId?: string }
    const mid = typeof data.messageId === 'string' ? data.messageId : ''
    if (mid)
      setSendAck({ status: typeof data.status === 'string' ? data.status : 'ok', messageId: mid })
  }

  const postAction = async (action: 'approve' | 'reject') => {
    if (!sessionId) return
    setActionBusy(true)
    const root = apiBase.replace(/\/$/, '')
    try {
      const res = await fetch(`${sessionsPrefix(root)}/${sessionId}/actions`, {
        method: 'POST',
        headers: headersForApiCall(authHeaders()),
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setStreamError(await formatHttpError(res))
        return
      }
      setConfirmPayload(null)
    } finally {
      setActionBusy(false)
    }
  }

  const submitSlots = async () => {
    if (!sessionId || !pendingSlots?.length) return
    for (const s of pendingSlots) {
      if (!(slotValues[s.variable] ?? '').trim()) {
        setSlotsError(`Value required: ${s.variable}`)
        return
      }
    }
    setSlotsBusy(true)
    setSlotsError(null)
    const root = apiBase.replace(/\/$/, '')
    try {
      const res = await fetch(`${sessionsPrefix(root)}/${sessionId}/actions`, {
        method: 'POST',
        headers: headersForApiCall(authHeaders()),
        body: JSON.stringify({ action: 'fill_slots', values: slotValues }),
      })
      if (!res.ok) {
        setSlotsError(await formatHttpError(res))
        return
      }
      setPendingSlots(null)
      setSlotValues({})
      setSlotsPlanSummary(null)
    } finally {
      setSlotsBusy(false)
    }
  }

  const deliverSignal = async () => {
    if (!pendingSignal || !sessionId) return
    setSignalBusy(true)
    setSignalError(null)
    let payloadObj: Record<string, unknown>
    try {
      payloadObj = JSON.parse(signalPayloadText) as Record<string, unknown>
      if (payloadObj === null || typeof payloadObj !== 'object' || Array.isArray(payloadObj))
        throw new Error('Signal payload must be a JSON object')
    } catch (e) {
      setSignalError(e instanceof Error ? e.message : 'Invalid JSON')
      setSignalBusy(false)
      return
    }
    const root = apiBase.replace(/\/$/, '')
    const pid = projectId.trim()
    try {
      const res = await fetch(
        `${root}/api/v1/projects/${encodeURIComponent(pid)}/callbacks/${encodeURIComponent(pendingSignal.tokenId)}`,
        {
          method: 'POST',
          headers: headersForApiCall({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pendingSignal.tokenId}:${signalSecret.trim()}`,
          }),
          body: JSON.stringify(payloadObj),
        },
      )
      const json = (await res.json()) as { code?: string }
      if (!res.ok) {
        setSignalError(json.code ?? `HTTP ${res.status}`)
      } else if (json.code === 'SIGNAL_ALREADY_DELIVERED') {
        setSignalStatus('Already delivered (idempotent).')
      } else {
        setSignalStatus('Signal delivered — session will resume.')
        setPendingSignal(null)
      }
    } catch (e) {
      setSignalError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSignalBusy(false)
    }
  }

  useEffect(() => {
    if (!sessionId || !apiKey.trim() || !projectId.trim()) {
      setStreamConn('off')
      return
    }

    const root = apiBase.replace(/\/$/, '')
    const ac = new AbortController()
    setStreamConn('connecting')
    setStreamError(null)
    setLastRunPhase(null)

    let buf = ''

    const run = async () => {
      try {
        const res = await fetch(`${sessionsPrefix(root)}/${sessionId}/chat`, {
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            Accept: 'text/event-stream',
            'X-Request-Id': newRequestIdHeader(),
          },
          signal: ac.signal,
        })
        if (!res.ok || !res.body) {
          setStreamConn('error')
          setStreamError(`SSE HTTP ${res.status}`)
          return
        }
        setStreamConn('live')
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          buf = consumeSseBuffer(buf, (eventName, dataJson) => {
            if (eventName === 'ping') return
            let payload: Record<string, unknown> = {}
            try {
              payload = JSON.parse(dataJson) as Record<string, unknown>
            } catch {
              return
            }

            if (eventName === 'started') {
              if (payload.planGraph != null) setPlanGraph(payload.planGraph)
            }
            if (eventName === 'slots_required') {
              if (payload.planGraph != null) setPlanGraph(payload.planGraph)
              const slots = parseSlotsPayload(payload.slots)
              if (slots) {
                setPendingSlots(slots)
                setSlotValues((prev) => {
                  const next = { ...prev }
                  for (const s of slots) {
                    if (next[s.variable] === undefined) next[s.variable] = ''
                  }
                  return next
                })
              }
            }
            if (eventName === 'slots_plan_summary') {
              const s = payload.summary
              if (typeof s === 'string' && s.trim()) setSlotsPlanSummary(s.trim())
            }
            if (eventName === 'run_phase') {
              const phase = payload.phase
              const detail = payload.detail
              if (typeof phase === 'string') {
                const d = formatSseDetailText(detail)
                setLastRunPhase(d.trim() ? `${phase}: ${d}` : phase)
              }
            }
            if (eventName === 'tool_start') {
              const t = payload.tool
              if (typeof t === 'string')
                setTools((prev) => [...prev, { name: t, status: 'running' }])
            }
            if (eventName === 'tool_end') {
              setTools((prev) => {
                const next = [...prev]
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].status === 'running') {
                    next[i] = { ...next[i], status: 'done' }
                    break
                  }
                }
                return next
              })
            }
            if (eventName === 'error') {
              const msg = payload.msg
              setStreamError(typeof msg === 'string' ? msg : 'error event')
              setTools((prev) => {
                const next = [...prev]
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].status === 'running') {
                    next[i] = { ...next[i], status: 'error' }
                    break
                  }
                }
                return next
              })
            }
                            if (eventName === 'awaiting_signal') {
                              const tokenId = payload.tokenId
                              if (typeof tokenId === 'string' && tokenId) {
                                setPendingSignal({
                                  tokenId,
                                  nodeId: typeof payload.nodeId === 'string' ? payload.nodeId : '',
                                  expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : '',
                                  onTimeout: typeof payload.onTimeout === 'string' ? payload.onTimeout : '',
                                })
                                setSignalError(null)
                                setSignalStatus(null)
                              }
                            }
                            if (eventName === 'signal_received') {
                              setPendingSignal(null)
                              setSignalStatus('Signal delivered — session resumed.')
                            }
                            if (eventName === 'signal_timed_out') {
                              setPendingSignal(null)
                              setSignalStatus(
                                `Signal timed out (policy: ${typeof payload.policy === 'string' ? payload.policy : 'unknown'}).`,
                              )
                            }
                            if (eventName === 'confirm_plan_required') {
              const tl = payload.tools
              const td = payload.toolDescriptions
              const toolsList = Array.isArray(tl) ? tl.filter((x): x is string => typeof x === 'string') : []
              const desc =
                td && typeof td === 'object' && td !== null && !Array.isArray(td)
                  ? (td as Record<string, string>)
                  : {}
              setConfirmPayload({ tools: toolsList, toolDescriptions: desc })
            }
            if (eventName === 'confirm_plan_result') {
              setConfirmPayload(null)
            }
          })
        }
        setStreamConn('off')
      } catch (e) {
        if (ac.signal.aborted) return
        setStreamConn('error')
        setStreamError(e instanceof Error ? e.message : 'SSE failed')
      }
    }

    void run()
    return () => {
      ac.abort()
    }
  }, [sessionId, apiKey, apiBase, projectId, sessionsPrefix])

  return (
    <>
      <h1>PlanVault Runtime — React example</h1>

      <div className="card">
        <h2>Connection</h2>
        <div className="field">
          <label htmlFor="base">API base URL</label>
          <input
            id="base"
            name="base"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="https://api.planvault.ai"
          />
        </div>
        <div className="field">
          <label htmlFor="pid">Project ID (UUID)</label>
          <input
            id="pid"
            name="pid"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="same project as the API key"
            autoComplete="off"
            className="mono"
          />
        </div>
        <div className="field">
          <label htmlFor="key">Project API key</label>
          <input
            id="key"
            name="key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Bearer project key"
          />
        </div>
      </div>

      <div className="card">
        <h2>Create session</h2>
        <div className="field">
          <label htmlFor="ext">externalUserId (optional)</label>
          <input
            id="ext"
            name="ext"
            value={externalUserId}
            onChange={(e) => setExternalUserId(e.target.value)}
            placeholder="omit for anonymous session"
          />
        </div>
        <div className="field">
          <label htmlFor="tags">tags (optional, comma-separated)</label>
          <input
            id="tags"
            name="tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="e.g. demo, eu"
          />
        </div>
        <div className="field">
          <label htmlFor="ctx">contextVars (JSON object)</label>
          <textarea id="ctx" name="ctx" value={contextVarsText} onChange={(e) => setContextVarsText(e.target.value)} />
          {contextError ? <p className="error">{contextError}</p> : null}
        </div>
        <button type="button" onClick={() => void createSession()}>
          POST /api/v1/projects/…/sessions
        </button>
        {sessionError ? <p className="error">{sessionError}</p> : null}
        {sessionId ? (
          <p style={{ marginTop: '0.75rem' }}>
            Session <code className="mono">{sessionId}</code> — SSE: {streamConn}
            {lastRunPhase ? (
              <>
                {' '}
                — <span className="mono">{lastRunPhase}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Message</h2>
        <div className="field">
          <label htmlFor="msg">Message</label>
          <textarea id="msg" name="msg" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <button type="button" disabled={!sessionId} onClick={() => void sendMessage()}>
          POST …/sessions/…/messages
        </button>
        {sendError ? <p className="error">{sendError}</p> : null}
        {sendAck ? (
          <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
            Response: <code className="mono">{sendAck.status}</code> · <code className="mono">{sendAck.messageId}</code>{' '}
            <span style={{ opacity: 0.85 }}>(correlate with SSE / history)</span>
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Plan graph (from SSE started / slots_required)</h2>
        {planGraph ? (
          <pre className="mono">{JSON.stringify(planGraph, null, 2)}</pre>
        ) : (
          <p style={{ color: '#64748b' }}>No plan yet.</p>
        )}
      </div>

      {pendingSlots?.length ? (
        <div className="card">
          <h2>Values required (slots_required)</h2>
          <p style={{ color: '#64748b', marginTop: 0 }}>
            Submit via <code className="mono">POST …/actions</code> with{' '}
            <code className="mono">{`{"action":"fill_slots","values":{…}}`}</code>.
          </p>
          {slotsPlanSummary ? (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f1f5f9', borderRadius: 6 }}>
              <strong>Summary</strong> (optional SSE <code className="mono">slots_plan_summary</code>)
              <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{slotsPlanSummary}</p>
            </div>
          ) : null}
          {slotsError ? <p className="error">{slotsError}</p> : null}
          {pendingSlots.map((s) => (
            <div key={s.variable} className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor={`slot-${s.variable}`}>{s.prompt || s.variable}</label>
              {s.options.length ? (
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                  Quick pick:{' '}
                  {s.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      style={{ marginRight: 6 }}
                      onClick={() => setSlotValues((prev) => ({ ...prev, [s.variable]: opt }))}
                    >
                      {opt}
                    </button>
                  ))}
                </p>
              ) : null}
              <input
                id={`slot-${s.variable}`}
                name={s.variable}
                value={slotValues[s.variable] ?? ''}
                onChange={(e) => setSlotValues((prev) => ({ ...prev, [s.variable]: e.target.value }))}
              />
            </div>
          ))}
          <button type="button" disabled={slotsBusy} onClick={() => void submitSlots()}>
            fill_slots
          </button>
        </div>
      ) : null}

      {(pendingSignal ?? signalStatus) ? (
        <div className="card">
          <h2>External signal (awaiting_signal)</h2>
          {signalStatus ? <p style={{ marginTop: 0, color: '#16a34a' }}>{signalStatus}</p> : null}
          {pendingSignal ? (
            <>
              <p style={{ color: '#64748b', marginTop: 0 }}>
                Session is paused waiting for a signal on node{' '}
                <code className="mono">{pendingSignal.nodeId || '—'}</code>. Token:{' '}
                <code className="mono">{pendingSignal.tokenId}</code>
                {pendingSignal.expiresAt ? (
                  <>
                    {' '}— expires <code className="mono">{pendingSignal.expiresAt}</code>
                  </>
                ) : null}
                {pendingSignal.onTimeout ? (
                  <>
                    {' '}(on timeout: <code className="mono">{pendingSignal.onTimeout}</code>)
                  </>
                ) : null}
              </p>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0 }}>
                Deliver via{' '}
                <code className="mono">POST …/callbacks/{pendingSignal.tokenId}</code> with{' '}
                <code className="mono">{'Authorization: Bearer {tokenId}:{secret}'}</code>. The{' '}
                <code className="mono">secret</code> is provided in the session tool-call context by
                the <code className="mono">wait_for_signal</code> native tool.
              </p>
              {signalError ? <p className="error">{signalError}</p> : null}
              <div className="field">
                <label htmlFor="signal-secret">
                  Signal secret (from <code className="mono">wait_for_signal</code> tool output)
                </label>
                <input
                  id="signal-secret"
                  name="signal-secret"
                  type="password"
                  autoComplete="off"
                  value={signalSecret}
                  onChange={(e) => setSignalSecret(e.target.value)}
                  placeholder="raw secret from session tool context"
                />
              </div>
              <div className="field">
                <label htmlFor="signal-payload">Payload (JSON object)</label>
                <textarea
                  id="signal-payload"
                  name="signal-payload"
                  value={signalPayloadText}
                  onChange={(e) => setSignalPayloadText(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={signalBusy || !signalSecret.trim()}
                onClick={() => void deliverSignal()}
              >
                POST …/callbacks/{pendingSignal.tokenId}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h2>Tool timeline (tool_start / tool_end)</h2>
        {streamError ? <p className="error">{streamError}</p> : null}
        {tools.length === 0 ? (
          <p style={{ color: '#64748b' }}>No tool events yet.</p>
        ) : (
          <ul className="timeline">
            {tools.map((t, i) => (
              <li key={`${t.name}-${i}`} className={t.status}>
                <span className="badge">{t.status}</span>
                <span className="mono">{t.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmPayload ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">Plan confirmation</h3>
            <p>Event <code className="mono">confirm_plan_required</code> — approve or reject execution.</p>
            <ul>
              {confirmPayload.tools.map((t) => (
                <li key={t}>
                  <strong className="mono">{t}</strong>
                  {confirmPayload.toolDescriptions[t] ? (
                    <div className="mono" style={{ marginTop: '0.25rem' }}>
                      {confirmPayload.toolDescriptions[t]}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="danger" disabled={actionBusy} onClick={() => void postAction('reject')}>
                Reject
              </button>
              <button type="button" disabled={actionBusy} onClick={() => void postAction('approve')}>
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
