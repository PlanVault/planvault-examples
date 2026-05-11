# SPDX-License-Identifier: Apache-2.0
"""
PlanVault → LangGraph bridge (FastAPI).

PlanVault calls POST /run as an HTTP tool during plan execution.
Replace `_invoke_graph` with your actual LangGraph StateGraph invocation.

Run:
    pip install fastapi uvicorn
    python webhook_handler.py

Register with PlanVault:
    POST /admin/v1/orgs/{orgId}/tools
    See README.md for the full registration payload.
"""
from __future__ import annotations

import os
from typing import Any

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="PlanVault → LangGraph bridge")


class RunRequest(BaseModel):
    query: str
    context: dict[str, Any] = {}


class RunResponse(BaseModel):
    result: str
    steps: list[str] = []


@app.post("/run", response_model=RunResponse)
async def run_agent(req: RunRequest) -> RunResponse:
    """
    Entry point called by PlanVault as an HTTP tool during plan execution.
    PlanVault passes the parameters the planner chose; this handler runs
    them through the LangGraph graph and returns the result.
    """
    result, steps = await _invoke_graph(req.query, req.context)
    return RunResponse(result=result, steps=steps)


async def _invoke_graph(
    query: str,
    context: dict[str, Any],
) -> tuple[str, list[str]]:
    """
    Replace this stub with your real LangGraph StateGraph invocation.

    Example with langgraph + langchain-openai:

        from langgraph.graph import StateGraph, END
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model="gpt-4o")

        def research_node(state):
            response = llm.invoke(state["messages"])
            return {"messages": state["messages"] + [response], "output": response.content}

        builder = StateGraph(dict)
        builder.add_node("research", research_node)
        builder.set_entry_point("research")
        builder.add_edge("research", END)
        graph = builder.compile()

        result = await graph.ainvoke({
            "messages": [{"role": "user", "content": query}],
            **context,
        })
        return result["output"], []
    """
    return f"[stub] processed query: {query}", ["stub_step"]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
