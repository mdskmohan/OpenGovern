"""
OpenGovern Sink — The ONLY connector code we write.

Receives DataHub MetadataChangeEvents (MCE) from any acryl-datahub source.
Translates the MCE format to OpenGovern's MetadataEvent format.
POSTs to OpenGovern's core-api.

With this sink + acryl-datahub installed, ALL 50+ DataHub connectors
work with OpenGovern automatically. We write zero connector logic.

Usage in a DataHub pipeline config::

    {
        "source": {"type": "snowflake", "config": {...}},
        "sink": {
            "type": "opengovern",
            "config": {
                "api_url": "http://localhost:3001",
                "api_token": "your-token"
            }
        }
    }
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel

from ..models.metadata_event import (
    AssetOwner,
    ColumnMetadata,
    LineageEdge,
    MetadataEvent,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration & statistics
# ---------------------------------------------------------------------------


class OpenGovernSinkConfig(BaseModel):
    """Configuration for the OpenGovern sink."""

    api_url: str
    api_token: str
    timeout_seconds: int = 30
    batch_size: int = 100


class IngestionStats(BaseModel):
    """Running ingestion statistics."""

    created: int = 0
    updated: int = 0
    failed: int = 0
    skipped: int = 0


# ---------------------------------------------------------------------------
# Sink implementation
# ---------------------------------------------------------------------------


class OpenGovernSink:
    """
    Custom DataHub-compatible sink for OpenGovern.

    Implements the DataHub Sink interface (write_record / close) so it
    can be plugged into any existing DataHub pipeline without changes to
    the source connector.
    """

    def __init__(self, config: OpenGovernSinkConfig) -> None:
        self.config = config
        self.stats = IngestionStats()
        self.client = httpx.Client(
            base_url=config.api_url,
            headers={
                "Authorization": f"Bearer {config.api_token}",
                "Content-Type": "application/json",
                "X-Ingestion-Source": "opengovern-sink",
            },
            timeout=config.timeout_seconds,
        )

    # ------------------------------------------------------------------
    # Public DataHub Sink interface
    # ------------------------------------------------------------------

    def write_record(self, record: Any) -> None:
        """
        Entry point for the DataHub pipeline.

        Receives a DataHub MetadataChangeEvent workunit,
        translates it, and upserts the asset into OpenGovern.
        """
        try:
            event = self._translate_to_opengovern(record)
            if event is None:
                self.stats.skipped += 1
                return
            self._upsert_asset(event)
        except Exception as exc:
            self.stats.failed += 1
            urn = getattr(record, "urn", None) or getattr(
                getattr(record, "metadata", None), "proposedSnapshot", None
            )
            logger.error("Failed to process record %s: %s", urn, exc)

    def get_report(self) -> Dict[str, int]:
        """Return ingestion statistics."""
        return self.stats.model_dump()

    # ------------------------------------------------------------------
    # Translation: DataHub → OpenGovern
    # ------------------------------------------------------------------

    def _translate_to_opengovern(self, record: Any) -> Optional[MetadataEvent]:
        """
        Translate a DataHub MCE / WorkUnit to an OpenGovern MetadataEvent.

        Supported entity types:
        - dataset        → table or view
        - dashboard      → dashboard
        - dataFlow       → pipeline
        - dataJob        → pipeline (task-level)
        - mlModel        → ml_model
        - chart          → dashboard (sub-type)
        - corpUser       → skipped (user management is internal to OpenGovern)
        """
        try:
            if hasattr(record, "metadata") and hasattr(
                record.metadata, "proposedSnapshot"
            ):
                return self._translate_snapshot(record.metadata.proposedSnapshot)
            elif hasattr(record, "proposedSnapshot"):
                return self._translate_snapshot(record.proposedSnapshot)
            else:
                logger.debug("Unknown record format: %s", type(record).__name__)
                return None
        except Exception as exc:
            logger.warning("Translation failed for record type %s: %s", type(record).__name__, exc)
            return None

    def _translate_snapshot(self, snapshot: Any) -> Optional[MetadataEvent]:
        """Translate a DataHub entity snapshot to a MetadataEvent."""
        urn_str = str(getattr(snapshot, "urn", "") or "")

        # Skip internal DataHub entity types we don't model
        if any(skip in urn_str for skip in ("corpuser", "corpGroup", "tag:", "glossary")):
            return None

        platform, entity_type, name, fqn = self._parse_datahub_urn(urn_str)
        if not platform:
            logger.debug("Could not parse URN: %s", urn_str)
            return None

        event = MetadataEvent(
            urn=f"urn:opengovern:{platform}:{entity_type}:{fqn}",
            entity_type=entity_type,
            name=name,
            fully_qualified_name=fqn,
            platform=platform,
            source="datahub_ingestion",
        )

        for aspect in getattr(snapshot, "aspects", []):
            self._apply_aspect(event, aspect)

        return event

    def _parse_datahub_urn(self, urn: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """
        Parse a DataHub URN into (platform, entity_type, name, fqn).

        DataHub URN formats::

            urn:li:dataset:(urn:li:dataPlatform:snowflake,PROD.ANALYTICS.REVENUE,PROD)
            urn:li:dashboard:(tableau,revenue_dashboard)
            urn:li:dataFlow:(airflow,daily_revenue_etl,prod)
            urn:li:mlModel:(urn:li:dataPlatform:sagemaker,my_model,PROD)
        """
        try:
            if "dataset" in urn:
                # urn:li:dataset:(urn:li:dataPlatform:{platform},{fqn},{env})
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                platform = parts[0].split(":")[-1]  # e.g. snowflake
                fqn = parts[1].strip() if len(parts) > 1 else ""
                name = fqn.split(".")[-1] if "." in fqn else fqn
                return platform, "table", name, fqn.lower()

            elif "dashboard" in urn:
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                platform = parts[0].strip()
                name = parts[1].strip() if len(parts) > 1 else ""
                return platform, "dashboard", name, f"{platform}.{name}"

            elif "dataFlow" in urn:
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                platform = parts[0].strip()
                name = parts[1].strip() if len(parts) > 1 else ""
                return platform, "pipeline", name, f"{platform}.{name}"

            elif "dataJob" in urn:
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                # dataJob URN: (urn:li:dataFlow:(...),job_id)
                job_id = parts[-1].strip()
                # Try to extract platform from parent dataFlow URN
                parent_platform = "unknown"
                if "dataPlatform:" in parts[0]:
                    parent_platform = parts[0].split("dataPlatform:")[-1].split(",")[0]
                return parent_platform, "pipeline", job_id, f"{parent_platform}.{job_id}"

            elif "mlModel" in urn:
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                platform = parts[0].split(":")[-1] if ":" in parts[0] else parts[0]
                name = parts[1].strip() if len(parts) > 1 else ""
                return platform, "ml_model", name, f"{platform}.{name}"

            elif "chart" in urn:
                inner = urn.split("(", 1)[1].rstrip(")")
                parts = inner.split(",")
                platform = parts[0].strip()
                name = parts[1].strip() if len(parts) > 1 else ""
                return platform, "dashboard", name, f"{platform}.{name}"

            else:
                return None, None, None, None

        except Exception as exc:
            logger.debug("URN parse error for '%s': %s", urn, exc)
            return None, None, None, None

    def _apply_aspect(self, event: MetadataEvent, aspect: Any) -> None:
        """Apply a single DataHub aspect to the MetadataEvent in-place."""
        aspect_type = type(aspect).__name__

        if "SchemaMetadata" in aspect_type:
            columns: List[ColumnMetadata] = []
            for i, field in enumerate(getattr(aspect, "fields", [])):
                raw_type = getattr(field, "type", None)
                # DataHub type objects are nested; extract string representation
                type_str = "unknown"
                if raw_type is not None:
                    inner = getattr(raw_type, "type", raw_type)
                    type_str = str(inner).split(".")[-1].lower() if inner else "unknown"

                columns.append(
                    ColumnMetadata(
                        name=str(getattr(field, "fieldPath", f"col_{i}")).split(".")[-1],
                        data_type=type_str,
                        description=getattr(field, "description", None),
                        nullable=getattr(field, "nullable", True),
                        position=i,
                    )
                )
            event.columns = columns

        elif "Ownership" in aspect_type:
            owners: List[AssetOwner] = []
            for owner_record in getattr(aspect, "owners", []):
                owner_urn = str(getattr(owner_record, "owner", "") or "")
                owner_type_raw = getattr(owner_record, "type", None)
                owner_type = (
                    str(getattr(owner_type_raw, "type", owner_type_raw) or "DATAOWNER")
                    .split(".")[-1]
                    .upper()
                )
                # URN is not an email — extract username as best effort
                email = owner_urn.split(":")[-1] if ":" in owner_urn else owner_urn
                owners.append(AssetOwner(email=email, owner_type=owner_type))
            event.owners = owners

        elif "DatasetDescription" in aspect_type or "EditableDatasetProperties" in aspect_type:
            desc = getattr(aspect, "description", None)
            if desc:
                event.description = desc

        elif "UpstreamLineage" in aspect_type:
            edges: List[LineageEdge] = []
            for upstream in getattr(aspect, "upstreams", []):
                up_urn = str(getattr(getattr(upstream, "dataset", None), "urn", "") or "")
                if up_urn:
                    platform, entity_type, _, fqn = self._parse_datahub_urn(up_urn)
                    if platform and fqn:
                        edges.append(
                            LineageEdge(
                                upstream_urn=f"urn:opengovern:{platform}:{entity_type}:{fqn}",
                                downstream_urn=event.urn,
                            )
                        )
            event.lineage.extend(edges)

        elif "GlobalTags" in aspect_type:
            for tag_assoc in getattr(aspect, "tags", []):
                tag_urn = str(getattr(getattr(tag_assoc, "tag", None), "urn", "") or "")
                tag_name = tag_urn.split(":")[-1] if ":" in tag_urn else tag_urn
                if tag_name and tag_name not in event.tags:
                    event.tags.append(tag_name)

    # ------------------------------------------------------------------
    # API communication
    # ------------------------------------------------------------------

    def _upsert_asset(self, event: MetadataEvent) -> None:
        """POST the MetadataEvent to core-api /api/v1/assets/upsert."""
        try:
            response = self.client.post(
                "/api/v1/assets/upsert",
                content=event.model_dump_json(),
            )
            response.raise_for_status()
            result = response.json()

            if result.get("created"):
                self.stats.created += 1
                logger.debug("Created asset: %s", event.urn)
            else:
                self.stats.updated += 1
                logger.debug("Updated asset: %s", event.urn)

        except httpx.HTTPStatusError as exc:
            self.stats.failed += 1
            logger.error(
                "API error upserting %s: HTTP %s — %s",
                event.urn,
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise

    # ------------------------------------------------------------------
    # Context manager support
    # ------------------------------------------------------------------

    def __enter__(self) -> "OpenGovernSink":
        return self

    def __exit__(self, *args: Any) -> None:
        self.client.close()
