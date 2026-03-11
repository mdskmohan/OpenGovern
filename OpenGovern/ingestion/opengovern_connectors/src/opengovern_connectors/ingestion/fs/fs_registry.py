from opengovern_connectors.ingestion.api.registry import PluginRegistry
from opengovern_connectors.ingestion.fs.fs_base import FileSystem

fs_registry = PluginRegistry[FileSystem]()
fs_registry.register_from_entrypoint("datahub.fs.plugins")
