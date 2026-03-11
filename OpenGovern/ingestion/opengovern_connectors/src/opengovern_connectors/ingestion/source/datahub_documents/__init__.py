"""DataHub Documents Source - Process Document entities and generate embeddings."""

from opengovern_connectors.ingestion.source.datahub_documents.datahub_documents_config import (
    DataHubDocumentsSourceConfig,
)
from opengovern_connectors.ingestion.source.datahub_documents.datahub_documents_source import (
    DataHubDocumentsSource,
)

__all__ = ["DataHubDocumentsSource", "DataHubDocumentsSourceConfig"]
