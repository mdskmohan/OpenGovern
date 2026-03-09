# Solix EDG - Enterprise Data Governance Platform

A modern, AI-first enterprise data governance platform built on OpenMetadata and Open Policy Agent.

## Overview

Solix EDG provides a complete governance and metadata management system for enterprise data and analytics assets. The platform integrates with OpenMetadata as the metadata engine and Open Policy Agent as the governance policy engine, while providing a modern AI-first user experience.

## Architecture

The platform follows a modular microservices architecture with the following layers:

- **Experience Layer**: Modern web UI built with Next.js, React, TypeScript, and TailwindCSS
- **Application Layer**: Backend services for metadata, policies, workflows, alerts, integrations, AI search, and reverse metadata sync
- **Integration Layer**: External systems including OpenMetadata, Open Policy Agent, vector database, and data sources
- **Data Layer**: PostgreSQL for application data, Redis for caching, and vector database for semantic search

## Features

### Core Services
- **Metadata Service**: Interact with OpenMetadata for asset management
- **Policy Service**: Governance policies using Open Policy Agent with Rego
- **Workflow Service**: Manage governance workflows (certification, approval, etc.)
- **Alerts Service**: Platform alerts for violations, failures, and approvals
- **Integration Service**: Data source connectors and ingestion management
- **AI Search Service**: Semantic search and conversational discovery
- **Reverse Metadata Sync Service**: Push metadata changes back to source systems

### Frontend UI
- Modern dashboard with governance insights and metrics
- Metadata catalog browser with advanced filtering
- Interactive lineage visualization
- Data quality monitoring dashboard
- Policy management interface with Rego editor
- Workflow management for approvals and certifications
- Integration configuration UI
- User and role management
- Documentation hub with AI chatbot

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL (for local development)

### Using Docker Compose

1. Clone the repository
2. Navigate to the infrastructure directory:
   ```bash
   cd solix-edg/infrastructure/docker
   ```
3. Start all services:
   ```bash
   docker-compose up -d
   ```
4. Access the application:
   - Frontend: http://localhost:3000
   - OpenMetadata: http://localhost:8585
   - API Gateway: http://localhost:8000

### Local Development

1. Start external dependencies (OpenMetadata, PostgreSQL, Redis, etc.)
2. Install dependencies for each service:
   ```bash
   # Frontend
   cd solix-edg/frontend
   npm install
   npm run dev

   # Backend services
   cd solix-edg/backend/metadata-service
   npm install
   npm run dev
   ```
3. Configure environment variables in `.env` files

## API Documentation

### Metadata Service (Port 3001)
- `GET /api/catalog/assets` - List all assets
- `GET /api/catalog/assets/{id}` - Get asset details
- `GET /api/lineage/{assetId}` - Get asset lineage
- `POST /api/catalog/update-description` - Update asset description

### Policy Service (Port 3002)
- `GET /api/policies` - List policies
- `POST /api/policies` - Create policy
- `POST /api/policies/evaluate` - Evaluate policy

### Other Services
Each service exposes REST APIs on their respective ports (3001-3007).

## Configuration

### Environment Variables
- `OPENMETADATA_URL`: OpenMetadata API URL
- `OPA_URL`: Open Policy Agent URL
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `VECTOR_DB_URL`: Vector database URL

### Database Schema
The PostgreSQL schema includes tables for users, roles, policies, workflows, alerts, integrations, and metadata cache.

## Deployment

### Kubernetes
Kubernetes manifests are available in `infrastructure/kubernetes/`.

### CI/CD
GitHub Actions workflows are configured in `infrastructure/ci-cd/`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.