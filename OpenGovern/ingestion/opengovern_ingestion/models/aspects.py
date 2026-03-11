"""
Aspect payload models for OpenGovern's aspect-based metadata model.

Each aspect type has a strongly-typed Pydantic model that matches
the JSONB payload stored in the asset_aspects PostgreSQL table.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class OwnerType(str, Enum):
    DATAOWNER = "DATAOWNER"
    STEWARD = "STEWARD"
    CONSUMER = "CONSUMER"
    PRODUCER = "PRODUCER"


class OwnerEntry(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    owner_type: OwnerType = OwnerType.DATAOWNER


class OwnershipAspect(BaseModel):
    """Who owns this asset and in what capacity."""
    owners: List[OwnerEntry] = Field(default_factory=list)
    teams: List[str] = Field(default_factory=list)


class ColumnTag(BaseModel):
    name: str
    category: Optional[str] = None


class SchemaColumn(BaseModel):
    name: str
    data_type: str
    description: Optional[str] = None
    nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    position: int = 0
    tags: List[ColumnTag] = Field(default_factory=list)


class SchemaMetadataAspect(BaseModel):
    """Column-level schema information."""
    columns: List[SchemaColumn] = Field(default_factory=list)
    partition_keys: List[str] = Field(default_factory=list)
    row_count: Optional[int] = None
    size_bytes: Optional[int] = None
    last_modified: Optional[datetime] = None


class DescriptionAspect(BaseModel):
    """Human-readable description and extended documentation."""
    description: Optional[str] = None
    readme: Optional[str] = None         # Markdown-formatted extended docs


class ClassificationEntry(BaseModel):
    type: str                             # PII | PCI | PHI | CONFIDENTIAL | INTERNAL | PUBLIC
    confidence: float = 1.0
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None


class ClassificationAspect(BaseModel):
    """Sensitivity classifications applied to this asset."""
    classifications: List[ClassificationEntry] = Field(default_factory=list)
    custom_tags: List[str] = Field(default_factory=list)


class QualityDimensions(BaseModel):
    completeness: Optional[float] = None
    uniqueness: Optional[float] = None
    validity: Optional[float] = None
    freshness: Optional[float] = None
    accuracy: Optional[float] = None
    consistency: Optional[float] = None


class QualitySummaryAspect(BaseModel):
    """Summary of the latest quality check results."""
    overall_score: Optional[float] = None
    last_run_at: Optional[datetime] = None
    dimensions: QualityDimensions = Field(default_factory=QualityDimensions)
    rules_passed: int = 0
    rules_total: int = 0


class LineageInfoAspect(BaseModel):
    """Summary of lineage connections (full detail in lineage_edges table)."""
    upstream_count: int = 0
    downstream_count: int = 0
    has_column_lineage: bool = False


class DataContractAspect(BaseModel):
    """SLA agreement between producer and consumer teams."""
    freshness_hours: Optional[int] = None        # Max hours since last update
    completeness_threshold: Optional[float] = None  # Minimum % complete
    schema_change_notice_weeks: Optional[int] = None
    producer_team: Optional[str] = None
    consumer_teams: List[str] = Field(default_factory=list)
    status: str = "draft"                        # draft | active | breached | terminated
    activated_at: Optional[datetime] = None


class CustomMetadataAspect(BaseModel):
    """User-defined key-value metadata. No schema constraints."""
    properties: dict[str, Any] = Field(default_factory=dict)
