// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal Runtime UI: create session, send prompts, subscribe to SSE (fetch + stream),
 * show tool timeline and plan-approval modal when `confirm_plan_required` arrives.
 */
import { useCallback, useEffect, useState } from 'react'
import { consumeSseBuffer } from './sseParse'

type ToolStep = { name: string; status: 'running' | 'done' | 'error' }

/** Prefer RFC 7807 `detail` / `title` when the API returns `application/problem+json`. */
async function formatHttpError(res: Response): Promise<string> {
  const raw = await res.text()
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('json') && raw) {
    try {
      const j = JSON.parse(raw) as { title?: string; detail?: string }
      const msg = j.detail?.trim() || j.title?.trim()
      if (msg) return msg
    } catch {
      /* use raw */
    }
  }
  return raw.trim() || `HTTP ${res.status}`
}

export default function App() {
  const [apiBase, setApiBase] = useState(
    () => import.meta.env.VITE_PLANVAULT_BASE_URL?.trim() || 'https://api.planvault.ai',
  )
  const [apiKey, setApiKey] = useState(() => import.meta.env.VITE_PLANVAULT_API_KEY?.trim() || '')
  const [externalUserId, setExternalUserId] = useState('demo-user')
  const [contextVarsText, setContextVarsText] = useState('{}')
  const [contextError, setContextError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [message, setMessage] = useState('Hello — run a short plan.')
  const [sendError, setSendError] = useState<string | null>(null)

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

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) h.Authorization = `Bearer ${apiKey}`
    return h
  }, [apiKey])

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
    if (!externalUserId.trim()) {
      setSessionError('externalUserId is required')
      return
    }
    if (!apiKey.trim()) {
      setSessionError('API key is required')
      return
    }
    const root = apiBase.replace(/\/$/, '')
    const res = await fetch(`${root}/api/v1/sessions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        externalUserId: externalUserId.trim(),
        contextVars: ctx,
      }),
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
  }

  const sendMessage = async () => {
    if (!sessionId) return
    setSendError(null)
    const root = apiBase.replace(/\/$/, '')
    const res = await fetch(`${root}/api/v1/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message, autoExecute: true }),
    })
    if (!res.ok) {
      setSendError(await formatHttpError(res))
    }
  }

  const postAction = async (action: 'approve' | 'reject') => {
    if (!sessionId) return
    setActionBusy(true)
    const root = apiBase.replace(/\/$/, '')
    try {
      const res = await fetch(`${root}/api/v1/sessions/${sessionId}/actions`, {
        method: 'POST',
        headers: authHeaders(),
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

  useEffect(() => {
    if (!sessionId || !apiKey.trim()) {
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
        const res = await fetch(`${root}/api/v1/sessions/${sessionId}/chat`, {
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            Accept: 'text/event-stream',
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
            if (eventName === 'run_phase') {
              const phase = payload.phase
              const detail = payload.detail
              if (typeof phase === 'string') {
                const d = detail === null || detail === undefined ? '' : String(detail)
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
  }, [sessionId, apiKey, apiBase])

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
          <label htmlFor="ext">externalUserId</label>
          <input
            id="ext"
            name="ext"
            value={externalUserId}
            onChange={(e) => setExternalUserId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ctx">contextVars (JSON object)</label>
          <textarea id="ctx" name="ctx" value={contextVarsText} onChange={(e) => setContextVarsText(e.target.value)} />
          {contextError ? <p className="error">{contextError}</p> : null}
        </div>
        <button type="button" onClick={() => void createSession()}>
          POST /api/v1/sessions
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
          POST /api/v1/sessions/…/messages
        </button>
        {sendError ? <p className="error">{sendError}</p> : null}
      </div>

      <div className="card">
        <h2>Plan graph (from SSE started)</h2>
        {planGraph ? (
          <pre className="mono">{JSON.stringify(planGraph, null, 2)}</pre>
        ) : (
          <p style={{ color: '#64748b' }}>No plan yet.</p>
        )}
      </div>

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
