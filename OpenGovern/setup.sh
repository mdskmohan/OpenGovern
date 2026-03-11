#!/bin/bash
# OpenGovern Setup Script
# Run from the OpenGovern/ directory: ./setup.sh
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}→${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "${RED}✗${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}$1${NC}"; }

# Ensure we're in the right directory (the one containing this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║       OpenGovern Setup            ║"
echo "  ║  Enterprise Data Governance       ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ─── Prerequisites ───────────────────────────────────────────────
section "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  fail "Docker not installed. Get it at: https://www.docker.com/products/docker-desktop"
fi
success "Docker: $(docker --version | awk '{print $3}' | tr -d ',')"

if ! docker info &>/dev/null 2>&1; then
  fail "Docker Desktop is not running. Please start it and try again."
fi
success "Docker daemon: running"

if ! docker compose version &>/dev/null 2>&1; then
  fail "Docker Compose not found. It ships with Docker Desktop."
fi
success "Docker Compose: available"

# ─── JWT Keys ────────────────────────────────────────────────────
section "Setting up JWT keys (RS256)..."

mkdir -p infrastructure/keys

if [ ! -f "infrastructure/keys/private.pem" ]; then
  info "Generating RS256 key pair..."
  openssl genrsa -out infrastructure/keys/private.pem 2048 2>/dev/null
  openssl rsa -in infrastructure/keys/private.pem -pubout \
    -out infrastructure/keys/public.pem 2>/dev/null
  success "Keys generated at infrastructure/keys/"
else
  success "JWT keys already exist"
fi

# ─── Environment ─────────────────────────────────────────────────
section "Environment..."

if [ ! -f ".env" ]; then
  warn ".env not found — docker-compose defaults will be used (fine for local dev)"
  warn "To customise, copy .env.example to .env and edit it"
else
  success ".env file found"
fi

# ─── Build & Start ───────────────────────────────────────────────
section "Building Docker images (3-5 min first time)..."

cd infrastructure/docker

docker compose build --parallel
info "Images built. Starting all services..."
docker compose up -d

# ─── Wait for health ─────────────────────────────────────────────
section "Waiting for services to be ready..."

wait_http() {
  local label="$1" url="$2" timeout=120 elapsed=0
  printf "  %-30s" "$label"
  while ! curl -sf "$url" &>/dev/null; do
    sleep 3; elapsed=$((elapsed+3))
    if [ $elapsed -ge $timeout ]; then
      echo -e " ${YELLOW}still starting (check: docker compose logs)${NC}"; return 0
    fi
    printf "."
  done
  echo -e " ${GREEN}ready${NC}"
}

sleep 15   # let containers start

wait_http "auth-service"        "http://localhost:3010/health"
wait_http "core-api"            "http://localhost:3001/health"
wait_http "governance-service"  "http://localhost:3002/health"
wait_http "quality-service"     "http://localhost:3003/health"
wait_http "ai-service"          "http://localhost:3006/health"
wait_http "frontend"            "http://localhost:3000"

# ─── Done ────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║     OpenGovern is running!             ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Open in browser:${NC}  http://localhost:3000"
echo ""
echo -e "  ${BOLD}Login:${NC}"
echo -e "    Email:     admin@opengovern.io"
echo -e "    Password:  admin"
echo ""
echo -e "  ${BOLD}Developer tools:${NC}"
echo -e "    Kafka UI:  http://localhost:8080"
echo -e "    Mailhog:   http://localhost:8025  (view sent emails)"
echo -e "    API docs:  http://localhost:3001/api-docs"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    docker compose logs -f            # tail all logs"
echo -e "    docker compose logs -f core-api   # tail one service"
echo -e "    docker compose restart core-api   # restart one service"
echo -e "    docker compose down               # stop (keeps data)"
echo -e "    docker compose down -v            # stop + wipe data"
echo ""
echo -e "  ${BOLD}Run an ingestion:${NC}"
echo -e "    cd ../../ingestion"
echo -e "    pip install -e ."
echo -e "    opengovern ingest --recipe configs/postgres-recipe.yaml"
echo ""
