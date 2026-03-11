"""
Ingestion Pipeline

Orchestrates the flow: Source → [Transform] → Sink.
Reads configuration from YAML recipe files.

Supports three source modes:
  1. Native (opengovern_postgres, opengovern_mysql, etc.)
     → Uses BaseSource subclasses defined in source/
  2. DataHub adapter (datahub_snowflake, datahub_bigquery, etc.)
     → pip install acryl-datahub[snowflake]
     → Uses DataHub sources + OpenGovernSink
  3. OpenMetadata adapter (openmetadata_snowflake, etc.)
     → pip install openmetadata-ingestion[snowflake]

Recipe format (YAML):
  source:
    type: opengovern_postgres       # or datahub_snowflake, etc.
    config:
      host: localhost
      database: mydb
      username: postgres
      password: secret
  sink:
    type: opengovern_api
    config:
      api_url: http://localhost:3001
      api_token: your-token
  options:
    default_domain: finance
    default_tags: [internal]
"""
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import yaml
import httpx
from rich.console import Console
from rich.table import Table

logger = logging.getLogger(__name__)
console = Console()


@dataclass
class PipelineReport:
    """Results from an ingestion pipeline run."""
    source_type: str
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    assets_discovered: int = 0
    assets_created: int = 0
    assets_updated: int = 0
    assets_failed: int = 0
    lineage_edges: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def duration_seconds(self) -> float:
        if self.completed_at:
            return self.completed_at - self.started_at
        return time.time() - self.started_at

    @property
    def success(self) -> bool:
        return len(self.errors) == 0

    def print_summary(self):
        """Print a rich-formatted summary table."""
        table = Table(title="Ingestion Report", show_header=True, header_style="bold blue")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")

        table.add_row("Source Type", self.source_type)
        table.add_row("Duration", f"{self.duration_seconds:.1f}s")
        table.add_row("Assets Discovered", str(self.assets_discovered))
        table.add_row("Assets Created", str(self.assets_created))
        table.add_row("Assets Updated", str(self.assets_updated))
        table.add_row("Assets Failed", str(self.assets_failed))
        table.add_row("Lineage Edges", str(self.lineage_edges))
        table.add_row("Status", "✓ Success" if self.success else f"✗ {len(self.errors)} errors")

        console.print(table)

        if self.errors:
            console.print("\n[bold red]Errors:[/bold red]")
            for err in self.errors[:10]:  # Show first 10 errors
                console.print(f"  • {err}", style="red")


class IngestionPipeline:
    """
    Orchestrates a complete ingestion run from recipe configuration.
    """

    def __init__(self, recipe: dict):
        self.recipe = recipe
        self.source_config = recipe.get("source", {})
        self.sink_config = recipe.get("sink", {})
        self.options = recipe.get("options", {})
        self.report = PipelineReport(source_type=self.source_config.get("type", "unknown"))

    @classmethod
    def from_recipe(cls, recipe_path: str) -> "IngestionPipeline":
        """Load pipeline from a YAML recipe file."""
        with open(recipe_path, "r") as f:
            recipe = yaml.safe_load(f)
        return cls(recipe)

    @classmethod
    def from_dict(cls, recipe: dict) -> "IngestionPipeline":
        """Create pipeline from a recipe dictionary."""
        return cls(recipe)

    def run(self) -> PipelineReport:
        """Execute the ingestion pipeline. Returns a report."""
        source_type = self.source_config.get("type", "")
        config = self.source_config.get("config", {})

        console.print(f"\n[bold]OpenGovern Ingestion[/bold]")
        console.print(f"Source: [cyan]{source_type}[/cyan]")
        console.print(f"Sink: [cyan]{self.sink_config.get('type', 'opengovern_api')}[/cyan]\n")

        if source_type.startswith("opengovern_"):
            self._run_native(source_type, config)
        elif source_type.startswith("datahub_"):
            self._run_datahub(source_type.replace("datahub_", ""), config)
        elif source_type.startswith("openmetadata_"):
            self._run_openmetadata(source_type.replace("openmetadata_", ""), config)
        else:
            self.report.errors.append(f"Unknown source type: {source_type}")
            console.print(f"[red]Unknown source type: {source_type}[/red]")

        self.report.completed_at = time.time()
        self.report.print_summary()
        return self.report

    def _run_native(self, source_type: str, config: dict) -> None:
        """Run a native OpenGovern source."""
        source_map = {
            "opengovern_postgres": "opengovern_ingestion.source.postgres_source.PostgresSource",
        }

        class_path = source_map.get(source_type)
        if not class_path:
            self.report.errors.append(f"Native source '{source_type}' not implemented yet")
            return

        module_path, class_name = class_path.rsplit(".", 1)
        import importlib
        module = importlib.import_module(module_path)
        SourceClass = getattr(module, class_name)

        source = SourceClass(config)

        # Test connection first
        ok, err = source.test_connection()
        if not ok:
            self.report.errors.append(f"Connection failed: {err}")
            console.print(f"[red]Connection failed: {err}[/red]")
            return

        console.print("[green]✓ Connection successful[/green]")
        sink = self._create_api_sink()

        # Process metadata events
        with console.status("[bold]Ingesting assets...[/bold]"):
            for event in source.get_metadata_events():
                self.report.assets_discovered += 1
                result = sink.upsert(event)
                if result.get("created"):
                    self.report.assets_created += 1
                elif result.get("error"):
                    self.report.assets_failed += 1
                    self.report.errors.append(f"Failed {event.urn}: {result['error']}")
                else:
                    self.report.assets_updated += 1

        # Process lineage edges
        with console.status("[bold]Processing lineage...[/bold]"):
            for edge in source.get_lineage_events():
                if sink.add_lineage(edge):
                    self.report.lineage_edges += 1

        # Add any source errors
        self.report.errors.extend(source.get_errors())

    def _run_datahub(self, datahub_source_type: str, config: dict) -> None:
        """
        Run a DataHub source with the OpenGovern sink.

        This is the zero-code-connector approach: acryl-datahub provides
        the source (50+ connectors), we provide the sink (100 lines).
        """
        try:
            from datahub.ingestion.run.pipeline import Pipeline
            from opengovern_ingestion.sink.opengovern_sink import OpenGovernSink, OpenGovernSinkConfig
        except ImportError:
            self.report.errors.append("acryl-datahub not installed: pip install acryl-datahub")
            return

        sink_cfg = self.sink_config.get("config", {})
        opengovern_sink = OpenGovernSink(OpenGovernSinkConfig(
            api_url=sink_cfg.get("api_url", "http://localhost:3001"),
            api_token=sink_cfg.get("api_token", ""),
        ))

        # Build DataHub pipeline config
        pipeline_config = {
            "source": {
                "type": datahub_source_type,
                "config": config,
            },
            "sink": {
                "type": "file",  # DataHub writes to file; we intercept
                "config": {"filename": "/tmp/og_datahub_output.json"},
            }
        }

        try:
            # Run DataHub pipeline — it produces MCE JSON files
            pipeline = Pipeline.create(pipeline_config)
            pipeline.run()
            pipeline.pretty_print_summary()

            # Process the output file through our sink
            import json
            with open("/tmp/og_datahub_output.json") as f:
                for line in f:
                    try:
                        record = json.loads(line)
                        opengovern_sink.write_record_from_dict(record)
                        self.report.assets_discovered += 1
                    except Exception as e:
                        self.report.assets_failed += 1
                        self.report.errors.append(str(e))

            stats = opengovern_sink.get_report()
            self.report.assets_created = stats["created"]
            self.report.assets_updated = stats["updated"]
            self.report.assets_failed = stats["failed"]

        except Exception as e:
            self.report.errors.append(f"DataHub pipeline failed: {e}")
            logger.error(f"DataHub pipeline error: {e}")

    def _run_openmetadata(self, om_source_type: str, config: dict) -> None:
        """Run an OpenMetadata source with OpenGovern as the destination."""
        self.report.errors.append(
            f"OpenMetadata adapter for '{om_source_type}' not yet implemented. "
            f"Use datahub_{om_source_type} instead for equivalent functionality."
        )

    def _create_api_sink(self):
        """Create the API sink for native sources."""
        sink_cfg = self.sink_config.get("config", {})

        class SimpleSink:
            def __init__(self, api_url: str, token: str, options: dict):
                self.client = httpx.Client(
                    base_url=api_url,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    timeout=30
                )
                self.options = options

            def upsert(self, event) -> dict:
                try:
                    payload = event.model_dump(mode="json")
                    # Apply pipeline-level defaults
                    if self.options.get("default_domain") and not payload.get("domain"):
                        payload["default_domain_slug"] = self.options["default_domain"]
                    if self.options.get("default_tags"):
                        payload["tags"] = list(set(payload.get("tags", []) + self.options["default_tags"]))

                    r = self.client.post("/api/v1/assets/upsert", json=payload)
                    r.raise_for_status()
                    return r.json()
                except Exception as e:
                    return {"error": str(e)}

            def add_lineage(self, edge) -> bool:
                try:
                    self.client.post("/api/v1/lineage", json=edge.model_dump(mode="json"))
                    return True
                except Exception:
                    return False

        return SimpleSink(
            api_url=sink_cfg.get("api_url", "http://localhost:3001"),
            token=sink_cfg.get("api_token", ""),
            options=self.options,
        )
