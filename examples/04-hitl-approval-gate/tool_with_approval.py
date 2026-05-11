# SPDX-License-Identifier: Apache-2.0
"""
Human-in-the-loop approval gate tool server (FastAPI).

Implements a blocking `POST /tools/send-message` endpoint:
  1. PlanVault calls the endpoint as an HTTP tool during plan execution.
  2. The handler queues the request and notifies a human reviewer.
  3. The HTTP call is held open until the reviewer approves or rejects.
  4. The tool responds to PlanVault only after a human decision.

Two complementary approval patterns are supported — see README.md for details.

Run:
    pip install fastapi uvicorn
    python tool_with_approval.py

Register with PlanVault (see README.md for full payload):
    POST /admin/v1/orgs/{orgId}/tools
"""
from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="HITL approval gate — send-message tool")

# ---------------------------------------------------------------------------
# In-memory approval queue.
# Replace with Redis + persistent store for production deployments.
# ---------------------------------------------------------------------------
_pending: dict[str, asyncio.Event] = {}
_approved: set[str] = set()

APPROVAL_TIMEOUT_SECONDS = int(os.environ.get("APPROVAL_TIMEOUT_SECONDS", "300"))


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class SendMessageRequest(BaseModel):
    recipient: str
    subject: str
    body: str


class ApproveRequest(BaseModel):
    approved: bool


# ---------------------------------------------------------------------------
# Tool endpoint — called by PlanVault during plan execution
# ---------------------------------------------------------------------------
@app.post("/tools/send-message")
async def send_message(req: SendMessageRequest) -> dict[str, Any]:
    """
    PlanVault calls this endpoint as an HTTP tool.
    The call blocks until a human approves (or rejects) via POST /approve/{id}.
    """
    request_id = str(uuid.uuid4())
    event = asyncio.Event()
    _pending[request_id] = event

    # -----------------------------------------------------------------------
    # Notify a human reviewer — replace with your real alerting integration:
    # e.g. send_slack_message, send_email, post_to_pagerduty, etc.
    # -----------------------------------------------------------------------
    print(
        f"[HITL] Approval required: id={request_id}"
        f" to={req.recipient!r} subject={req.subject!r}",
        flush=True,
    )

    try:
        await asyncio.wait_for(event.wait(), timeout=APPROVAL_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        _pending.pop(request_id, None)
        _approved.discard(request_id)
        raise HTTPException(
            status_code=408,
            detail=f"Approval timeout after {APPROVAL_TIMEOUT_SECONDS}s for request {request_id}",
        )

    _pending.pop(request_id, None)

    if request_id not in _approved:
        _approved.discard(request_id)
        raise HTTPException(
            status_code=403,
            detail=f"Action rejected by operator for request {request_id}",
        )

    _approved.discard(request_id)

    # -----------------------------------------------------------------------
    # Execute the actual action only after approval.
    # Replace with your real message-sending logic:
    # e.g. await smtp_client.send(req.recipient, req.subject, req.body)
    # -----------------------------------------------------------------------
    print(f"[HITL] Approved — sending to {req.recipient!r}", flush=True)

    return {
        "status": "sent",
        "request_id": request_id,
        "recipient": req.recipient,
        "subject": req.subject,
    }


# ---------------------------------------------------------------------------
# Operator approval endpoint — called by a human reviewer or automation
# ---------------------------------------------------------------------------
@app.post("/approve/{request_id}")
async def approve(request_id: str, req: ApproveRequest) -> dict[str, str]:
    """
    Approve or reject a pending tool call.
    Call this from your operator dashboard, Slack slash command, etc.
    """
    event = _pending.get(request_id)
    if event is None:
        raise HTTPException(
            status_code=404,
            detail=f"Request {request_id} not found or already resolved",
        )
    if req.approved:
        _approved.add(request_id)
    event.set()
    return {
        "status": "approved" if req.approved else "rejected",
        "request_id": request_id,
    }


@app.get("/pending")
async def list_pending() -> dict[str, list[str]]:
    """List pending approval request IDs (for operator dashboards)."""
    return {"pending": list(_pending.keys())}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
