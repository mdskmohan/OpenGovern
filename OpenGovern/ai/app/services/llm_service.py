"""
LLM-powered assistant for natural-language data governance queries.
Uses OpenAI function calling so the model can look up real data before answering.
Falls back to a canned explanation when no API key is configured.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Tool definitions for function calling
# ──────────────────────────────────────────────────────────────────────────────

_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_assets",
            "description": "Search the data catalog for assets matching a query",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language search query"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_asset_details",
            "description": "Get full details of a specific data asset by URN",
            "parameters": {
                "type": "object",
                "properties": {
                    "urn": {"type": "string", "description": "Asset URN identifier"},
                },
                "required": ["urn"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lineage",
            "description": "Get upstream and downstream lineage for an asset",
            "parameters": {
                "type": "object",
                "properties": {
                    "urn": {"type": "string"},
                    "direction": {"type": "string", "enum": ["upstream", "downstream", "both"], "default": "both"},
                    "depth": {"type": "integer", "default": 2},
                },
                "required": ["urn"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quality_score",
            "description": "Get data quality score and dimension breakdown for an asset",
            "parameters": {
                "type": "object",
                "properties": {
                    "urn": {"type": "string"},
                },
                "required": ["urn"],
            },
        },
    },
]

_SYSTEM_PROMPT = """You are an intelligent data governance assistant for OpenGovern.
You help users understand their data catalog, data lineage, quality scores, and governance policies.

You have access to tools that let you look up real information from the catalog.
Always use these tools to get accurate, up-to-date information before answering.

Be concise and factual. When citing assets, include their URN.
If you cannot find the requested information, say so clearly."""


# ──────────────────────────────────────────────────────────────────────────────
# Tool execution (calls back to core API and semantic search)
# ──────────────────────────────────────────────────────────────────────────────

def _call_core_api(path: str) -> Optional[Dict[str, Any]]:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{settings.core_api_url}{path}")
            if response.status_code == 200:
                return response.json()
    except Exception as exc:
        logger.warning("Core API call failed: %s - %s", path, exc)
    return None


def _execute_tool(name: str, arguments: Dict[str, Any]) -> str:
    """Execute a tool call and return the result as a JSON string."""
    try:
        if name == "search_assets":
            # Delegate to our own search endpoint via the semantic search service
            from app.services import semantic_search_service
            results = semantic_search_service.search(
                query=arguments["query"],
                limit=arguments.get("limit", 5),
            )
            return json.dumps([r.dict() for r in results])

        elif name == "get_asset_details":
            urn = arguments["urn"]
            encoded = urn.replace("/", "%2F")
            data = _call_core_api(f"/api/v1/assets/{encoded}")
            return json.dumps(data or {"error": "Asset not found"})

        elif name == "get_lineage":
            urn = arguments["urn"]
            encoded = urn.replace("/", "%2F")
            direction = arguments.get("direction", "both")
            depth = arguments.get("depth", 2)
            data = _call_core_api(
                f"/api/v1/lineage/{encoded}?direction={direction}&depth={depth}"
            )
            return json.dumps(data or {"error": "Lineage not found"})

        elif name == "get_quality_score":
            urn = arguments["urn"]
            encoded = urn.replace("/", "%2F")
            data = _call_core_api(f"/api/v1/quality/{encoded}")
            return json.dumps(data or {"error": "Quality data not found"})

        return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as exc:
        logger.error("Tool execution error for %s: %s", name, exc)
        return json.dumps({"error": str(exc)})


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def answer_question(
    question: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Answer a data governance question using the LLM with tool calling.

    Returns {"answer": str, "sources": [{"urn": str, "name": str}]}
    """
    if not settings.has_openai:
        return {
            "answer": (
                "AI assistant is not configured. "
                "Please set OPENAI_API_KEY to enable natural language queries."
            ),
            "sources": [],
        }

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
    ]

    if context:
        messages.append({
            "role": "user",
            "content": f"Context: {json.dumps(context)}\n\nQuestion: {question}",
        })
    else:
        messages.append({"role": "user", "content": question})

    sources: List[Dict[str, str]] = []

    # Agentic loop: let the model call tools until it has enough information
    for _ in range(5):  # max iterations to prevent infinite loops
        response = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
            tools=_TOOLS,
            tool_choice="auto",
        )

        message = response.choices[0].message

        if not message.tool_calls:
            # Model is done - return its final answer
            return {
                "answer": message.content or "I was unable to find an answer.",
                "sources": sources,
            }

        # Execute each tool call the model requested
        messages.append(message.model_dump())

        for tool_call in message.tool_calls:
            func_name = tool_call.function.name
            func_args = json.loads(tool_call.function.arguments)
            result_str = _execute_tool(func_name, func_args)

            # Collect source references from search results
            if func_name == "search_assets":
                try:
                    results = json.loads(result_str)
                    for r in results[:3]:
                        if r.get("urn") and r.get("name"):
                            sources.append({"urn": r["urn"], "name": r["name"]})
                except Exception:
                    pass

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result_str,
            })

    # Fell through the loop without a final answer
    return {
        "answer": "I reached the maximum number of reasoning steps. Please try rephrasing your question.",
        "sources": sources,
    }


class LLMService:
    """Class wrapper for dependency-injection style usage in routers."""

    async def answer_question(self, question: str, context: dict | None = None) -> dict:
        return answer_question(question=question, context=context or {})
