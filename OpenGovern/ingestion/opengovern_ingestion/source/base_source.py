"""
Base Source — abstract base class for native OpenGovern connectors.

Native connectors bypass DataHub/OpenMetadata entirely and produce
OpenGovern MetadataEvents directly. Use this for:
  - Extracting governance-specific metadata that OM/DH don't capture
  - Building custom connectors for internal systems
  - When you need full control over the ingestion logic

For standard connectors (Snowflake, BigQuery, dbt, etc.),
use the DataHub adapter (opengovern_sink.py with acryl-datahub sources).
"""
from abc import ABC, abstractmethod
from typing import Iterator, Optional, Type
from pydantic_settings import BaseSettings

from ..models.metadata_event import MetadataEvent, LineageEdge


class BaseSource(ABC):
    """
    Abstract base class for native OpenGovern data source connectors.

    Implement this class to build a custom connector that produces
    MetadataEvent objects for any data source.
    """

    def __init__(self, config: dict):
        self.config = config
        self._errors: list[str] = []

    @abstractmethod
    def get_metadata_events(self) -> Iterator[MetadataEvent]:
        """
        Yield MetadataEvent objects for each discoverable asset.
        Each event represents one table, view, dashboard, pipeline, etc.
        """
        pass

    def get_lineage_events(self) -> Iterator[LineageEdge]:
        """
        Yield LineageEdge objects representing data flow relationships.
        Default: no lineage. Override to provide lineage information.
        """
        return iter([])

    def test_connection(self) -> tuple[bool, Optional[str]]:
        """
        Test that the source connection is working.
        Returns (success, error_message).
        Override to provide source-specific connectivity checks.
        """
        return True, None

    @classmethod
    def get_config_class(cls) -> Optional[Type[BaseSettings]]:
        """
        Returns the Pydantic Settings class for this source's configuration.
        Used by the CLI to display required fields and validate recipe files.
        """
        return None

    def get_errors(self) -> list[str]:
        """Returns any non-fatal errors encountered during ingestion."""
        return self._errors

    def _add_error(self, message: str) -> None:
        """Record a non-fatal error (doesn't stop ingestion)."""
        self._errors.append(message)
