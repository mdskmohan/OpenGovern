#!/bin/bash
# OpenGovern Health Check
# Usage: ./check-health.sh

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

check() {
  local name="$1" url="$2"
  printf "  %-30s" "$name"
  if curl -sf "$url" &>/dev/null; then
    echo -e "${GREEN}● running${NC}"
  else
    echo -e "${RED}✗ not responding${NC}  →  curl -s $url"
  fi
}

check_port() {
  local name="$1" host="$2" port="$3"
  printf "  %-30s" "$name"
  if nc -z "$host" "$port" 2>/dev/null; then
    echo -e "${GREEN}● port open${NC}"
  else
    echo -e "${RED}✗ port closed${NC}"
  fi
}

echo ""
echo -e "${BOLD}OpenGovern Health Check${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "\n${BOLD}Infrastructure${NC}"
check_port "PostgreSQL   :5432"    localhost 5432
check_port "Redis        :6379"    localhost 6379
check_port "Kafka        :29092"   localhost 29092
check      "Elasticsearch:9200"   "http://localhost:9200/_cluster/health"
check      "OPA          :8181"   "http://localhost:8181/health"
check_port "Qdrant       :6333"    localhost 6333

echo -e "\n${BOLD}Application Services${NC}"
check "Auth Service  :3010"  "http://localhost:3010/health"
check "Core API      :3001"  "http://localhost:3001/health"
check "Governance    :3002"  "http://localhost:3002/health"
check "Quality       :3003"  "http://localhost:3003/health"
check "Notifications :3004"  "http://localhost:3004/health"
check "AI Service    :3006"  "http://localhost:3006/health"
check "Frontend      :3000"  "http://localhost:3000"

echo -e "\n${BOLD}Dev Tools${NC}"
check "Mailhog       :8025"  "http://localhost:8025"
check "Kafka UI      :8080"  "http://localhost:8080"

echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  docker compose ps                  # container status + health"
echo "  docker compose logs -f             # tail all logs"
echo "  docker compose logs -f core-api   # tail one service"
echo "  docker compose restart core-api   # restart one service"
echo ""
