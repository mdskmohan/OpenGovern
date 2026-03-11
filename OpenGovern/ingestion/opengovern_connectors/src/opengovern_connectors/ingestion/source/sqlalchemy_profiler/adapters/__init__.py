"""Platform adapter factory for SQL profiling."""

import logging
from typing import Type

from sqlalchemy.engine import Engine

from opengovern_connectors.ingestion.source.ge_profiling_config import ProfilingConfig
from opengovern_connectors.ingestion.source.sql.sql_report import SQLSourceReport
from opengovern_connectors.ingestion.source.sqlalchemy_profiler.base_adapter import PlatformAdapter

logger = logging.getLogger(__name__)


def get_adapter(
    platform: str,
    config: ProfilingConfig,
    report: SQLSourceReport,
    base_engine: Engine,
) -> PlatformAdapter:
    """
    Factory function to get platform-specific profiling adapter.

    Uses lazy imports to avoid loading adapters with missing optional dependencies.
    This allows eg BigQuery profiling to work even if pyathena is not installed, etc.

    Args:
        platform: Database platform name (e.g., "bigquery", "snowflake")
        config: Profiling configuration
        report: Report object for warnings/errors
        base_engine: SQLAlchemy engine

    Returns:
        Platform-specific adapter instance
    """
    platform_lower = platform.lower()

    # Lazy imports: only import the adapter we actually need
    # This prevents failures when optional dependencies are missing
    adapter_class: Type[PlatformAdapter]
    if platform_lower == "bigquery":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.bigquery import (
            BigQueryAdapter,
        )

        adapter_class = BigQueryAdapter
    elif platform_lower == "athena":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.athena import (
            AthenaAdapter,
        )

        adapter_class = AthenaAdapter
    elif platform_lower in ("postgresql", "postgres"):
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.postgres import (
            PostgresAdapter,
        )

        adapter_class = PostgresAdapter
    elif platform_lower == "mysql":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.mysql import (
            MySQLAdapter,
        )

        adapter_class = MySQLAdapter
    elif platform_lower == "redshift":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.redshift import (
            RedshiftAdapter,
        )

        adapter_class = RedshiftAdapter
    elif platform_lower == "snowflake":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.snowflake import (
            SnowflakeAdapter,
        )

        adapter_class = SnowflakeAdapter
    elif platform_lower == "databricks":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.databricks import (
            DatabricksAdapter,
        )

        adapter_class = DatabricksAdapter
    elif platform_lower == "trino":
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.trino import (
            TrinoAdapter,
        )

        adapter_class = TrinoAdapter
    else:
        # Fallback to generic adapter for unknown platforms
        from opengovern_connectors.ingestion.source.sqlalchemy_profiler.adapters.generic import (
            GenericAdapter,
        )

        adapter_class = GenericAdapter

    logger.debug(f"Using {adapter_class.__name__} for platform '{platform}'")

    return adapter_class(config, report, base_engine)
