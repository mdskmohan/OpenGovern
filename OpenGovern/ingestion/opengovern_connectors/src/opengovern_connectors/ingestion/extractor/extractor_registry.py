from opengovern_connectors.ingestion.api.registry import PluginRegistry
from opengovern_connectors.ingestion.api.source import Extractor
from opengovern_connectors.ingestion.extractor.mce_extractor import WorkUnitRecordExtractor

extractor_registry = PluginRegistry[Extractor]()

# Add a defaults to extractor registry.
extractor_registry.register("generic", WorkUnitRecordExtractor)
