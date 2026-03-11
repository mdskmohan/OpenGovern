"""
OpenGovern CLI

Command-line interface for the ingestion framework.

Commands:
  opengovern ingest --recipe <path>         Run ingestion from recipe file
  opengovern validate --recipe <path>       Validate recipe and test connection
  opengovern sources list                   Show available connector types
  opengovern test-connection --recipe <path> Test source connection only

Examples:
  opengovern ingest --recipe snowflake.yaml
  opengovern ingest --recipe postgres.yaml --dry-run
  opengovern validate --recipe dbt.yaml
  opengovern sources list
"""
import click
from rich.console import Console
from rich.table import Table

console = Console()


@click.group()
@click.version_option(version="1.0.0", prog_name="opengovern")
def cli():
    """OpenGovern Ingestion CLI — connect your data sources to OpenGovern."""
    pass


@cli.command()
@click.option("--recipe", "-r", required=True, type=click.Path(exists=True), help="Path to recipe YAML file")
@click.option("--dry-run", is_flag=True, default=False, help="Validate without writing to OpenGovern")
@click.option("--verbose", "-v", is_flag=True, default=False, help="Verbose output")
def ingest(recipe: str, dry_run: bool, verbose: bool):
    """Run an ingestion pipeline from a recipe file."""
    from opengovern_ingestion.workflow.ingestion_pipeline import IngestionPipeline

    if dry_run:
        console.print("[yellow]DRY RUN — no data will be written to OpenGovern[/yellow]")

    try:
        pipeline = IngestionPipeline.from_recipe(recipe)
        if dry_run:
            # Override sink to a no-op
            pipeline.sink_config = {"type": "null", "config": {}}
        report = pipeline.run()
        raise SystemExit(0 if report.success else 1)
    except FileNotFoundError:
        console.print(f"[red]Recipe file not found: {recipe}[/red]")
        raise SystemExit(1)
    except Exception as e:
        console.print(f"[red]Ingestion failed: {e}[/red]")
        if verbose:
            import traceback
            console.print(traceback.format_exc())
        raise SystemExit(1)


@cli.command()
@click.option("--recipe", "-r", required=True, type=click.Path(exists=True), help="Path to recipe YAML file")
def validate(recipe: str):
    """Validate a recipe file and test the source connection."""
    import yaml

    console.print(f"Validating [cyan]{recipe}[/cyan]...")

    with open(recipe) as f:
        cfg = yaml.safe_load(f)

    # Check required fields
    if "source" not in cfg:
        console.print("[red]✗ Missing 'source' section[/red]")
        raise SystemExit(1)
    if "sink" not in cfg:
        console.print("[red]✗ Missing 'sink' section[/red]")
        raise SystemExit(1)

    source_type = cfg.get("source", {}).get("type", "")
    config = cfg.get("source", {}).get("config", {})

    console.print(f"[green]✓ Recipe format is valid[/green]")
    console.print(f"  Source: {source_type}")
    console.print(f"  Sink:   {cfg.get('sink', {}).get('type', 'opengovern_api')}")

    # Test connection for native sources
    if source_type.startswith("opengovern_"):
        source_map = {
            "opengovern_postgres": "opengovern_ingestion.source.postgres_source.PostgresSource",
        }
        class_path = source_map.get(source_type)
        if class_path:
            module_path, class_name = class_path.rsplit(".", 1)
            import importlib
            module = importlib.import_module(module_path)
            SourceClass = getattr(module, class_name)
            source = SourceClass(config)
            ok, err = source.test_connection()
            if ok:
                console.print("[green]✓ Source connection successful[/green]")
            else:
                console.print(f"[red]✗ Source connection failed: {err}[/red]")
                raise SystemExit(1)
        else:
            console.print(f"[yellow]⚠ Connection test not available for {source_type}[/yellow]")

    console.print("\n[green]Validation passed[/green]")


@cli.command(name="test-connection")
@click.option("--recipe", "-r", required=True, type=click.Path(exists=True), help="Path to recipe YAML file")
def test_connection(recipe: str):
    """Test the source connection defined in a recipe file."""
    import yaml
    with open(recipe) as f:
        cfg = yaml.safe_load(f)
    source_type = cfg.get("source", {}).get("type", "")
    config = cfg.get("source", {}).get("config", {})

    console.print(f"Testing connection for [cyan]{source_type}[/cyan]...")

    if source_type == "opengovern_postgres":
        from opengovern_ingestion.source.postgres_source import PostgresSource
        source = PostgresSource(config)
        ok, err = source.test_connection()
        if ok:
            console.print("[green]✓ Connection successful[/green]")
        else:
            console.print(f"[red]✗ Connection failed: {err}[/red]")
            raise SystemExit(1)
    else:
        console.print(f"[yellow]Connection test not available for {source_type}[/yellow]")
        console.print("For DataHub sources, run: opengovern ingest --recipe <file> --dry-run")


@cli.group()
def sources():
    """Manage and list available data source connectors."""
    pass


@sources.command(name="list")
def list_sources():
    """List all available connector types."""
    table = Table(title="Available Connectors", show_header=True, header_style="bold blue")
    table.add_column("Connector Type", style="cyan")
    table.add_column("Mode", style="yellow")
    table.add_column("Installation", style="green")
    table.add_column("Features")

    connectors = [
        # Native connectors
        ("opengovern_postgres",     "native",  "included",                      "Tables, views, FK lineage, column types"),
        # DataHub adapters (require acryl-datahub[xxx])
        ("datahub_snowflake",       "datahub", "pip install acryl-datahub[snowflake]",    "Tables, views, query lineage, column lineage"),
        ("datahub_bigquery",        "datahub", "pip install acryl-datahub[bigquery]",     "Tables, views, column lineage, partitions"),
        ("datahub_redshift",        "datahub", "pip install acryl-datahub[redshift]",     "Tables, views, lineage from query logs"),
        ("datahub_dbt",             "datahub", "pip install acryl-datahub[dbt-cloud]",    "Models, tests, column lineage, manifest"),
        ("datahub_looker",          "datahub", "pip install acryl-datahub[looker]",       "Looks, dashboards, explores, lineage"),
        ("datahub_tableau",         "datahub", "pip install acryl-datahub[tableau]",      "Workbooks, datasources, lineage"),
        ("datahub_airflow",         "datahub", "pip install acryl-datahub[airflow]",      "DAGs, task lineage, run history"),
        ("datahub_kafka",           "datahub", "pip install acryl-datahub[kafka]",        "Topics, schemas, consumer groups"),
        ("datahub_mysql",           "datahub", "pip install acryl-datahub[mysql]",        "Tables, views, FK lineage"),
        ("datahub_postgres",        "datahub", "pip install acryl-datahub",              "Tables, views, FK lineage"),
        ("datahub_spark",           "datahub", "pip install acryl-datahub[spark]",        "DataFrames, job lineage"),
        ("datahub_databricks",      "datahub", "pip install acryl-datahub[databricks]",   "Tables, notebooks, jobs, lineage"),
    ]

    for conn_type, mode, install, features in connectors:
        table.add_row(conn_type, mode, install, features)

    console.print(table)
    console.print("\n[dim]Native connectors work out of the box.[/dim]")
    console.print("[dim]DataHub connectors use acryl-datahub sources with the OpenGovern sink.[/dim]")
    console.print("[dim]OpenMetadata connectors coming soon.[/dim]")


if __name__ == "__main__":
    cli()
