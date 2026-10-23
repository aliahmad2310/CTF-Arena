from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application runtime configuration loaded from environment or .env file.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Supabase Configuration
    SUPABASE_URL: str = "https://eaqqitgsvvrsvxqtvsle.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY: str = "placeholder-service-role-key"
    # Supabase publishable keys are public by design. Keep the frontend's current
    # publishable key as the fallback so username login works on hosts where the
    # environment variable cannot be added; an environment value still overrides it.
    SUPABASE_ANON_KEY: str = "sb_publishable_S4i-1fZoF50BuS2kZre4RA_p_a2Zx0L"
    SUPABASE_JWT_SECRET: str = "placeholder-jwt-secret-at-least-32-bytes-long-for-hmac"

    # CORS and Network
    ALLOWED_ORIGINS: Union[str, List[str]] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "https://ctf-arena-frontend.vercel.app",
        "https://ctf-arena-frontend-git-main.vercel.app",
        "https://pakistanhackerscommunity.com",
        "https://www.pakistanhackerscommunity.com",
    ]

    # Security & Game Engine Rules
    FLAG_PEPPER: str = "arena_demo_pepper"
    ACTIVE_WINDOW_MINUTES: int = 5
    STUCK_THRESHOLD_MINUTES: int = 20
    ENV: str = "development"

    @field_validator("ALLOWED_ORIGINS", mode="after")
    @classmethod
    def ensure_frontend_origins(cls, origins: List[str]) -> List[str]:
        """Always permit the deployed frontend domains used by this repository."""
        required = {
            "https://ctf-arena-frontend.vercel.app",
            "https://ctf-arena-frontend-git-main.vercel.app",
            "https://pakistanhackerscommunity.com",
            "https://www.pakistanhackerscommunity.com",
        }
        return list(dict.fromkeys([*origins, *required]))

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Union[str, List[str]]) -> List[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
