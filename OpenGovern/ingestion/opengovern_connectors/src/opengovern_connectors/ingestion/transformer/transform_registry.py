from opengovern_connectors.ingestion.api.registry import PluginRegistry
from opengovern_connectors.ingestion.api.transform import Transformer

transform_registry = PluginRegistry[Transformer]()
transform_registry.register_from_entrypoint("datahub.ingestion.transformer.plugins")
