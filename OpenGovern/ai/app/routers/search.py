"""
Search Router

Provides semantic search and AI-powered Q&A over data assets.
"""
import logging
from fastapi import APIRouter, HTTPException

from ..models.search import SearchRequest, SearchResponse, AskRequest, AskResponse
from ..services.semantic_search_service import SemanticSearchService
from ..services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter()

# Instantiate services (singletons for the app lifetime)
_search_service = SemanticSearchService()
_llm_service = LLMService()


@router.post("", response_model=SearchResponse)
async def semantic_search(request: SearchRequest) -> SearchResponse:
    """
    Perform semantic search over all indexed data assets.

    Converts the query to a vector embedding, finds nearest neighbors in Qdrant,
    then enriches results with full asset metadata from core-api.

    Falls back to keyword matching if OpenAI is not configured.
    """
    try:
        results = await _search_service.search(
            query=request.query,
            limit=request.limit,
            filters=request.filters.model_dump() if request.filters else {},
        )
        return SearchResponse(
            query=request.query,
            results=results,
            total=len(results),
        )
    except Exception as e:
        logger.error(f"Search failed for query '{request.query}': {e}")
        raise HTTPException(status_code=500, detail="Search failed. Please try again.")


@router.post("/ask", response_model=AskResponse)
async def ask_assistant(request: AskRequest) -> AskResponse:
    """
    Ask the AI governance assistant a natural language question.

    The assistant has access to tools: search_assets, get_asset_details,
    get_quality_score. It uses these to answer governance questions factually.

    Example questions:
      - "What tables contain customer PII data?"
      - "Which assets have a quality score below 70?"
      - "What are the downstream dependencies of orders table?"
    """
    try:
        response = await _llm_service.answer_question(
            question=request.question,
            context=request.context or {},
        )
        return response
    except Exception as e:
        logger.error(f"Assistant failed for question '{request.question}': {e}")
        raise HTTPException(status_code=500, detail="Assistant unavailable. Please try again.")
