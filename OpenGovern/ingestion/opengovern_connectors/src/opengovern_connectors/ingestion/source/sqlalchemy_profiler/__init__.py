"""Custom SQLAlchemy-based profiler to replace Great Expectations dependency."""

from opengovern_connectors.ingestion.source.sqlalchemy_profiler.sqlalchemy_profiler import (
    SQLAlchemyProfiler,
)

__all__ = ["SQLAlchemyProfiler"]
