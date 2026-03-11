"""
Native PostgreSQL Source

Reads table/view/column metadata from PostgreSQL information_schema.
Produces MetadataEvent objects for each table and view.
Extracts foreign key relationships as lineage edges.

This is OpenGovern's native PostgreSQL connector — it goes directly to
the database, capturing governance-relevant metadata that DataHub's
connector doesn't expose (like column-level access patterns).

For standard use cases, the DataHub adapter (acryl-datahub postgres source)
provides equivalent functionality and is well-tested at scale.
Use this as:
  1. A reference implementation for building custom connectors
  2. When you need additional governance metadata from Postgres

Usage in recipe:
  source:
    type: opengovern_postgres
    config:
      host: localhost
      port: 5432
      database: mydb
      username: postgres
      password: secret
      schemas: [public, analytics]
      include_views: true
"""
import logging
from typing import Iterator, Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

from .base_source import BaseSource
from ..models.metadata_event import MetadataEvent, ColumnMetadata, LineageEdge, AssetOwner

logger = logging.getLogger(__name__)


class PostgresConfig(BaseModel):
    """Configuration for the native PostgreSQL source connector."""
    host: str = Field(description="PostgreSQL host")
    port: int = Field(default=5432, description="PostgreSQL port")
    database: str = Field(description="Database name")
    username: str = Field(description="Database user")
    password: str = Field(description="Database password")
    schemas: list[str] = Field(default=["public"], description="Schemas to ingest")
    include_views: bool = Field(default=True, description="Include views as well as tables")
    service_name: Optional[str] = Field(default=None, description="Human-readable name for this PostgreSQL instance")


class PostgresSource(BaseSource):
    """
    Native OpenGovern connector for PostgreSQL.

    Reads from information_schema — requires no special permissions beyond
    SELECT on the schemas you want to ingest.
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.cfg = PostgresConfig(**config)
        self._conn = None

    def _get_connection(self):
        """Lazy connection — only connects when ingestion actually starts."""
        if self._conn is None:
            try:
                import psycopg2
                self._conn = psycopg2.connect(
                    host=self.cfg.host,
                    port=self.cfg.port,
                    dbname=self.cfg.database,
                    user=self.cfg.username,
                    password=self.cfg.password,
                    connect_timeout=30,
                )
            except ImportError:
                raise RuntimeError("psycopg2 is required: pip install psycopg2-binary")
        return self._conn

    def test_connection(self) -> tuple[bool, Optional[str]]:
        try:
            conn = self._get_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True, None
        except Exception as e:
            return False, str(e)

    def get_metadata_events(self) -> Iterator[MetadataEvent]:
        """
        Yields one MetadataEvent per table/view in the configured schemas.
        Reads table metadata and column definitions from information_schema.
        """
        conn = self._get_connection()

        # Determine entity types to include
        entity_types = ["BASE TABLE"]
        if self.cfg.include_views:
            entity_types.append("VIEW")

        placeholders = ",".join(["%s"] * len(entity_types))
        schema_placeholders = ",".join(["%s"] * len(self.cfg.schemas))

        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    t.table_schema,
                    t.table_name,
                    t.table_type,
                    pg_catalog.obj_description(
                        (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass::oid,
                        'pg_class'
                    ) as table_comment
                FROM information_schema.tables t
                WHERE t.table_schema IN ({schema_placeholders})
                  AND t.table_type IN ({placeholders})
                ORDER BY t.table_schema, t.table_name
                """,
                self.cfg.schemas + entity_types
            )
            tables = cur.fetchall()

        for schema, table_name, table_type, comment in tables:
            try:
                columns = self._get_columns(conn, schema, table_name)
                fqn = f"{self.cfg.database}.{schema}.{table_name}"
                entity_type = "table" if table_type == "BASE TABLE" else "view"

                yield MetadataEvent(
                    urn=MetadataEvent.to_urn("postgresql", entity_type, fqn.lower()),
                    entity_type=entity_type,
                    name=table_name,
                    fully_qualified_name=fqn,
                    platform="postgresql",
                    service_name=self.cfg.service_name or f"postgres-{self.cfg.host}",
                    database_name=self.cfg.database,
                    schema_name=schema,
                    description=comment,
                    columns=columns,
                    source="opengovern_postgres"
                )
            except Exception as e:
                self._add_error(f"Failed to process {schema}.{table_name}: {e}")
                logger.warning(f"Skipping {schema}.{table_name}: {e}")

    def get_lineage_events(self) -> Iterator[LineageEdge]:
        """
        Extracts foreign key relationships as lineage edges.
        FK: child_table.fk_column → parent_table.pk_column = lineage edge.
        """
        conn = self._get_connection()
        schema_placeholders = ",".join(["%s"] * len(self.cfg.schemas))

        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    tc.table_schema   AS child_schema,
                    tc.table_name     AS child_table,
                    ccu.table_schema  AS parent_schema,
                    ccu.table_name    AS parent_table,
                    kcu.column_name   AS child_column,
                    ccu.column_name   AS parent_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                   AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema IN ({schema_placeholders})
                """,
                self.cfg.schemas
            )
            fk_rows = cur.fetchall()

        for child_schema, child_table, parent_schema, parent_table, child_col, parent_col in fk_rows:
            child_fqn = f"{self.cfg.database}.{child_schema}.{child_table}".lower()
            parent_fqn = f"{self.cfg.database}.{parent_schema}.{parent_table}".lower()

            yield LineageEdge(
                upstream_urn=MetadataEvent.to_urn("postgresql", "table", parent_fqn),
                downstream_urn=MetadataEvent.to_urn("postgresql", "table", child_fqn),
                transformation_type="JOIN",
                column_lineage=[{
                    "upstream_column": parent_col,
                    "downstream_column": child_col,
                    "transformation": "FOREIGN_KEY"
                }]
            )

    def _get_columns(self, conn, schema: str, table: str) -> list[ColumnMetadata]:
        """Read column definitions for a specific table."""
        with conn.cursor() as cur:
            # Get column metadata
            cur.execute(
                """
                SELECT
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.ordinal_position,
                    pg_catalog.col_description(
                        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass::oid,
                        c.ordinal_position
                    ) as column_comment
                FROM information_schema.columns c
                WHERE c.table_schema = %s AND c.table_name = %s
                ORDER BY c.ordinal_position
                """,
                (schema, table)
            )
            cols = cur.fetchall()

            # Get primary key columns
            cur.execute(
                """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = %s AND tc.table_name = %s
                  AND tc.constraint_type = 'PRIMARY KEY'
                """,
                (schema, table)
            )
            pk_columns = {row[0] for row in cur.fetchall()}

        return [
            ColumnMetadata(
                name=col_name,
                data_type=data_type,
                description=comment,
                nullable=(is_nullable == "YES"),
                is_primary_key=col_name in pk_columns,
                position=position,
            )
            for col_name, data_type, is_nullable, position, comment in cols
        ]

    def __del__(self):
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
