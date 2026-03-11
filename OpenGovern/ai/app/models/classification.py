"""
Pydantic models for classification API requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class DataClassification(str, Enum):
    """Supported data sensitivity classifications."""
    PII = "PII"       # Personally Identifiable Information
    PCI = "PCI"       # Payment Card Industry data
    PHI = "PHI"       # Protected Health Information
    CONFIDENTIAL = "CONFIDENTIAL"
    INTERNAL = "INTERNAL"
    PUBLIC = "PUBLIC"


class ClassifyColumnRequest(BaseModel):
    """Request to classify a single column."""
    column_name: str
    data_type: str
    sample_values: List[str] = Field(default_factory=list, max_length=10)
    table_name: Optional[str] = None


class ColumnClassificationResult(BaseModel):
    """Classification result for one column."""
    column_name: str
    classification: DataClassification
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    method: str  # llm | regex | heuristic


class ClassifyAssetRequest(BaseModel):
    """Request to classify all columns in an asset."""
    asset_urn: str
    schema: dict  # The schema_metadata aspect payload


class AssetClassificationResult(BaseModel):
    """Classification results for all columns in an asset."""
    asset_urn: str
    columns: List[ColumnClassificationResult]
    overall_sensitivity: DataClassification
    pii_column_count: int
    requires_review: bool


class EmbedRequest(BaseModel):
    """Request to generate and store an embedding for an asset."""
    asset_urn: str
    name: str
    description: Optional[str] = None
    entity_type: str
    platform: str
    fully_qualified_name: Optional[str] = None
    column_names: List[str] = Field(default_factory=list)
    domain_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class BatchEmbedRequest(BaseModel):
    """Request to embed multiple assets."""
    assets: List[EmbedRequest]
