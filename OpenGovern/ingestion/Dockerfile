FROM python:3.11-slim

WORKDIR /app

# System deps for native connectors (Snowflake, psycopg2, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libssl-dev curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install ALL connectors upfront — no manual pip install needed by users
# This makes the image larger (~2GB) but connectors just work
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy ingestion framework source
COPY opengovern_ingestion/ ./opengovern_ingestion/
COPY pyproject.toml ./
COPY ingestion_worker.py ./

# Install CLI entry point
RUN pip install --no-cache-dir -e . --no-deps 2>/dev/null || true

RUN useradd -m -u 1001 ingestion && chown -R ingestion:ingestion /app
USER ingestion

EXPOSE 3007

# Run as HTTP worker service (receives triggers from core-api)
CMD ["uvicorn", "ingestion_worker:app", "--host", "0.0.0.0", "--port", "3007"]
