"""
Embeddings Router

Manages vector embeddings for data assets.
Called by core-api after every asset create/update to keep the
search index in sync.
"""
import logging
from fastapi import APIRouter, HTTPException

from ..models.classification import EmbedRequest, BatchEmbedRequest
from ..services.embedding_service import EmbeddingService
from ..services.qdrant_service import QdrantService

logger = logging.getLogger(__name__)
router = APIRouter()

_embedding_service = EmbeddingService()
_qdrant_service = QdrantService()


@router.post("")
async def embed_asset(request: EmbedRequest):
    """
    Generate and store an embedding for a single data asset.

    Called by core-api whenever an asset is created or its description/schema changes.
    The embedding text is: name + fqn + description + column names + tags.
    """
    try:
        text = _embedding_service.generate_asset_text(request.model_dump())
        vector = _embedding_service.generate(text)

        _qdrant_service.upsert(
            id=request.asset_urn,
            vector=vector,
            payload={
                "urn": request.asset_urn,
                "name": request.name,
                "entity_type": request.entity_type,
                "platform": request.platform,
                "description": request.description,
                "domain_name": request.domain_name,
                "tags": request.tags,
            },
        )
        return {"success": True, "urn": request.asset_urn}
    except Exception as e:
        logger.error(f"Failed to embed asset {request.asset_urn}: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


@router.post("/batch")
async def batch_embed(request: BatchEmbedRequest):
    """
    Generate and store embeddings for multiple assets.
    Used for bulk re-indexing (e.g., after large ingestion runs).
    """
    results = {"success": 0, "failed": 0, "errors": []}

    for asset in request.assets:
        try:
            text = _embedding_service.generate_asset_text(asset.model_dump())
            vector = _embedding_service.generate(text)
            _qdrant_service.upsert(
                id=asset.asset_urn,
                vector=vector,
                payload={
                    "urn": asset.asset_urn,
                    "name": asset.name,
                    "entity_type": asset.entity_type,
                    "platform": asset.platform,
                    "description": asset.description,
                    "domain_name": asset.domain_name,
                    "tags": asset.tags,
                },
            )
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"urn": asset.asset_urn, "error": str(e)})

    return results


@router.delete("/{asset_urn:path}")
async def delete_embedding(asset_urn: str):
    """
    Remove an asset's embedding from the vector store.
    Called when an asset is deleted from the catalog.
    """
    try:
        _qdrant_service.delete(asset_urn)
        return {"success": True, "urn": asset_urn}
    except Exception as e:
        logger.error(f"Failed to delete embedding for {asset_urn}: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
