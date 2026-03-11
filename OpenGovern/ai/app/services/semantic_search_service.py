"""
Semantic search orchestration.
Generates a query embedding, finds nearest neighbours in Qdrant, then enriches
each result with full asset details fetched from the core API.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from app.config.settings import settings
from app.services import embedding_service
from app.services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class SearchResult:
    """Lightweight DTO for a single semantic search hit."""

    def __init__(
        self,
        urn: str,
        name: str,
        entity_type: str,
        platform: str,
        score: float,
        description: str,
        quality_score: Optional[float],
        domain: Optional[str],
    ) -> None:
        self.urn = urn
        self.name = name
        self.entity_type = entity_type
        self.platform = platform
        self.score = score
        self.description = description
        self.quality_score = quality_score
        self.domain = domain

    def dict(self) -> Dict[str, Any]:
        return {
            "urn": self.urn,
            "name": self.name,
            "entity_type": self.entity_type,
            "platform": self.platform,
            "score": self.score,
            "description": self.description,
            "quality_score": self.quality_score,
            "domain": self.domain,
        }


def _fetch_asset(urn: str) -> Optional[Dict[str, Any]]:
    """Synchronously fetch a single asset from the core API.
    Returns None on any error so that a single failed lookup does not abort
    the whole result set.
    """
    try:
        encoded_urn = urn.replace("/", "%2F")
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.core_api_url}/api/v1/assets/{encoded_urn}"
            )
            if response.status_code == 200:
                return response.json()
    except Exception as exc:
        logger.warning("Failed to fetch asset %s from core API: %s", urn, exc)
    return None


def search(
    query: str,
    limit: int = 10,
    filters: Optional[Dict[str, Any]] = None,
) -> List[SearchResult]:
    """Return semantically relevant assets for the given natural-language query.

    Steps:
    1. Generate a query embedding (real or mock depending on config).
    2. Search Qdrant for the nearest stored asset vectors.
    3. Enrich each hit with live data from the core API.
    4. Fall back gracefully to the Qdrant payload when core API is unavailable.
    """
    query_vector = embedding_service.generate(query)
    raw_hits = qdrant_service.search(vector=query_vector, limit=limit, filters=filters or {})

    results: List[SearchResult] = []
    for hit in raw_hits:
        urn = hit["urn"]
        payload = hit["payload"]
        score = hit["score"]

        # Try to get fresh data from the core API
        asset = _fetch_asset(urn)

        if asset:
            results.append(
                SearchResult(
                    urn=urn,
                    name=asset.get("name", payload.get("name", "")),
                    entity_type=asset.get("entity_type", payload.get("entity_type", "")),
                    platform=asset.get("platform", payload.get("platform", "")),
                    score=score,
                    description=asset.get("description", payload.get("description", "")),
                    quality_score=asset.get("quality_score"),
                    domain=asset.get("domain", payload.get("domain")),
                )
            )
        else:
            # Degrade gracefully: serve Qdrant payload data without enrichment
            results.append(
                SearchResult(
                    urn=urn,
                    name=payload.get("name", ""),
                    entity_type=payload.get("entity_type", ""),
                    platform=payload.get("platform", ""),
                    score=score,
                    description=payload.get("description", ""),
                    quality_score=payload.get("quality_score"),
                    domain=payload.get("domain"),
                )
            )

    return results


class SemanticSearchService:
    """Class wrapper for dependency-injection style usage in routers."""

    async def search(self, query: str, limit: int = 10, filters: dict | None = None) -> list:
        return search(query=query, limit=limit, filters=filters)
