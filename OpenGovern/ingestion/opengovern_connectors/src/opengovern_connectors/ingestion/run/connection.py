import logging

from opengovern_connectors._version import __version__
from opengovern_connectors.ingestion.api.source import TestableSource, TestConnectionReport
from opengovern_connectors.ingestion.source.source_registry import source_registry

logger = logging.getLogger(__name__)


class ConnectionManager:
    """A class that helps build / manage / triage connections"""

    def test_source_connection(self, recipe_config_dict: dict) -> TestConnectionReport:
        # pulls out the source component of the dictionary
        # walks the type registry to find the source class
        # calls specific class.test_connection
        try:
            source_type = recipe_config_dict.get("source", {}).get("type")
            source_class = source_registry.get(source_type)
            if (
                issubclass(source_class, TestableSource)
                and source_class.test_connection != TestableSource.test_connection
            ):
                # validate that the class overrides the base implementation
                return source_class.test_connection(
                    recipe_config_dict.get("source", {}).get("config", {})
                )
            else:
                return TestConnectionReport(
                    internal_failure=True,
                    internal_failure_reason=f"Source {source_type} in library version {__version__} does not support test connection functionality.",
                )
        except Exception as e:
            logger.error(e)
            raise e
