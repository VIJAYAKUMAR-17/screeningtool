from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4o"
    azure_openai_api_version: str = "2024-02-15-preview"

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sanctions"

    # Clerk authentication
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_jwt_key: str = ""
    clerk_audience: str = ""
    clerk_authorized_parties: str = ""
    clerk_require_organization: bool = True

    # CORS: comma-separated list of allowed browser origins.
    # Empty means same-origin only (no cross-origin browser access).
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Screening thresholds
    match_threshold: int = 85
    fuzzy_review_threshold: int = 70

    # OFAC sync behavior
    auto_sync_ofac_on_screening: bool = True
    ofac_sync_check_interval_seconds: int = 300

    # Tier 1 CSL API
    tier1_csl_api_key: str = ""
    tier1_csl_base_url: str = "https://data.trade.gov/consolidated_screening_list/v1"
    tier1_csl_timeout_seconds: float = 20.0

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
