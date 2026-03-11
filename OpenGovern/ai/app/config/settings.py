"""
Application settings loaded from environment variables.
pydantic-settings handles env var parsing, type coercion, and .env file loading automatically.
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # OpenAI - optional so the service can run without an API key in dev
    openai_api_key: Optional[str] = None
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4o-mini"

    # Qdrant vector store
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "opengovern_assets"

    # Upstream services
    core_api_url: str = "http://localhost:3001"

    # Server
    port: int = 3006

    @property
    def has_openai(self) -> bool:
        """True when an API key is configured and calls can be made."""
        return bool(self.openai_api_key)


# Single shared instance - import this everywhere
settings = Settings()


def get_settings() -> Settings:
    """Return the shared settings instance. Used for dependency injection."""
    return settings
