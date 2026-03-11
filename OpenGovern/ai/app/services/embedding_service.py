"""
Embedding generation service.
When an OpenAI key is present we call the real API.
Without a key we fall back to a deterministic mock that preserves relative
similarity (useful for local development without API costs).
"""
from __future__ import annotations

import hashlib
import logging
import math
from typing import Any, Dict, List

from app.config.settings import settings

logger = logging.getLogger(__name__)


def _mock_embedding(text: str) -> List[float]:
    """Generate a deterministic unit-normalised mock embedding.

    We seed a 1536-dimensional vector from the SHA-256 digest of the text
    so that identical strings always produce the same vector, while different
    strings produce vectors that are well-distributed in the space.
    This means cosine-similarity ranking still works for relative comparisons.
    """
    digest = hashlib.sha256(text.encode()).digest()
    # Expand 32 bytes → 1536 floats by cycling and adding positional noise
    raw: List[float] = []
    for i in range(1536):
        byte_val = digest[i % len(digest)]
        # Mix in position to break the cycling pattern
        raw.append(float(byte_val) + math.sin(i * 0.1) * 50)

    # L2-normalise so cosine similarity is valid
    norm = math.sqrt(sum(v * v for v in raw))
    return [v / norm for v in raw]


def generate(text: str) -> List[float]:
    """Return an embedding vector for the given text.

    Uses OpenAI when configured, falls back to mock otherwise.
    """
    if not settings.has_openai:
        logger.debug("No OpenAI key configured - using mock embedding")
        return _mock_embedding(text)

    from openai import OpenAI  # lazy import to avoid cost at import time

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model=settings.openai_embedding_model,
        input=text,
    )
    return response.data[0].embedding


def generate_asset_text(asset: Dict[str, Any]) -> str:
    """Produce the string we embed to represent an asset.

    We concatenate every human-readable field so that semantic search can
    find assets by description, column names, or technical identifiers.
    """
    parts: List[str] = []

    # Primary identifiers
    if name := asset.get("name"):
        parts.append(name)
    if fqn := asset.get("fully_qualified_name"):
        parts.append(fqn)
    if description := asset.get("description"):
        parts.append(description)

    # Schema columns add a lot of signal for table/dataset assets
    schema = asset.get("schema") or {}
    columns = schema.get("columns") or []
    if columns:
        col_names = [c.get("name", "") for c in columns if c.get("name")]
        parts.append(" ".join(col_names))

        col_descs = [c.get("description", "") for c in columns if c.get("description")]
        if col_descs:
            parts.append(" ".join(col_descs))

    # Tags and domain also help topical search
    for tag in asset.get("tags") or []:
        if isinstance(tag, dict):
            parts.append(tag.get("name", ""))
        elif isinstance(tag, str):
            parts.append(tag)

    if domain := asset.get("domain"):
        parts.append(domain)

    return " ".join(filter(None, parts))


class EmbeddingService:
    """Class wrapper for dependency-injection style usage in routers."""

    def generate(self, text: str) -> list:
        return generate(text)

    async def generate_async(self, text: str) -> list:
        return generate(text)

    def generate_asset_text(self, asset: dict) -> str:
        return generate_asset_text(asset)
