from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "Ops Portal API"
    api_prefix: str = "/api"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ops_ops_portal"
    cors_origins: list[str] = ["http://localhost:3000"]
    redis_url: str = "redis://localhost:6379/0"
    ai_gw_playground_base_url: str = "https://ai-gateway.example.com"
    ai_gateway_token: str | None = None
    ai_default_model: str = "gpt-4.1-mini"
    ai_gw_timeout_seconds: int = 60
    ai_reports_daily_limit: int = 5
    ai_reports_limit_timezone: str = "America/Mexico_City"
    ai_reports_recent_runs_limit: int = 20

    model_config = SettingsConfigDict(
        env_file=(str(PROJECT_ROOT / ".env"), str(PROJECT_ROOT / "api" / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.ai_gateway_token and settings.ai_gateway_token.strip():
        return settings

    fallback_paths = (
        PROJECT_ROOT / ".ai_gateway_token",
        PROJECT_ROOT / "api" / ".ai_gateway_token",
    )
    for path in fallback_paths:
        if not path.exists():
            continue
        try:
            token = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if token:
            settings.ai_gateway_token = token
            break
    return settings
