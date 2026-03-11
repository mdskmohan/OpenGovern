"""
OpenGovern Ingestion Framework

Connects data sources to OpenGovern's catalog.
Wraps acryl-datahub and openmetadata-ingestion sources.
Only writes the sink — zero connector code.

Usage:
    opengovern ingest --recipe snowflake.yaml
    opengovern ingest --source datahub_postgres --host localhost --db mydb
"""

__version__ = "1.0.0"
__author__ = "OpenGovern"
__all__ = ["__version__"]
