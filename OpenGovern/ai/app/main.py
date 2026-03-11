"""
OpenGovern AI Service

FastAPI application providing:
  - Semantic search over data assets (via Qdrant vector search)
  - Auto-classification of columns (PII, PCI, PHI detection)
  - LLM-powered governance assistant

Startup lifecycle:
  1. Load settings (validates env vars, fails fast if missing required ones)
  2. Ensure Qdrant collection exists (creates if not)
  3. Start accepting requests
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .config.settings import get_settings
from .services.qdrant_service import QdrantService
from .routers import search, embeddings, classify

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Runs startup logic before yielding, cleanup after.
    """
    settings = get_settings()
    logger.info(f"Starting OpenGovern AI Service on port {settings.port}")
    logger.info(f"Qdrant: {settings.qdrant_url}")
    logger.info(f"OpenAI: {'configured' if settings.openai_api_key else 'NOT configured (using mock embeddings)'}")

    # Ensure vector collection exists in Qdrant (sync call)
    qdrant = QdrantService()
    qdrant.ensure_collection()
    logger.info(f"Qdrant collection '{settings.qdrant_collection}' ready")

    yield  # Application runs here

    logger.info("Shutting down AI service")


# Initialize FastAPI app
app = FastAPI(
    title="OpenGovern AI Service",
    description="Semantic search, auto-classification, and LLM assistant for OpenGovern",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow requests from the frontend and other services
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production via env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(search.router,     prefix="/search",     tags=["Search"])
app.include_router(embeddings.router, prefix="/embeddings", tags=["Embeddings"])
app.include_router(classify.router,   prefix="/classify",   tags=["Classification"])


@app.get("/health", tags=["Health"])
async def health():
    """Health check endpoint. Returns service status."""
    settings = get_settings()
    return {
        "status": "ok",
        "service": "ai-service",
        "version": "1.0.0",
        "openai_configured": bool(settings.openai_api_key),
        "qdrant_url": settings.qdrant_url,
    }
