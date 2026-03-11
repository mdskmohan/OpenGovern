"""
Qdrant client wrapper providing a clean async interface for all vector operations.
We use the synchronous client wrapped in run_in_executor where needed so that
the FastAPI event loop stays unblocked on heavy IO without requiring the async
qdrant client (which has a different dependency footprint).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

from app.config.settings import settings

logger = logging.getLogger(__name__)

# Dimension count for text-embedding-3-small
EMBEDDING_DIM = 1536


class QdrantService:
    def __init__(self) -> None:
        self._client: Optional[QdrantClient] = None

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(url=settings.qdrant_url)
        return self._client

    def ensure_collection(self) -> None:
        """Create the collection if it does not already exist.
        Called once at application startup so all subsequent operations succeed.
        """
        try:
            self.client.get_collection(settings.qdrant_collection)
            logger.info("Qdrant collection '%s' already exists", settings.qdrant_collection)
        except UnexpectedResponse:
            # Collection does not exist - create it with cosine distance which
            # works best for sentence-level semantic similarity.
            self.client.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config=qdrant_models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=qdrant_models.Distance.COSINE,
                ),
            )
            logger.info("Created Qdrant collection '%s'", settings.qdrant_collection)

    def upsert(self, id: str, vector: List[float], payload: Dict[str, Any]) -> None:
        """Insert or update a single vector point.
        We use a deterministic string ID derived from the asset URN so that
        re-indexing an asset always replaces the old embedding cleanly.
        """
        self.client.upsert(
            collection_name=settings.qdrant_collection,
            points=[
                qdrant_models.PointStruct(
                    id=self._urn_to_id(id),
                    vector=vector,
                    payload={**payload, "urn": id},
                )
            ],
        )

    def search(
        self,
        vector: List[float],
        limit: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Return nearest-neighbour matches with their payloads and scores."""
        qdrant_filter = self._build_filter(filters or {})

        results = self.client.search(
            collection_name=settings.qdrant_collection,
            query_vector=vector,
            limit=limit,
            query_filter=qdrant_filter,
            with_payload=True,
        )

        return [
            {
                "urn": hit.payload.get("urn", ""),
                "score": hit.score,
                "payload": hit.payload,
            }
            for hit in results
        ]

    def delete(self, id: str) -> None:
        """Remove a point from the collection by URN."""
        self.client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=qdrant_models.PointIdsList(
                points=[self._urn_to_id(id)]
            ),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _urn_to_id(urn: str) -> int:
        """Convert a URN string to a stable integer ID for Qdrant.
        Qdrant supports string IDs natively in newer versions, but using a
        hash keeps us compatible with all versions >=1.7.
        """
        return abs(hash(urn)) % (2**63)

    @staticmethod
    def _build_filter(filters: Dict[str, Any]) -> Optional[qdrant_models.Filter]:
        """Translate a simple key→value dict into a Qdrant must-match filter."""
        if not filters:
            return None

        conditions = []
        for key, value in filters.items():
            if value is None:
                continue
            conditions.append(
                qdrant_models.FieldCondition(
                    key=key,
                    match=qdrant_models.MatchValue(value=value),
                )
            )

        if not conditions:
            return None

        return qdrant_models.Filter(must=conditions)


# Module-level singleton - services import this directly
qdrant_service = QdrantService()
