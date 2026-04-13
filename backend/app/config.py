from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_ANON_KEY: str = Field(..., description="Supabase anon/public key")
    SUPABASE_SERVICE_KEY: str = Field(
        ..., description="Supabase service role key (never expose to client)"
    )

    # ── AI provider ───────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = Field(..., description="OpenAI API key for LangGraph agent")

    # ── Application ───────────────────────────────────────────────────────────
    FRONTEND_URL: str = Field(
        default="http://localhost:3000",
        description="Allowed CORS origin for the Next.js frontend",
    )
    ENVIRONMENT: str = Field(
        default="development",
        description="Runtime environment: development | staging | production",
    )
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Logging level: DEBUG | INFO | WARNING | ERROR",
    )

    # ── Rate limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_CHAT: str = Field(
        default="20/minute",
        description="slowapi rate limit string for the /chat endpoint",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Extra keys in .env are silently ignored so deployments can carry
        # additional infra vars (e.g. PORT, RAILWAY_xxx) without crashing.
        extra="ignore",
    )

    @field_validator("SUPABASE_URL", "FRONTEND_URL")
    @classmethod
    def url_must_be_valid(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URLs must start with http:// or https://")
        return v.rstrip("/")

    @field_validator("ENVIRONMENT")
    @classmethod
    def environment_must_be_known(cls, v: str) -> str:
        valid = {"development", "staging", "production"}
        if v not in valid:
            raise ValueError(f"ENVIRONMENT must be one of {valid}, got '{v}'")
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
