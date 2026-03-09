# OpenGovern - Enterprise Data Governance Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![OpenMetadata](https://img.shields.io/badge/OpenMetadata-FF6B35?logo=apache&logoColor=white)](https://openmetadata.org/)
[![Open Policy Agent](https://img.shields.io/badge/Open%20Policy%20Agent-7B2D26?logo=opa&logoColor=white)](https://www.openpolicyagent.org/)

> A modern, AI-first enterprise data governance platform built on OpenMetadata and Open Policy Agent.

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

## 🎯 Overview

**OpenGovern** is a comprehensive enterprise data governance platform that provides:

- **Complete metadata management** for all data assets
- **Automated governance policies** with real-time enforcement
- **Interactive data lineage** visualization
- **AI-powered search and discovery**
- **Modern, intuitive user interface** inspired by OpenAI and Notion
- **Extensible integration framework** for 50+ data sources

Built on top of industry-leading open source technologies, OpenGovern enables organizations to achieve data governance excellence with minimal setup and maximum flexibility.

### 🎯 Problem Statement

Modern enterprises struggle with:
- **Data discovery**: Finding and understanding available data assets
- **Data governance**: Ensuring compliance and security policies
- **Data quality**: Maintaining high-quality, trustworthy data
- **Data collaboration**: Enabling teams to work effectively with data
- **Data lineage**: Understanding data flow and impact analysis

### 💡 Solution

OpenGovern provides a unified platform that addresses all these challenges through:
- Centralized metadata catalog
- Automated policy enforcement
- Real-time data quality monitoring
- Collaborative governance workflows
- AI-assisted data discovery

## ✨ Key Features

### 🔍 Metadata Management
- **Comprehensive catalog** of all data assets (tables, dashboards, pipelines, ML models)
- **Rich metadata** including descriptions, tags, ownership, and usage statistics
- **Automated ingestion** from 50+ data sources
- **Advanced search** with filters and facets

### 🛡️ Governance & Policies
- **Policy-as-Code** using Open Policy Agent (OPA) and Rego
- **Real-time policy evaluation** and enforcement
- **Automated compliance monitoring**
- **Governance workflows** for approvals and certifications

### 📊 Data Quality & Lineage
- **Automated data quality checks** and monitoring
- **Interactive lineage graphs** with column-level tracking
- **Impact analysis** for change management
- **Quality dashboards** with historical trends

### 🤖 AI-Powered Features
- **Semantic search** across all metadata
- **Conversational AI assistant** for data discovery
- **Intelligent recommendations** for data governance
- **Automated tagging and classification**

### 🎨 Modern User Experience
- **Clean, intuitive interface** inspired by OpenAI and Notion
- **Responsive design** for all devices
- **Dark/light mode support**
- **Customizable dashboards** and views

## 🏗️ Architecture

### System Architecture

```mermaid
graph TB
    subgraph "Experience Layer"
        UI[Modern Web UI<br/>Next.js + React + TypeScript + TailwindCSS]
    end

    subgraph "Application Layer"
        MS[Metadata Service<br/>Asset Management]
        PS[Policy Service<br/>Governance Engine]
        WS[Workflow Service<br/>Approval Workflows]
        AS[Alerts Service<br/>Notifications]
        IS[Integration Service<br/>Data Connectors]
        AIS[AI Search Service<br/>Semantic Search]
        RMS[Reverse Metadata Sync<br/>Bidirectional Sync]
    end

    subgraph "Integration Layer"
        OM[OpenMetadata<br/>Metadata Engine]
        OPA[Open Policy Agent<br/>Policy Engine]
        VDB[Vector Database<br/>AI Search]
        EDS[External Data Sources<br/>50+ Connectors]
    end

    subgraph "Data Layer"
        PG[PostgreSQL<br/>Application Data]
        R[Redis<br/>Caching & Sessions]
        VDB2[Vector Database<br/>Embeddings]
    end

    UI --> MS
    UI --> PS
    UI --> WS
    UI --> AS
    UI --> IS
    UI --> AIS
    UI --> RMS

    MS --> OM
    PS --> OPA
    AIS --> VDB
    RMS --> EDS

    MS --> PG
    PS --> PG
    WS --> PG
    AS --> PG
    IS --> PG
    AIS --> VDB2
    RMS --> PG

    MS --> R
    PS --> R
    WS --> R
    AS --> R
    IS --> R
    AIS --> R
    RMS --> R
```

### Data Flow Architecture

```mermaid
graph LR
    A[Data Sources] --> B[Ingestion Layer]
    B --> C[OpenMetadata]
    C --> D[OpenGovern Services]
    D --> E[PostgreSQL]
    D --> F[Redis Cache]
    D --> G[Vector DB]
    H[Users] --> I[Web UI]
    I --> D
    D --> J[Open Policy Agent]
    J --> K[Policy Decisions]
```

### Service Architecture

```mermaid
graph TD
    A[API Gateway] --> B[Metadata Service]
    A --> C[Policy Service]
    A --> D[Workflow Service]
    A --> E[Alerts Service]
    A --> F[Integration Service]
    A --> G[AI Search Service]
    A --> H[Reverse Sync Service]

    B --> I[OpenMetadata API]
    C --> J[OPA API]
    G --> K[Vector Database]

    B --> L[PostgreSQL]
    C --> L
    D --> L
    E --> L
    F --> L
    H --> L

    B --> M[Redis]
    C --> M
    D --> M
    E --> M
    F --> M
    G --> M
    H --> M
```

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Hooks
- **UI Components**: Custom components with Radix UI primitives

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **API**: RESTful APIs with OpenAPI 3.0
- **Authentication**: JWT tokens

### Data & Storage
- **Primary Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Vector Database**: Qdrant (for AI search)
- **File Storage**: Local filesystem (configurable)

### External Services
- **Metadata Engine**: OpenMetadata
- **Policy Engine**: Open Policy Agent (OPA)
- **Container Runtime**: Docker
- **Orchestration**: Kubernetes (optional)

### Development Tools
- **Version Control**: Git
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier
- **Testing**: Jest, React Testing Library
- **Documentation**: OpenAPI, Markdown

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0 or later
- **Docker** and Docker Compose
- **Git** for version control
- **PostgreSQL** (optional, can use Docker)

### One-Click Setup

```bash
# Clone the repository
git clone https://github.com/mdskmohan/EDG.git
cd EDG/solix-edg

# Start all services with Docker
cd infrastructure/docker
docker-compose up -d

# Access the application
open http://localhost:3000
```

### Manual Setup

```bash
# 1. Install dependencies
cd frontend
npm install

cd ../backend/metadata-service
npm install

# 2. Start external services
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15
docker run -d -p 6379:6379 redis:7-alpine

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Start the application
cd frontend
npm run dev

# 5. Start backend services
cd ../backend/metadata-service
npm run dev
```

## 📦 Installation

### Option 1: Docker (Recommended)

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Option 2: Local Development

```bash
# Frontend
cd solix-edg/frontend
npm install
npm run dev

# Backend Services (run each in separate terminal)
cd solix-edg/backend/metadata-service
npm install
npm run dev

cd ../policy-service
npm install
npm run dev

# And so on for other services...
```

### Option 3: Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f infrastructure/kubernetes/

# Check deployment status
kubectl get pods
kubectl get services
```

## ⚙️ Configuration

### Environment Variables

Create `.env` files in each service directory:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/solix_edg
REDIS_URL=redis://localhost:6379

# External Services
OPENMETADATA_URL=http://localhost:8585/api/v1
OPA_URL=http://localhost:8181
VECTOR_DB_URL=http://localhost:6333

# Application Settings
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key

# AI Configuration
OPENAI_API_KEY=your-openai-key
EMBEDDING_MODEL=text-embedding-ada-002
```

### Database Setup

```bash
# Create database
createdb solix_edg

# Run migrations
psql -d solix_edg -f infrastructure/database/schema.sql
```

### OpenMetadata Configuration

1. **Install OpenMetadata**:
   ```bash
   docker run -d -p 8585:8585 openmetadata/standalone:latest
   ```

2. **Configure Ingestion**:
   - Access OpenMetadata UI at `http://localhost:8585`
   - Create ingestion pipelines for your data sources
   - Configure metadata extraction schedules

3. **Connect OpenGovern**:
   - Update `OPENMETADATA_URL` in your `.env` file
   - Restart OpenGovern services

### Open Policy Agent Setup

1. **Install OPA**:
   ```bash
   docker run -d -p 8181:8181 openpolicyagent/opa run --server
   ```

2. **Load Policies**:
   ```bash
   # Example policy for PII data protection
   curl -X PUT http://localhost:8181/v1/policies/pii \
     --data-binary @policies/pii.rego
   ```

## 📚 API Documentation

### Service Endpoints

| Service | Port | Base URL | Documentation |
|---------|------|----------|---------------|
| Frontend | 3000 | http://localhost:3000 | - |
| API Gateway | 8000 | http://localhost:8000 | [OpenAPI](api-gateway/openapi.yaml) |
| Metadata | 3001 | http://localhost:3001 | [OpenAPI](backend/metadata-service/openapi.yaml) |
| Policy | 3002 | http://localhost:3002 | [OpenAPI](backend/policy-service/openapi.yaml) |
| Workflow | 3003 | http://localhost:3003 | [OpenAPI](backend/workflow-service/openapi.yaml) |
| Alerts | 3004 | http://localhost:3004 | [OpenAPI](backend/alerts-service/openapi.yaml) |
| Integration | 3005 | http://localhost:3005 | [OpenAPI](backend/integration-service/openapi.yaml) |
| AI Search | 3006 | http://localhost:3006 | [OpenAPI](backend/ai-service/openapi.yaml) |
| Reverse Sync | 3007 | http://localhost:3007 | [OpenAPI](backend/reverse-metadata-sync-service/openapi.yaml) |

### Example API Calls

```bash
# Get all assets
curl http://localhost:3001/api/catalog/assets

# Search metadata
curl "http://localhost:3006/api/ai/query?q=customer+data"

# Evaluate policy
curl -X POST http://localhost:3002/api/policies/evaluate \
  -H "Content-Type: application/json" \
  -d '{"policy": "pii", "data": {"table": "customers"}}'
```

## 💻 Development

### Project Structure

```
solix-edg/
├── frontend/                    # Next.js web application
│   ├── src/
│   │   ├── app/                # App router pages
│   │   ├── components/         # Reusable UI components
│   │   └── lib/                # Utility functions
│   ├── public/                 # Static assets
│   └── package.json
├── backend/                     # Microservices
│   ├── metadata-service/       # Asset management
│   ├── policy-service/         # Governance policies
│   ├── workflow-service/       # Approval workflows
│   ├── alerts-service/         # Notifications
│   ├── integration-service/    # Data connectors
│   ├── ai-service/             # Semantic search
│   └── reverse-metadata-sync-service/
├── infrastructure/             # Deployment configs
│   ├── docker/                 # Docker Compose
│   ├── kubernetes/             # K8s manifests
│   └── ci-cd/                  # GitHub Actions
├── docs/                       # Documentation
└── README.md
```

### Development Workflow

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/your-username/EDG.git
   cd EDG/solix-edg
   ```

2. **Setup Development Environment**:
   ```bash
   # Install dependencies
   npm run install:all

   # Start development servers
   npm run dev

   # Run tests
   npm run test
   ```

3. **Code Style**:
   ```bash
   # Lint code
   npm run lint

   # Format code
   npm run format

   # Type check
   npm run type-check
   ```

4. **Testing**:
   ```bash
   # Unit tests
   npm run test:unit

   # Integration tests
   npm run test:integration

   # E2E tests
   npm run test:e2e
   ```

### Adding New Features

1. **Plan the Feature**:
   - Create an issue describing the feature
   - Design the API endpoints
   - Plan the UI components

2. **Implement Backend**:
   - Add new service or extend existing one
   - Write comprehensive tests
   - Update API documentation

3. **Implement Frontend**:
   - Create new pages/components
   - Add proper TypeScript types
   - Ensure responsive design

4. **Testing & Documentation**:
   - Write unit and integration tests
   - Update documentation
   - Add examples and screenshots

## � CI/CD Pipeline

OpenGovern includes a comprehensive CI/CD pipeline powered by GitHub Actions that ensures code quality, security, and reliable deployments.

### Pipeline Overview

```mermaid
graph LR
    subgraph "Code Quality"
        LINT[ESLint<br/>Prettier<br/>TypeScript]
        TEST[Unit Tests<br/>Integration Tests<br/>E2E Tests]
        SEC[Security Scan<br/>Dependency Audit<br/>CodeQL]
    end

    subgraph "Build & Deploy"
        BUILD[Docker Build<br/>Multi-platform]
        DEPLOY_STAGING[Deploy to Staging]
        DEPLOY_PROD[Deploy to Production]
    end

    subgraph "Monitoring"
        HEALTH[Health Checks<br/>Every 15min]
        PERF[Performance<br/>Monitoring]
        ALERT[Automated<br/>Alerts]
    end

    PUSH[Git Push] --> LINT
    LINT --> TEST
    TEST --> SEC
    SEC --> BUILD
    BUILD --> DEPLOY_STAGING
    DEPLOY_STAGING --> DEPLOY_PROD

    DEPLOY_PROD --> HEALTH
    HEALTH --> PERF
    PERF --> ALERT
```

### Workflows Included

#### 1. **Main CI/CD Pipeline** (`.github/workflows/ci-cd.yml`)
- **Lint & Test**: Runs ESLint, Prettier, TypeScript checks, and comprehensive test suites
- **Security Scan**: Trivy vulnerability scanning and npm audit
- **Build & Test**: Docker image building and testing
- **Integration Tests**: Full-stack integration testing with PostgreSQL and Redis
- **E2E Tests**: Playwright-based end-to-end testing
- **Deployment**: Automated deployment to staging and production environments

#### 2. **Code Quality** (`.github/workflows/code-quality.yml`)
- **Automated Code Review**: AI-powered code review with GPT-4
- **Performance Checks**: Lighthouse CI for performance monitoring
- **Accessibility**: axe-core and pa11y accessibility testing
- **Bundle Analysis**: Webpack bundle size monitoring
- **Deployment Readiness**: Automated checks before production deployment

#### 3. **Dependency Management** (`.github/workflows/dependency-updates.yml`)
- **Automated Updates**: Weekly dependency updates with security patches
- **Compatibility Testing**: Ensures updates don't break functionality
- **Pull Request Creation**: Automated PRs for dependency updates

#### 4. **Production Monitoring** (`.github/workflows/monitoring.yml`)
- **Health Checks**: Every 15 minutes monitoring of all services
- **Performance Monitoring**: Lighthouse scores and API response times
- **Error Tracking**: Automated error rate monitoring
- **Security Monitoring**: SSL certificates and security headers
- **Automated Alerts**: Slack and email notifications for issues

#### 5. **Backup & Recovery** (`.github/workflows/backup-recovery.yml`)
- **Automated Backups**: Weekly comprehensive backups
- **Disaster Recovery**: Full recovery testing and validation
- **Backup Verification**: Integrity checks and restoration testing

#### 6. **Release Management** (`.github/workflows/release.yml`)
- **Automated Releases**: Version bumping and GitHub releases
- **Package Publishing**: NPM and Docker Hub publishing
- **Documentation Updates**: Automated docs deployment
- **Release Notifications**: Stakeholder notifications

### Quality Gates

#### Code Quality Requirements
- ✅ **ESLint**: Zero errors, warnings reviewed
- ✅ **Prettier**: Code formatting consistency
- ✅ **TypeScript**: Strict type checking
- ✅ **Test Coverage**: Minimum 80% coverage
- ✅ **Security**: No high/critical vulnerabilities

#### Performance Requirements
- ✅ **Lighthouse Score**: >90 for performance
- ✅ **Accessibility**: >95 WCAG compliance
- ✅ **Bundle Size**: <500KB for main bundle
- ✅ **API Response Time**: <500ms average

#### Security Requirements
- ✅ **Dependency Audit**: No critical vulnerabilities
- ✅ **CodeQL**: Clean security analysis
- ✅ **Container Scanning**: No high-severity issues
- ✅ **SSL/TLS**: Valid certificates
- ✅ **Security Headers**: Properly configured

### Automated Scripts

The CI/CD pipeline uses several automated scripts in the `scripts/` directory:

#### Quality Assurance
- `check-deployment-config.js`: Validates deployment configuration
- `check-security-config.js`: Security configuration validation
- `check-performance-config.js`: Performance optimization checks
- `generate-quality-summary.js`: Comprehensive quality metrics

#### Backup & Recovery
- `create-backup.js`: Automated backup creation
- `restore-backup.js`: Backup restoration with validation
- `verify-backup.js`: Backup integrity verification

### Environment Variables

#### Required for CI/CD
```bash
# GitHub Secrets (configure in repository settings)
GITHUB_TOKEN=your_github_token
SLACK_WEBHOOK_URL=your_slack_webhook
EMAIL_USERNAME=your_email
EMAIL_PASSWORD=your_email_password
SONAR_TOKEN=your_sonar_token
OPENAI_API_KEY=your_openai_key

# AWS (for deployment and backups)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1

# Docker Registry
DOCKER_USERNAME=your_docker_username
DOCKER_PASSWORD=your_docker_password

# NPM Publishing
NPM_TOKEN=your_npm_token
```

### Pipeline Commands

#### Manual Pipeline Triggers
```bash
# Run full CI/CD pipeline
gh workflow run ci-cd.yml

# Run code quality checks
gh workflow run code-quality.yml

# Run dependency updates
gh workflow run dependency-updates.yml --ref main

# Run backup and recovery test
gh workflow run backup-recovery.yml --ref main

# Create release
gh workflow run release.yml --ref main
```

#### Quality Check Commands
```bash
# Run all quality checks locally
npm run deploy:check

# Generate quality summary
npm run quality:summary

# Check deployment configuration
npm run deploy:check:config

# Check security configuration
npm run deploy:check:security

# Check performance configuration
npm run deploy:check:performance
```

#### Backup Commands
```bash
# Create backup
npm run backup:create

# Restore from backup
npm run backup:restore backups/solix-edg-backup-2024-01-01.tar.gz

# Verify backup integrity
npm run backup:verify backups/solix-edg-backup-2024-01-01.tar.gz
```

### Monitoring & Alerting

#### Health Check Endpoints
- `GET /api/health` - Overall system health
- `GET /api/health/database` - Database connectivity
- `GET /api/health/cache` - Redis connectivity
- `GET /api/health/openmetadata` - OpenMetadata service
- `GET /api/health/opa` - Open Policy Agent

#### Alert Thresholds
- **Error Rate**: >5% triggers warning, >10% triggers alert
- **Response Time**: >500ms triggers warning, >1000ms triggers alert
- **SSL Expiry**: <30 days triggers alert
- **Performance Score**: <90 triggers warning

#### Notification Channels
- **Slack**: Real-time alerts for critical issues
- **Email**: Daily summaries and critical alerts
- **GitHub Issues**: Automated incident tracking

### Deployment Strategy

#### Staging Environment
- **Trigger**: Push to `staging` branch
- **Purpose**: Pre-production testing and validation
- **Checks**: All quality gates must pass
- **Rollback**: Automatic rollback on failure

#### Production Environment
- **Trigger**: Push to `main` branch or manual release
- **Purpose**: Live production deployment
- **Checks**: Additional security and performance validation
- **Rollback**: Manual rollback with backup restoration

### Backup Strategy

#### Automated Backups
- **Frequency**: Weekly full backups
- **Retention**: 30 days for daily, 1 year for weekly
- **Storage**: AWS S3 with encryption
- **Components**: Database, configuration, user data
- **Verification**: Automated integrity checks

#### Disaster Recovery
- **RTO**: <4 hours for critical systems
- **RPO**: <1 hour data loss
- **Testing**: Monthly disaster recovery drills
- **Documentation**: Detailed recovery procedures

## �🚢 Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificates installed
- [ ] Monitoring and logging configured
- [ ] Backup strategy implemented
- [ ] Security hardening applied

### Docker Production Deployment

```bash
# Build production images
docker-compose -f infrastructure/docker/docker-compose.prod.yml build

# Deploy
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d

# Scale services
docker-compose up -d --scale metadata-service=3
```

### Kubernetes Deployment

```bash
# Deploy to Kubernetes cluster
kubectl apply -f infrastructure/kubernetes/

# Check status
kubectl get pods
kubectl get services

# Scale deployment
kubectl scale deployment metadata-service --replicas=3
```

### Cloud Deployment

#### AWS
```bash
# Using AWS ECS
aws ecs create-cluster --cluster-name solix-edg
aws ecs create-service --cluster solix-edg --service-name solix-edg-service --task-definition solix-edg-task
```

#### Google Cloud
```bash
# Using Google Cloud Run
gcloud run deploy solix-edg --source . --platform managed --region us-central1
```

#### Azure
```bash
# Using Azure Container Instances
az container create --resource-group myResourceGroup --name solix-edg --image solix-edg:latest --ports 80
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute

- **🐛 Bug Reports**: Found a bug? [Open an issue](https://github.com/mdskmohan/EDG/issues)
- **✨ Feature Requests**: Have an idea? [Create a feature request](https://github.com/mdskmohan/EDG/issues)
- **📝 Documentation**: Help improve our docs
- **💻 Code**: Submit pull requests
- **🧪 Testing**: Help test new features
- **📣 Community**: Share your experience and help others

### Development Process

1. **Fork the Repository**
2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make Your Changes**
4. **Run Tests**
   ```bash
   npm run test
   ```
5. **Commit Your Changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to Branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb config with TypeScript support
- **Prettier**: Consistent code formatting
- **Testing**: Minimum 80% code coverage
- **Documentation**: JSDoc comments for all public APIs

### Commit Message Guidelines

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

```
MIT License

Copyright (c) 2024 OpenGovern

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🆘 Support

### Getting Help

- **📖 Documentation**: [Full Documentation](https://solix-edg.readthedocs.io/)
- **💬 Discussions**: [GitHub Discussions](https://github.com/mdskmohan/EDG/discussions)
- **❓ FAQ**: [Frequently Asked Questions](docs/faq.md)
- **🐛 Issues**: [Bug Reports](https://github.com/mdskmohan/EDG/issues)
- **📧 Email**: support@solix-edg.com

### Community

- **🌐 Website**: [https://solix-edg.com](https://solix-edg.com)
- **🐦 Twitter**: [@solixedg](https://twitter.com/solixedg)
- **💼 LinkedIn**: [OpenGovern](https://linkedin.com/company/opengovern)
- **📧 Newsletter**: [Subscribe](https://solix-edg.com/newsletter)

### Professional Support

For enterprise support, custom development, or consulting services:

- **Enterprise Support**: 24/7 support with SLA
- **Custom Integrations**: Connect to proprietary systems
- **Training**: On-site or virtual training sessions
- **Consulting**: Data governance strategy and implementation

Contact: enterprise@solix-edg.com

---

<div align="center">

**Built with ❤️ by the OpenGovern team**

[🌟 Star us on GitHub](https://github.com/mdskmohan/EDG) • [📖 Read the Docs](https://solix-edg.readthedocs.io/) • [🌐 Visit Website](https://solix-edg.com)

</div>