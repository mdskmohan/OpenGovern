'use client';

/**
 * Integrations — Full Connector Management with Run Observability
 *
 * Production-grade connector management modeled after OpenMetadata.
 * Shows all 50+ connectors (DataHub's full catalog), run history, stats, audit logs.
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Play, Trash2, CheckCircle2, XCircle, Clock,
  AlertCircle, ChevronRight, Database, BarChart3, GitBranch,
  Cpu, MessageSquare, Cloud, Layers, Activity, Search, X,
  Loader2, RefreshCw, Eye, Package, AlertTriangle,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Filter, Calendar, ArrowRight, Check
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';

// ─── Full Connector Catalog ──────────────────────────────────────────────────

const CONNECTORS = [
  // ── Databases ──────────────────────────────────────────────────────────────
  { id: 'opengovern_postgres', name: 'PostgreSQL',        cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, views, columns, FK lineage' },
  { id: 'datahub_mysql',       name: 'MySQL',             cat: 'Database',       Icon: Database,      bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Tables, views, columns, schemas' },
  { id: 'datahub_mssql',       name: 'SQL Server',        cat: 'Database',       Icon: Database,      bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Tables, views, stored procedures' },
  { id: 'datahub_oracle',      name: 'Oracle',            cat: 'Database',       Icon: Database,      bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Tables, views, packages, synonyms' },
  { id: 'datahub_clickhouse',  name: 'ClickHouse',        cat: 'Database',       Icon: Database,      bg: 'bg-yellow-50',  fg: 'text-yellow-700', border: 'border-yellow-200', desc: 'Tables, columns, partitions, views' },
  { id: 'datahub_db2',         name: 'IBM Db2',           cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, schemas, views, indexes' },
  { id: 'datahub_trino',       name: 'Trino',             cat: 'Database',       Icon: Database,      bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Catalogs, schemas, tables, views' },
  { id: 'datahub_athena',      name: 'Amazon Athena',     cat: 'Database',       Icon: Database,      bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Tables, databases, partitions' },
  { id: 'datahub_mariadb',     name: 'MariaDB',           cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, views, columns' },
  { id: 'datahub_teradata',    name: 'Teradata',          cat: 'Database',       Icon: Database,      bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Tables, views, schemas, lineage' },
  { id: 'datahub_vertica',     name: 'Vertica',           cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, projections, schemas' },
  { id: 'datahub_mongodb',     name: 'MongoDB',           cat: 'Database',       Icon: Database,      bg: 'bg-green-50',   fg: 'text-green-700',  border: 'border-green-200',  desc: 'Collections, databases, schemas' },
  { id: 'datahub_cassandra',   name: 'Cassandra',         cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, keyspaces, columns' },
  { id: 'datahub_elasticsearch',name:'Elasticsearch',     cat: 'Database',       Icon: Database,      bg: 'bg-yellow-50',  fg: 'text-yellow-700', border: 'border-yellow-200', desc: 'Indices, mappings, fields' },

  // ── Data Warehouses ─────────────────────────────────────────────────────────
  { id: 'datahub_snowflake',   name: 'Snowflake',         cat: 'Data Warehouse', Icon: Cloud,         bg: 'bg-cyan-50',    fg: 'text-cyan-700',   border: 'border-cyan-200',   desc: 'Tables, views, query lineage, column lineage' },
  { id: 'datahub_bigquery',    name: 'BigQuery',          cat: 'Data Warehouse', Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, views, column lineage, partitions' },
  { id: 'datahub_redshift',    name: 'Redshift',          cat: 'Data Warehouse', Icon: Cloud,         bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Tables, views, lineage from query logs' },
  { id: 'datahub_databricks',  name: 'Databricks',        cat: 'Data Warehouse', Icon: Layers,        bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Unity Catalog, tables, notebooks, jobs' },
  { id: 'datahub_hive',        name: 'Apache Hive',       cat: 'Data Warehouse', Icon: Layers,        bg: 'bg-yellow-50',  fg: 'text-yellow-700', border: 'border-yellow-200', desc: 'Tables, partitions, lineage' },
  { id: 'datahub_presto',      name: 'Presto',            cat: 'Data Warehouse', Icon: Layers,        bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, schemas, catalogs' },
  { id: 'datahub_synapse',     name: 'Azure Synapse',     cat: 'Data Warehouse', Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Pools, schemas, tables, lineage' },
  { id: 'datahub_deltalake',   name: 'Delta Lake',        cat: 'Data Warehouse', Icon: Layers,        bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Delta tables, schemas, history' },

  // ── Transformation ──────────────────────────────────────────────────────────
  { id: 'datahub_dbt',         name: 'dbt',               cat: 'Transformation', Icon: GitBranch,     bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Models, tests, column lineage from manifest.json' },
  { id: 'datahub_spark',       name: 'Apache Spark',      cat: 'Transformation', Icon: Cpu,           bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Job lineage, DataFrame operations' },
  { id: 'datahub_flink',       name: 'Apache Flink',      cat: 'Transformation', Icon: Cpu,           bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Job lineage, streaming pipelines' },
  { id: 'datahub_glue',        name: 'AWS Glue',          cat: 'Transformation', Icon: Cloud,         bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Jobs, crawlers, databases, tables' },
  { id: 'datahub_adf',         name: 'Azure Data Factory',cat: 'Transformation', Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Pipelines, activities, lineage' },

  // ── Orchestration ───────────────────────────────────────────────────────────
  { id: 'datahub_airflow',     name: 'Apache Airflow',    cat: 'Orchestration',  Icon: Activity,      bg: 'bg-teal-50',    fg: 'text-teal-700',   border: 'border-teal-200',   desc: 'DAG lineage, task dependencies, run history' },
  { id: 'datahub_dagster',     name: 'Dagster',           cat: 'Orchestration',  Icon: Activity,      bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Assets, jobs, repositories, lineage' },
  { id: 'datahub_prefect',     name: 'Prefect',           cat: 'Orchestration',  Icon: Activity,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Flows, tasks, deployments' },

  // ── BI Tools ────────────────────────────────────────────────────────────────
  { id: 'datahub_looker',      name: 'Looker',            cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Looks, dashboards, explores, table lineage' },
  { id: 'datahub_tableau',     name: 'Tableau',           cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Workbooks, datasources, field lineage' },
  { id: 'datahub_powerbi',     name: 'Power BI',          cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-yellow-50',  fg: 'text-yellow-700', border: 'border-yellow-200', desc: 'Dashboards, datasets, report lineage' },
  { id: 'datahub_metabase',    name: 'Metabase',          cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-green-50',   fg: 'text-green-700',  border: 'border-green-200',  desc: 'Questions, dashboards, collections' },
  { id: 'datahub_superset',    name: 'Apache Superset',   cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Dashboards, charts, datasets' },
  { id: 'datahub_grafana',     name: 'Grafana',           cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Dashboards, panels, datasources' },
  { id: 'datahub_mode',        name: 'Mode Analytics',    cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-yellow-50',  fg: 'text-yellow-700', border: 'border-yellow-200', desc: 'Reports, charts, datasources' },
  { id: 'datahub_sigma',       name: 'Sigma Computing',   cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Workbooks, worksheets, datasources' },
  { id: 'datahub_microstrategy',name:'MicroStrategy',     cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Reports, documents, dossiers' },
  { id: 'datahub_qlik',        name: 'Qlik Sense',        cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-green-50',   fg: 'text-green-700',  border: 'border-green-200',  desc: 'Apps, sheets, measures' },

  // ── Messaging & Streaming ───────────────────────────────────────────────────
  { id: 'datahub_kafka',       name: 'Apache Kafka',      cat: 'Messaging',      Icon: MessageSquare, bg: 'bg-gray-50',    fg: 'text-gray-700',   border: 'border-gray-200',   desc: 'Topics, schemas, consumer groups' },
  { id: 'datahub_pulsar',      name: 'Apache Pulsar',     cat: 'Messaging',      Icon: MessageSquare, bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Topics, tenants, namespaces' },
  { id: 'datahub_kinesis',     name: 'Amazon Kinesis',    cat: 'Messaging',      Icon: MessageSquare, bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Streams, shards, schemas' },

  // ── File Storage ─────────────────────────────────────────────────────────────
  { id: 'datahub_s3',          name: 'Amazon S3',         cat: 'File Storage',   Icon: Cloud,         bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Buckets, objects, schemas, partitions' },
  { id: 'datahub_gcs',         name: 'Google GCS',        cat: 'File Storage',   Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Buckets, objects, datasets' },
  { id: 'datahub_adls',        name: 'Azure ADLS',        cat: 'File Storage',   Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Containers, directories, files' },

  // ── ML Platforms ─────────────────────────────────────────────────────────────
  { id: 'datahub_mlflow',      name: 'MLflow',            cat: 'ML Platform',    Icon: Cpu,           bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Experiments, models, runs, metrics' },
  { id: 'datahub_sagemaker',   name: 'AWS SageMaker',     cat: 'ML Platform',    Icon: Cpu,           bg: 'bg-orange-50',  fg: 'text-orange-700', border: 'border-orange-200', desc: 'Models, training jobs, endpoints' },
  { id: 'datahub_feast',       name: 'Feast',             cat: 'ML Platform',    Icon: Cpu,           bg: 'bg-green-50',   fg: 'text-green-700',  border: 'border-green-200',  desc: 'Feature stores, feature views, entities' },
  { id: 'datahub_vertexai',    name: 'Vertex AI',         cat: 'ML Platform',    Icon: Cpu,           bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Models, datasets, pipelines' },

  // ── Data Quality ─────────────────────────────────────────────────────────────
  { id: 'datahub_great_expectations', name: 'Great Expectations', cat: 'Data Quality', Icon: CheckCircle2, bg: 'bg-green-50', fg: 'text-green-700', border: 'border-green-200', desc: 'Expectations, suites, validation results' },

  // ── Additional Databases (complete DataHub coverage) ──────────────────────
  { id: 'datahub_cockroachdb',  name: 'CockroachDB',       cat: 'Database',       Icon: Database,      bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Distributed SQL tables, schemas, views' },
  { id: 'datahub_druid',        name: 'Apache Druid',      cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Datasources, segments, metrics' },
  { id: 'datahub_singlestore',  name: 'SingleStore',       cat: 'Database',       Icon: Database,      bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Tables, views, stored procedures' },
  { id: 'datahub_starburst',    name: 'Starburst',         cat: 'Database',       Icon: Database,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Catalogs, schemas, tables, views' },

  // ── Messaging (complete) ─────────────────────────────────────────────────────
  { id: 'datahub_eventhubs',    name: 'Azure Event Hubs',  cat: 'Messaging',      Icon: MessageSquare, bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Event hubs, consumer groups, schemas' },
  { id: 'datahub_pubsub',       name: 'Google Pub/Sub',    cat: 'Messaging',      Icon: MessageSquare, bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Topics, subscriptions, schemas' },

  // ── Orchestration (additional) ───────────────────────────────────────────────
  { id: 'datahub_nifi',         name: 'Apache NiFi',       cat: 'Orchestration',  Icon: Activity,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Flows, processors, connections' },
  { id: 'datahub_fivetran',     name: 'Fivetran',          cat: 'Orchestration',  Icon: Activity,      bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Connectors, destinations, schemas' },

  // ── BI Tools (additional) ────────────────────────────────────────────────────
  { id: 'datahub_redash',       name: 'Redash',            cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-red-50',     fg: 'text-red-700',    border: 'border-red-200',    desc: 'Queries, dashboards, data sources' },
  { id: 'datahub_lightdash',    name: 'Lightdash',         cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-purple-50',  fg: 'text-purple-700', border: 'border-purple-200', desc: 'Dashboards, charts, projects' },
  { id: 'datahub_hex',          name: 'Hex',               cat: 'BI Tool',        Icon: BarChart3,     bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Projects, charts, data cells' },

  // ── File Formats ─────────────────────────────────────────────────────────────
  { id: 'datahub_iceberg',      name: 'Apache Iceberg',    cat: 'File Storage',   Icon: Layers,        bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Tables, snapshots, schemas, partitions' },

  // ── CRM / SaaS ───────────────────────────────────────────────────────────────
  { id: 'datahub_salesforce',   name: 'Salesforce',        cat: 'SaaS / CRM',     Icon: Cloud,         bg: 'bg-blue-50',    fg: 'text-blue-700',   border: 'border-blue-200',   desc: 'Objects, fields, metadata, relationships' },

  // ── Other ────────────────────────────────────────────────────────────────────
  { id: 'datahub_openapi',      name: 'OpenAPI',           cat: 'Other',          Icon: Layers,        bg: 'bg-gray-50',    fg: 'text-gray-700',   border: 'border-gray-200',   desc: 'REST APIs, endpoints, schemas (OpenAPI spec)' },
  { id: 'datahub_csv',          name: 'CSV / Files',       cat: 'Other',          Icon: Layers,        bg: 'bg-gray-50',    fg: 'text-gray-700',   border: 'border-gray-200',   desc: 'CSV, JSON, Parquet files as datasets' },
];

const CONNECTOR_FIELDS: Record<string, Array<{ key: string; label: string; type: string; placeholder: string; required: boolean; help?: string }>> = {
  opengovern_postgres: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '5432', required: true },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'postgres', required: true },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
    { key: 'schemas', label: 'Schemas (comma-separated)', type: 'text', placeholder: 'public,analytics', required: false, help: 'Leave empty to ingest all schemas' },
  ],
  datahub_snowflake: [
    { key: 'account_id', label: 'Account Identifier', type: 'text', placeholder: 'myorg.us-east-1', required: true },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'OPENGOVERN_USER', required: true },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
    { key: 'warehouse', label: 'Warehouse', type: 'text', placeholder: 'COMPUTE_WH', required: true },
    { key: 'role', label: 'Role', type: 'text', placeholder: 'ACCOUNTADMIN', required: false },
    { key: 'database_pattern', label: 'Database Filter (regex)', type: 'text', placeholder: 'PROD.*', required: false },
  ],
  datahub_bigquery: [
    { key: 'project_ids', label: 'Project ID(s)', type: 'text', placeholder: 'my-gcp-project', required: true },
    { key: 'credentials_path', label: 'Service Account JSON Path', type: 'text', placeholder: '/secrets/bigquery-sa.json', required: false },
    { key: 'dataset_pattern', label: 'Dataset Filter (regex)', type: 'text', placeholder: 'analytics.*', required: false },
  ],
  datahub_redshift: [
    { key: 'host_port', label: 'Host:Port', type: 'text', placeholder: 'cluster.us-east-1.redshift.amazonaws.com:5439', required: true },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'awsuser', required: true },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
  ],
  datahub_dbt: [
    { key: 'manifest_path', label: 'manifest.json Path', type: 'text', placeholder: './target/manifest.json', required: true },
    { key: 'catalog_path', label: 'catalog.json Path', type: 'text', placeholder: './target/catalog.json', required: false },
    { key: 'target_platform', label: 'Target Platform', type: 'text', placeholder: 'snowflake', required: true, help: 'The data warehouse dbt runs against' },
  ],
  datahub_airflow: [
    { key: 'host', label: 'Airflow URL', type: 'text', placeholder: 'http://airflow:8080', required: true },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'admin', required: true },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
  ],
  datahub_looker: [
    { key: 'base_url', label: 'Looker URL', type: 'text', placeholder: 'https://company.looker.com', required: true },
    { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'abc123', required: true },
    { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: '••••••••', required: true },
  ],
  datahub_kafka: [
    { key: 'connection.bootstrap', label: 'Bootstrap Servers', type: 'text', placeholder: 'broker:9092', required: true },
    { key: 'schema_registry_url', label: 'Schema Registry URL', type: 'text', placeholder: 'http://schema-registry:8081', required: false },
  ],
};

const SCHEDULE_OPTIONS = [
  { value: '0 */1 * * *',  label: 'Every hour' },
  { value: '0 */6 * * *',  label: 'Every 6 hours' },
  { value: '0 */12 * * *', label: 'Every 12 hours' },
  { value: '0 0 * * *',    label: 'Daily at midnight' },
  { value: '0 6 * * *',    label: 'Daily at 6am' },
  { value: '0 0 * * 1',    label: 'Weekly on Monday' },
  { value: 'manual',        label: 'Manual only' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  const s: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 size={11} />, label: 'Success',  cls: 'bg-green-50 text-green-700 border-green-200' },
    running:   { icon: <Loader2 size={11} className="animate-spin" />, label: 'Running', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    failed:    { icon: <XCircle size={11} />, label: 'Failed',   cls: 'bg-red-50 text-red-700 border-red-200' },
    queued:    { icon: <Clock size={11} />, label: 'Queued',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    cancelled: { icon: <X size={11} />, label: 'Cancelled', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  const v = s[status] || s.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  );
}

function SourceStatusDot({ status }: { status?: string }) {
  if (!status || status === 'active') return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
  if (status === 'running') return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />;
  if (status === 'failed') return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />;
}

function StatCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        {trend === 'up' && <TrendingUp size={11} className="text-green-500 ml-auto" />}
        {trend === 'down' && <TrendingDown size={11} className="text-red-500 ml-auto" />}
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── SQL source categories — used to show/hide SQL-specific filter fields ──────

const SQL_CATEGORIES = new Set(['Database', 'Data Warehouse']);
const WAREHOUSE_CATEGORIES = new Set(['Data Warehouse']);
const BI_CATEGORIES = new Set(['BI Tool']);

function isSqlConnector(cat: string) { return SQL_CATEGORIES.has(cat); }
function isWarehouseConnector(cat: string) { return WAREHOUSE_CATEGORIES.has(cat); }
function isBIConnector(cat: string) { return BI_CATEGORIES.has(cat); }
function isDbtConnector(id: string) { return id === 'datahub_dbt'; }

// ─── Toggle Switch component ──────────────────────────────────────────────────

function ToggleSwitch({ enabled, onToggle, label, helpText, warning }: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  helpText?: string;
  warning?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {helpText && <p className="text-xs text-gray-500 mt-0.5">{helpText}</p>}
        {warning && enabled && (
          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
            <AlertTriangle size={11} /> {warning}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
        aria-checked={enabled}
        role="switch"
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { n: 1, label: 'Connector' },
  { n: 2, label: 'Connection' },
  { n: 3, label: 'Filters' },
  { n: 4, label: 'Schedule' },
  { n: 5, label: 'Review' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 px-6 py-4 border-b border-gray-100">
      {WIZARD_STEPS.map((step, idx) => (
        <React.Fragment key={step.n}>
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                current > step.n
                  ? 'bg-blue-600 text-white'
                  : current === step.n
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {current > step.n ? <Check size={12} /> : step.n}
            </div>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                current === step.n ? 'text-blue-700' : current > step.n ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < WIZARD_STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 ${current > step.n ? 'bg-blue-300' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Compute next run time string from cron expression ────────────────────────

function nextRunLabel(schedule: string): string {
  if (schedule === 'manual') return '';
  const now = new Date();
  // Map our fixed cron patterns to readable next-run descriptions
  const map: Record<string, string> = {
    '0 */1 * * *':  `in ~${60 - now.getMinutes()} minutes`,
    '0 */6 * * *':  'in the next 6-hour window',
    '0 */12 * * *': 'in the next 12-hour window',
    '0 0 * * *':    `tomorrow at 00:00 UTC`,
    '0 6 * * *':    `${now.getHours() < 6 ? 'today' : 'tomorrow'} at 06:00 UTC`,
    '0 0 * * 1':    `next Monday at 00:00 UTC`,
  };
  return map[schedule] || 'at the next scheduled interval';
}

// ─── Add Connector Wizard (5-step) ────────────────────────────────────────────

function AddConnectorModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  // Current wizard step: 1–5
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<typeof CONNECTORS[0] | null>(null);

  // Step 2
  const [name, setName] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testError, setTestError] = useState('');
  const [skipTest, setSkipTest] = useState(false);

  // Step 3 — filters
  const [schemaInclude, setSchemaInclude] = useState('');
  const [schemaExclude, setSchemaExclude] = useState('^information_schema$\n^pg_catalog$');
  const [tableInclude, setTableInclude] = useState('');
  const [tableExclude, setTableExclude] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dashboardFilter, setDashboardFilter] = useState('');
  const [extractLineage, setExtractLineage] = useState(true);
  const [extractColumnLineage, setExtractColumnLineage] = useState(true);
  const [extractUsage, setExtractUsage] = useState(true);
  const [extractProfiles, setExtractProfiles] = useState(false);

  // Step 4 — schedule
  const [schedule, setSchedule] = useState('0 */6 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [alertOnFailure, setAlertOnFailure] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [retries, setRetries] = useState(1);

  // Global
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const categories = [...new Set(CONNECTORS.map(c => c.cat))];
  const filtered = CONNECTORS.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
    const matchCat = !selectedCat || c.cat === selectedCat;
    return matchSearch && matchCat;
  });

  const fields = selected
    ? (CONNECTOR_FIELDS[selected.id] || [
        { key: 'host', label: 'Host / URL', type: 'text', placeholder: 'hostname or URL', required: true },
        { key: 'username', label: 'Username', type: 'text', placeholder: 'username', required: true },
        { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: false },
      ])
    : [];

  // ── Derived filter preview text ───────────────────────────────────────────

  const filterPreview = useCallback(() => {
    if (!selected) return '';
    const parts: string[] = [];
    if (isSqlConnector(selected.cat)) {
      const inc = schemaInclude.trim().split('\n').filter(Boolean);
      const exc = schemaExclude.trim().split('\n').filter(Boolean);
      const tinc = tableInclude.trim().split('\n').filter(Boolean);
      const texc = tableExclude.trim().split('\n').filter(Boolean);
      if (inc.length) parts.push(`schema IN [${inc.join(', ')}]`);
      if (tinc.length) parts.push(`table MATCHES [${tinc.join(', ')}]`);
      if (exc.length || texc.length) {
        const excParts = [...exc.map(e => `schema:${e}`), ...texc.map(t => `table:${t}`)];
        parts.push(`EXCLUDING [${excParts.join(', ')}]`);
      }
    }
    return parts.length ? `Will ingest: ${parts.join(' AND ')}` : 'Will ingest all available assets.';
  }, [selected, schemaInclude, schemaExclude, tableInclude, tableExclude]);

  // ── Test connection ───────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!selected) return;
    setTestState('testing');
    setTestError('');
    const start = Date.now();
    try {
      await api.sources.testConnection({ connector_type: selected.id, config: form });
      setTestLatency(Date.now() - start);
      setTestState('success');
    } catch (e: unknown) {
      setTestState('fail');
      setTestError(
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || 'Connection failed. Check your credentials and network access.'
      );
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async (triggerRun: boolean) => {
    if (!selected || !name.trim()) { setSaveError('Connection name is required'); return; }
    setSaving(true); setSaveError('');
    try {
      const config: Record<string, unknown> = { ...form };
      const filters: Record<string, unknown> = {};

      if (isSqlConnector(selected.cat)) {
        const parseLines = (s: string) => s.trim().split('\n').filter(Boolean);
        if (schemaInclude.trim()) filters.schema_include_patterns = parseLines(schemaInclude);
        if (schemaExclude.trim()) filters.schema_exclude_patterns = parseLines(schemaExclude);
        if (tableInclude.trim()) filters.table_include_patterns = parseLines(tableInclude);
        if (tableExclude.trim()) filters.table_exclude_patterns = parseLines(tableExclude);
      }
      if (isDbtConnector(selected.id)) {
        if (nodeFilter.trim()) filters.node_name_filter = nodeFilter.trim();
        if (tagFilter.trim()) filters.tag_filter = tagFilter.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (isBIConnector(selected.cat)) {
        if (projectFilter.trim()) filters.project_filter = projectFilter.trim();
        if (dashboardFilter.trim()) filters.dashboard_include_patterns = dashboardFilter.trim();
      }

      const options = {
        extract_lineage: extractLineage,
        extract_column_lineage: isSqlConnector(selected.cat) && extractColumnLineage,
        extract_usage_statistics: isWarehouseConnector(selected.cat) && extractUsage,
        extract_data_profiles: extractProfiles,
      };

      const result = await api.sources.create({
        name: name.trim(),
        connector_type: selected.id,
        config,
        filters,
        options,
        schedule: schedule !== 'manual' ? schedule : null,
        timezone,
        alert_on_failure: alertOnFailure,
        alert_email: alertOnFailure ? alertEmail : null,
        retry_count: retries,
      });

      if (triggerRun && result.data?.data?.id) {
        await api.sources.triggerRun(result.data.data.id);
      }

      onSuccess();
      onClose();
    } catch (e: unknown) {
      setSaveError(
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || 'Failed to save. Check your configuration and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const canAdvanceStep2 = name.trim().length > 0 && (testState === 'success' || skipTest);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Modal header with close button */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-3">
            {selected && step > 1 && (
              <div className={`w-8 h-8 rounded-lg ${selected.bg} border ${selected.border} flex items-center justify-center shrink-0`}>
                <selected.Icon size={16} className={selected.fg} />
              </div>
            )}
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 1 ? 'Add Data Source' : step === 2 ? `Configure ${selected?.name}` : step === 3 ? 'Ingestion Filters' : step === 4 ? 'Schedule & Alerts' : 'Review & Save'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 1 ? `${CONNECTORS.length} connectors · powered by DataHub` : selected?.desc}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* ── STEP 1: Select Connector ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-1 overflow-hidden">
            {/* Category sidebar */}
            <div className="w-44 border-r border-gray-100 py-3 px-3 space-y-0.5 shrink-0 overflow-y-auto">
              <button
                onClick={() => setSelectedCat(null)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${!selectedCat ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                All ({CONNECTORS.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat === selectedCat ? null : cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCat === cat ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {cat} ({CONNECTORS.filter(c => c.cat === cat).length})
                </button>
              ))}
            </div>

            {/* Connector grid */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search connectors..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <Search size={20} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">No connectors match &quot;{search}&quot;</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {filtered.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelected(c); setName(`Production ${c.name}`); setStep(2); }}
                        className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm text-left transition-all group"
                      >
                        <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
                          <c.Icon size={15} className={c.fg} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{c.cat}</p>
                        </div>
                        <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-400 shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Connection Details ───────────────────────────────────── */}
        {step === 2 && selected && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Connection name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Connection Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`e.g., Production ${selected.name}`}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">A descriptive name to identify this connection in OpenGovern</p>
            </div>

            {/* Connector-specific fields */}
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={f.type}
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {f.help && <p className="text-xs text-gray-400 mt-1">{f.help}</p>}
              </div>
            ))}

            {/* Pre-installed notice */}
            <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <CheckCircle2 size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                <span className="font-semibold">{selected.name} connector is pre-installed.</span>{' '}
                DataHub&apos;s production-grade ingestion will run in the worker container.
              </p>
            </div>

            {/* Test connection */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Test Connection</p>
                  <p className="text-xs text-gray-500 mt-0.5">Verify credentials before saving</p>
                </div>
                <button
                  onClick={handleTest}
                  disabled={testState === 'testing'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {testState === 'testing' ? (
                    <><Loader2 size={14} className="animate-spin text-blue-600" /> Testing…</>
                  ) : (
                    'Test Connection'
                  )}
                </button>
              </div>

              {testState === 'success' && (
                <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 font-medium">
                    Connection successful · latency: {testLatency}ms
                  </p>
                </div>
              )}
              {testState === 'fail' && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{testError}</p>
                </div>
              )}

              {testState !== 'success' && (
                <button
                  onClick={() => setSkipTest(s => !s)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 block"
                >
                  {skipTest ? 'Require test to save' : 'Skip test (advanced users)'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Filters ──────────────────────────────────────────────── */}
        {step === 3 && selected && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* SQL-specific filters */}
            {isSqlConnector(selected.cat) && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Schema Filters</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Schema include patterns</label>
                      <textarea
                        value={schemaInclude}
                        onChange={e => setSchemaInclude(e.target.value)}
                        placeholder={`^analytics$\n^public$`}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">One regex per line. Leave empty to include all schemas.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Schema exclude patterns</label>
                      <textarea
                        value={schemaExclude}
                        onChange={e => setSchemaExclude(e.target.value)}
                        placeholder={`^information_schema$`}
                        rows={2}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Table Filters</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Table include patterns</label>
                      <textarea
                        value={tableInclude}
                        onChange={e => setTableInclude(e.target.value)}
                        placeholder={`^fact_.*\n^dim_.*`}
                        rows={2}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">Leave empty to include all tables.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Table exclude patterns</label>
                      <textarea
                        value={tableExclude}
                        onChange={e => setTableExclude(e.target.value)}
                        placeholder={`^_tmp_.*`}
                        rows={2}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* dbt-specific filters */}
            {isDbtConnector(selected.id) && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">dbt Filters</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Node name filter (regex)</label>
                  <input
                    type="text"
                    value={nodeFilter}
                    onChange={e => setNodeFilter(e.target.value)}
                    placeholder="^model\.(.*)"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tag filter (comma-separated)</label>
                  <input
                    type="text"
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                    placeholder="finance, analytics, core"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Only ingest dbt nodes tagged with any of these tags</p>
                </div>
              </div>
            )}

            {/* BI-specific filters */}
            {isBIConnector(selected.cat) && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">BI Tool Filters</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Project / workspace filter (regex)</label>
                  <input
                    type="text"
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    placeholder="^Finance.*"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Dashboard include patterns (regex)</label>
                  <input
                    type="text"
                    value={dashboardFilter}
                    onChange={e => setDashboardFilter(e.target.value)}
                    placeholder="^KPI.*"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Common options */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Extraction Options</p>
              <ToggleSwitch
                enabled={extractLineage}
                onToggle={() => setExtractLineage(v => !v)}
                label="Extract lineage"
                helpText="Ingest upstream/downstream lineage between assets"
              />
              {isSqlConnector(selected.cat) && (
                <ToggleSwitch
                  enabled={extractColumnLineage}
                  onToggle={() => setExtractColumnLineage(v => !v)}
                  label="Extract column-level lineage"
                  helpText="Parse SQL to trace lineage at the column level"
                />
              )}
              {isWarehouseConnector(selected.cat) && (
                <ToggleSwitch
                  enabled={extractUsage}
                  onToggle={() => setExtractUsage(v => !v)}
                  label="Extract usage statistics"
                  helpText="Collect query counts and access frequency from warehouse logs"
                />
              )}
              <ToggleSwitch
                enabled={extractProfiles}
                onToggle={() => setExtractProfiles(v => !v)}
                label="Extract data profiles"
                helpText="Run row counts, null %, distinct counts on each ingested table"
                warning="Increases ingestion time significantly on large datasets"
              />
            </div>

            {/* Filter preview */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
                <Filter size={12} /> Filter Preview
              </p>
              <p className="text-xs text-gray-600 font-mono">{filterPreview()}</p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Schedule ─────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Ingestion Schedule</label>
              <div className="grid grid-cols-2 gap-2">
                {SCHEDULE_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setSchedule(o.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg border text-left transition-colors ${
                      schedule === o.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Clock size={14} className={schedule === o.value ? 'text-blue-600' : 'text-gray-400'} />
                    {o.label}
                  </button>
                ))}
              </div>
              {schedule !== 'manual' && (
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                  <Calendar size={11} /> Next run: {nextRunLabel(schedule)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver',
                  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore',
                  'Asia/Kolkata', 'Australia/Sydney'].map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-4">
              <ToggleSwitch
                enabled={alertOnFailure}
                onToggle={() => setAlertOnFailure(v => !v)}
                label="Send alerts on failure"
                helpText="Receive an email when ingestion fails or produces errors"
              />
              {alertOnFailure && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Alert email</label>
                  <input
                    type="email"
                    value={alertEmail}
                    onChange={e => setAlertEmail(e.target.value)}
                    placeholder="team@company.com"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Retry on failure</label>
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setRetries(n)}
                    className={`w-12 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      retries === n
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-1">retries</span>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 5: Review & Save ────────────────────────────────────────── */}
        {step === 5 && selected && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Summary card */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Connector header */}
              <div className={`flex items-center gap-3 px-4 py-3 ${selected.bg} border-b border-gray-200`}>
                <div className={`w-9 h-9 rounded-lg bg-white border ${selected.border} flex items-center justify-center`}>
                  <selected.Icon size={18} className={selected.fg} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{name}</p>
                  <p className="text-xs text-gray-500">{selected.name} · {selected.cat}</p>
                </div>
              </div>

              {/* Summary rows */}
              <div className="divide-y divide-gray-100">
                {/* Connection details */}
                <div className="px-4 py-3 grid grid-cols-3 gap-4 text-xs">
                  <span className="text-gray-500 font-medium">Connection</span>
                  <span className="col-span-2 text-gray-900 font-mono truncate">
                    {form.host || form.account_id || form.project_ids || form.host_port || form.base_url || form.manifest_path || '—'}
                    {form.password ? ' · password ••••••' : ''}
                  </span>
                </div>

                {/* Filters */}
                <div className="px-4 py-3 grid grid-cols-3 gap-4 text-xs">
                  <span className="text-gray-500 font-medium">Filters</span>
                  <span className="col-span-2 text-gray-900">
                    {isSqlConnector(selected.cat) ? (
                      <>
                        {schemaInclude.trim()
                          ? `Schemas: ${schemaInclude.trim().split('\n').filter(Boolean).join(', ')}`
                          : 'All schemas'}
                        {schemaExclude.trim()
                          ? ` · Excluding: ${schemaExclude.trim().split('\n').filter(Boolean).join(', ')}`
                          : ''}
                        {tableInclude.trim()
                          ? ` · Tables: ${tableInclude.trim().split('\n').filter(Boolean).join(', ')}`
                          : ''}
                      </>
                    ) : 'Default filters'}
                  </span>
                </div>

                {/* Schedule */}
                <div className="px-4 py-3 grid grid-cols-3 gap-4 text-xs">
                  <span className="text-gray-500 font-medium">Schedule</span>
                  <span className="col-span-2 text-gray-900">
                    {SCHEDULE_OPTIONS.find(o => o.value === schedule)?.label || 'Manual'}
                    {schedule !== 'manual' && ` · ${timezone}`}
                    {retries > 0 && ` · ${retries} retr${retries === 1 ? 'y' : 'ies'} on failure`}
                  </span>
                </div>

                {/* Options */}
                <div className="px-4 py-3 grid grid-cols-3 gap-4 text-xs">
                  <span className="text-gray-500 font-medium">Options</span>
                  <div className="col-span-2 flex flex-wrap gap-1.5">
                    {extractLineage && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                        <Check size={10} /> Lineage
                      </span>
                    )}
                    {isSqlConnector(selected.cat) && extractColumnLineage && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                        <Check size={10} /> Column lineage
                      </span>
                    )}
                    {isWarehouseConnector(selected.cat) && extractUsage && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                        <Check size={10} /> Usage stats
                      </span>
                    )}
                    {extractProfiles && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200">
                        <Check size={10} /> Data profiles
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{saveError}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {saving ? 'Saving…' : 'Save & Run Now'}
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Save only
              </button>
            </div>
          </div>
        )}

        {/* ── Footer navigation ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {/* Step 1 footer — no forward button, clicking a card advances */}
          {step === 1 && (
            <p className="text-xs text-gray-400">Select a connector to continue</p>
          )}

          {/* Step 2 forward */}
          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              disabled={!canAdvanceStep2}
              title={!canAdvanceStep2 ? 'Test connection or skip test first' : ''}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next: Filters <ArrowRight size={14} />
            </button>
          )}

          {/* Step 3 forward */}
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next: Schedule <ArrowRight size={14} />
            </button>
          )}

          {/* Step 4 forward */}
          {step === 4 && (
            <button
              onClick={() => setStep(5)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Review <ArrowRight size={14} />
            </button>
          )}

          {/* Step 5 — save buttons are inside the content, no extra footer button */}
          {step === 5 && (
            <p className="text-xs text-gray-400">Review your configuration above</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Run Detail Panel ─────────────────────────────────────────────────────────

function RunDetailPanel({ run, onClose }: { run: any; onClose: () => void }) {
  const duration = run.started_at && run.completed_at
    ? differenceInSeconds(new Date(run.completed_at), new Date(run.started_at))
    : null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-stretch justify-end z-50" onClick={onClose}>
      <div className="bg-white w-[480px] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Run Details</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{run.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & timing */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Status</span>
              <RunStatusBadge status={run.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Triggered by</span>
              <span className="text-xs font-medium text-gray-900 capitalize">{run.triggered_by || 'manual'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Started</span>
              <span className="text-xs text-gray-900">
                {run.started_at ? format(new Date(run.started_at), 'MMM d, yyyy HH:mm:ss') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Completed</span>
              <span className="text-xs text-gray-900">
                {run.completed_at ? format(new Date(run.completed_at), 'MMM d, yyyy HH:mm:ss') : '—'}
              </span>
            </div>
            {duration !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Duration</span>
                <span className="text-xs font-medium text-gray-900">
                  {duration < 60 ? `${duration}s` : `${Math.floor(duration/60)}m ${duration%60}s`}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          {run.status === 'completed' && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-3">Ingestion Stats</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Discovered', value: run.assets_discovered ?? 0, icon: <Eye size={12} />, color: 'text-blue-600' },
                  { label: 'Created',    value: run.assets_created ?? 0,    icon: <Plus size={12} />, color: 'text-green-600' },
                  { label: 'Updated',    value: run.assets_updated ?? 0,    icon: <RefreshCw size={12} />, color: 'text-amber-600' },
                  { label: 'Failed',     value: run.assets_failed ?? 0,     icon: <XCircle size={12} />, color: 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className={`flex items-center justify-center gap-1 mb-1 ${s.color}`}>
                      {s.icon}
                      <span className="text-xs font-medium">{s.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{s.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error log */}
          {run.error_message && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-red-500" /> Error Log
              </p>
              <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                {run.error_message}
              </pre>
            </div>
          )}

          {/* Run ID for reference */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Run Reference</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Run ID</span>
                <span className="text-xs font-mono text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded">{run.id}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Source Card with Run History ─────────────────────────────────────────────

function SourceCard({ source, onDelete, onTrigger }: {
  source: any; onDelete: () => void; onTrigger: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const meta = CONNECTORS.find(c => c.id === source.connector_type) || {
    name: source.connector_type, Icon: Database, bg: 'bg-gray-50', fg: 'text-gray-600', border: 'border-gray-200', cat: 'Unknown'
  };

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['runs', source.id],
    queryFn: () => api.sources.getRuns(source.id).then(r => r.data?.data || []),
    enabled: expanded,
    refetchInterval: expanded ? 5000 : false,
  });
  const runs: any[] = runsData || [];
  const latestRun = runs[0];

  const totalAssets = runs.filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (r.assets_discovered || 0), 0);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
        {/* Main row */}
        <div className="flex items-center gap-4 p-4">
          <div className={`w-10 h-10 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0`}>
            <meta.Icon size={18} className={meta.fg} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <SourceStatusDot status={source.last_run_status} />
              <h3 className="text-sm font-semibold text-gray-900 truncate">{source.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-500">{meta.name}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">
                {source.schedule
                  ? SCHEDULE_OPTIONS.find(s => s.value === source.schedule)?.label || source.schedule
                  : 'Manual'}
              </span>
              {source.last_run_at && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    Last run {formatDistanceToNow(new Date(source.last_run_at), { addSuffix: true })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Stats pills */}
          {totalAssets > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                <Package size={10} /> {totalAssets.toLocaleString()} assets
              </span>
            </div>
          )}

          {latestRun && <RunStatusBadge status={latestRun.status} />}

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={onTrigger}
              title="Run now"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Play size={12} /> Run
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              title="View runs"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Expanded run history */}
        {expanded && (
          <div className="border-t border-gray-100">
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Activity size={12} /> Run History
              </h4>
              {runsLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </div>

            {!runsLoading && runs.length === 0 && (
              <div className="px-4 py-6 text-center">
                <Activity size={24} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-500">No runs yet. Click "Run" to start ingestion.</p>
              </div>
            )}

            {runs.length > 0 && (
              <div className="divide-y divide-gray-100">
                {/* Header */}
                <div className="px-4 py-2 grid grid-cols-12 text-xs font-medium text-gray-400">
                  <span className="col-span-1">Status</span>
                  <span className="col-span-3">Run ID</span>
                  <span className="col-span-2">Started</span>
                  <span className="col-span-1 text-center">Found</span>
                  <span className="col-span-1 text-center">Added</span>
                  <span className="col-span-1 text-center">Updated</span>
                  <span className="col-span-1 text-center">Failed</span>
                  <span className="col-span-2 text-right">Duration</span>
                </div>
                {runs.map((run: any) => {
                  const dur = run.started_at && run.completed_at
                    ? differenceInSeconds(new Date(run.completed_at), new Date(run.started_at))
                    : null;
                  return (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className="w-full px-4 py-2.5 grid grid-cols-12 text-xs hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="col-span-1 flex items-center">
                        <RunStatusBadge status={run.status} />
                      </span>
                      <span className="col-span-3 font-mono text-gray-500 truncate pr-2">{run.id.split('-')[0]}…</span>
                      <span className="col-span-2 text-gray-500">
                        {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                      </span>
                      <span className="col-span-1 text-center font-medium text-blue-700">{run.assets_discovered ?? '—'}</span>
                      <span className="col-span-1 text-center font-medium text-green-700">{run.assets_created ?? '—'}</span>
                      <span className="col-span-1 text-center font-medium text-amber-700">{run.assets_updated ?? '—'}</span>
                      <span className="col-span-1 text-center font-medium text-red-700">{run.assets_failed ?? '—'}</span>
                      <span className="col-span-2 text-right text-gray-500">
                        {dur !== null ? (dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRun && <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list().then(r => r.data?.data || []),
    refetchInterval: 15000,
  });
  const sources: any[] = data || [];

  const trigger = useMutation({
    mutationFn: (id: string) => api.sources.triggerRun(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const deleteSrc = useMutation({
    mutationFn: (id: string) => api.sources.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  // Aggregate stats across all sources
  const activeSources = sources.filter(s => s.is_active).length;
  const failedSources = sources.filter(s => s.last_run_status === 'failed').length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {CONNECTORS.length} connectors available · powered by DataHub's acryl-datahub
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={15} /> Add Connector
        </button>
      </div>

      {/* Stats row */}
      {sources.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<Database size={14} />} label="Total Connectors" value={sources.length} />
          <StatCard icon={<CheckCircle2 size={14} />} label="Active" value={activeSources} trend="up" />
          <StatCard icon={<XCircle size={14} />} label="Failed Last Run" value={failedSources} trend={failedSources > 0 ? 'down' : null} />
          <StatCard icon={<Package size={14} />} label="Connector Types" value={new Set(sources.map(s => s.connector_type)).size} />
        </div>
      )}

      {/* Connector type browser */}
      <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors select-none">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Available Connectors</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{CONNECTORS.length}</span>
          </div>
          <span className="text-xs text-gray-400">Click to expand</span>
        </summary>
        <div className="border-t border-gray-100 p-5">
          {[...new Set(CONNECTORS.map(c => c.cat))].map(cat => (
            <div key={cat} className="mb-5 last:mb-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat}</p>
              <div className="flex flex-wrap gap-2">
                {CONNECTORS.filter(c => c.cat === cat).map(c => (
                  <button
                    key={c.id}
                    onClick={() => setShowAdd(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${c.border} ${c.bg} ${c.fg} hover:opacity-80 transition-opacity`}
                  >
                    <c.Icon size={11} /> {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* Configured connectors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Configured Connectors</h2>
          {sources.length > 0 && (
            <button
              onClick={() => sources.forEach(s => trigger.mutate(s.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <Play size={12} /> Run all
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 bg-white border border-gray-200 rounded-xl">
            <Loader2 size={18} className="animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Loading connectors...</span>
          </div>
        )}

        {!isLoading && sources.length === 0 && (
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-14 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Database size={24} className="text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1.5">No connectors configured yet</h3>
            <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
              Add a connector to start ingesting metadata from Snowflake, BigQuery, dbt, Airflow, and 20+ more.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} /> Add your first connector
            </button>
          </div>
        )}

        <div className="space-y-3">
          {sources.map((s: any) => (
            <SourceCard
              key={s.id}
              source={s}
              onDelete={() => { if (confirm(`Delete "${s.name}"?`)) deleteSrc.mutate(s.id); }}
              onTrigger={() => trigger.mutate(s.id)}
            />
          ))}
        </div>
      </div>

      {showAdd && (
        <AddConnectorModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['sources'] })}
        />
      )}
    </div>
  );
}
