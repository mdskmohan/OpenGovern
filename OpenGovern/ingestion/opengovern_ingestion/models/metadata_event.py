"""
Canonical metadata event models for the OpenGovern ingestion framework.

All assets entering OpenGovern are normalized into MetadataEvent before
being sent to the core-api. This provides a stable internal contract
regardless of the source system (DataHub MCE, OpenMetadata, native).
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ColumnMetadata(BaseModel):
    """Schema-level metadata for a single column / field."""

    name: str
    data_type: str
    description: Optional[str] = None
    nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    position: int = 0
    tags: List[str] = Field(default_factory=list)


class AssetOwner(BaseModel):
    """Ownership record for an asset."""

    email: str
    name: Optional[str] = None
    # DATAOWNER | STEWARD | CONSUMER | PRODUCER
    owner_type: str = "DATAOWNER"


class ColumnLineageMap(BaseModel):
    """Fine-grained column-level lineage mapping."""

    upstream_column: str
    downstream_column: str
    transformation: str = "DIRECT"


class LineageEdge(BaseModel):
    """An upstream → downstream lineage relationship between two assets."""

    upstream_urn: str
    downstream_urn: str
    transformation_type: str = "TRANSFORM"
    pipeline_name: Optional[str] = None
    column_lineage: List[ColumnLineageMap] = Field(default_factory=list)


class MetadataEvent(BaseModel):
    """
    Canonical format for all assets entering OpenGovern.

    Produced by native sources (e.g. postgres_source) or translated from
    DataHub MCE / OpenMetadata payloads by the OpenGovernSink.
    """

    urn: str
    entity_type: str  # table | view | dashboard | pipeline | ml_model | topic
    name: str
    fully_qualified_name: Optional[str] = None
    platform: str      # snowflake | bigquery | postgresql | tableau | dbt | airflow
    service_name: Optional[str] = None
    database_name: Optional[str] = None
    schema_name: Optional[str] = None
    description: Optional[str] = None
    owners: List[AssetOwner] = Field(default_factory=list)
    columns: List[ColumnMetadata] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    lineage: List[LineageEdge] = Field(default_factory=list)
    custom_metadata: Dict[str, str] = Field(default_factory=dict)
    source: str = "ingestion"
    ingested_at: datetime = Field(default_factory=datetime.utcnow)

    @staticmethod
    def to_urn(platform: str, entity_type: str, fqn: str) -> str:
        """Generate a standard OpenGovern URN.

        Args:
            platform:    The data platform identifier, e.g. ``snowflake``.
            entity_type: The entity type, e.g. ``table``.
            fqn:         The fully-qualified name, e.g. ``prod.analytics.revenue``.

        Returns:
            A URN string in the form ``urn:opengovern:<platform>:<entity_type>:<fqn>``.
        """
        safe_fqn = fqn.lower().replace(" ", "_")
        return f"urn:opengovern:{platform}:{entity_type}:{safe_fqn}"

    class Config:
        # Allow population by field name (Pydantic v1 compat shim)
        populate_by_name = True
