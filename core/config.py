from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # xAI / Grok
    XAI_API_KEY: str = "changeme"
    XAI_BASE_URL: str = "https://api.x.ai/v1"
    MODEL_NAME: str = "grok-4-1"

    # Pipeline concurrency
    MAX_CONCURRENCY: int = 5
    MAX_LLM_RETRIES: int = 3
    LLM_RETRY_MIN_WAIT: float = 1.0
    LLM_RETRY_MAX_WAIT: float = 10.0

    # Storage
    CACHE_DIR: str = "./cache"
    UPLOAD_DIR: str = "./uploads"

    # App
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
