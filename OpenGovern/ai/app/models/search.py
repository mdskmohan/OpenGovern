"""
Pydantic models for search API requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class SearchFilters(BaseModel):
    """Optional filters to narrow semantic search results."""
    entity_type: Optional[str] = None   # table | dashboard | pipeline | ml_model
    platform: Optional[str] = None      # snowflake | bigquery | postgresql
    domain: Optional[str] = None        # domain slug


class SearchRequest(BaseModel):
    """Request body for semantic search."""
    query: str = Field(..., min_length=1, max_length=500, description="Natural language search query")
    limit: int = Field(default=10, ge=1, le=50, description="Number of results to return")
    filters: Optional[SearchFilters] = None


class SearchResult(BaseModel):
    """A single search result with relevance score."""
    urn: str
    name: str
    entity_type: str
    platform: str
    description: Optional[str] = None
    domain_name: Optional[str] = None
    quality_score: Optional[float] = None
    certification_status: Optional[str] = None
    score: float = Field(description="Relevance score (0-1, higher is better)")
    highlights: Dict[str, str] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    """Response containing ranked search results."""
    query: str
    results: List[SearchResult]
    total: int
    search_type: str = "semantic"  # semantic | keyword | hybrid


class AskRequest(BaseModel):
    """Request for conversational AI assistant."""
    question: str = Field(..., min_length=1, max_length=1000)
    context: Optional[Dict[str, Any]] = None


class AskResponse(BaseModel):
    """Response from AI assistant."""
    answer: str
    sources: List[Dict[str, str]] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)
