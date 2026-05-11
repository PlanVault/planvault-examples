// SPDX-License-Identifier: Apache-2.0
/**
 * PlanVault Code node for n8n.
 *
 * Paste this into an n8n "Code" node (JavaScript mode).
 * Creates a session, sends the incoming prompt, polls history until done,
 * and returns the last LLM reply.
 *
 * Required n8n environment variables (set in Settings → Variables):
 *   PLANVAULT_BASE_URL    — e.g. https://api.planvault.ai
 *   PLANVAULT_PROJECT_ID  — UUID of the project
 *   PLANVAULT_API_KEY     — project API key (sk_live_…)
 *
 * Input item:
 *   $json.prompt  — the user prompt to send to PlanVault (string, required)
 *   $json.tags    — optional array of session tags (default: ["n8n"])
 *   $json.contextVars — optional JSON object passed as session contextVars
 *
 * Output item:
 *   result     — last llm_reply content (string)
 *   sessionId  — PlanVault session UUID
 *   status     — "done" | "error" | "timeout"
 *   events     — full history event array
 */

const BASE = ($env.PLANVAULT_BASE_URL ?? "https://api.planvault.ai").replace(/\/$/, "");
const PROJECT = $env.PLANVAULT_PROJECT_ID;
const KEY = $env.PLANVAULT_API_KEY;

if (!PROJECT) throw new Error("PLANVAULT_PROJECT_ID is not set");
if (!KEY) throw new Error("PLANVAULT_API_KEY is not set");

const prompt = $json.prompt;
if (typeof prompt !== "string" || !prompt.trim()) {
  throw new Error("Input item must have a non-empty 'prompt' string field");
}

const tags = Array.isArray($json.tags) ? $json.tags : ["n8n"];
const contextVars =
  $json.contextVars && typeof $json.contextVars === "object" && !Array.isArray($json.contextVars)
    ? $json.contextVars
    : {};

const headers = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// 1. Create session
// ---------------------------------------------------------------------------
const sessionRes = await $http.request({
  method: "POST",
  url: `${BASE}/api/v1/projects/${encodeURIComponent(PROJECT)}/sessions`,
  headers,
  body: JSON.stringify({ contextVars, tags }),
});

const sessionId = sessionRes.id;
if (!sessionId) throw new Error(`Unexpected session response: ${JSON.stringify(sessionRes)}`);

// ---------------------------------------------------------------------------
// 2. Send message (202 Accepted — execution is async)
// ---------------------------------------------------------------------------
await $http.request({
  method: "POST",
  url: `${BASE}/api/v1/projects/${encodeURIComponent(PROJECT)}/sessions/${sessionId}/messages`,
  headers,
  body: JSON.stringify({ message: prompt }),
});

// ---------------------------------------------------------------------------
// 3. Poll GET .../history until done or error (max 120 s)
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60; // 60 × 2 s = 120 s

let events = [];
let status = "timeout";

for (let i = 0; i < MAX_POLLS; i++) {
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

  const hist = await $http.request({
    method: "GET",
    url: `${BASE}/api/v1/projects/${encodeURIComponent(PROJECT)}/sessions/${sessionId}/history`,
    headers,
  });

  events = Array.isArray(hist.events) ? hist.events : [];

  const terminal = events.find(
    (e) => e.eventType === "done" || e.eventType === "error",
  );
  if (terminal) {
    status = terminal.eventType;
    break;
  }
}

// ---------------------------------------------------------------------------
// 4. Extract last llm_reply content
// ---------------------------------------------------------------------------
const reply = [...events].reverse().find((e) => e.eventType === "llm_reply");

// llm_reply payload shape: { content: string } or { text: string }
const result =
  typeof reply?.content === "string"
    ? reply.content
    : typeof reply?.text === "string"
      ? reply.text
      : "";

return [{ json: { result, sessionId, status, events } }];
