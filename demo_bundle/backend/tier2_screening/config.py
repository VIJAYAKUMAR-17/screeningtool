from pydantic_settings import BaseSettings


class Tier2Settings(BaseSettings):
    sec_user_agent: str = "tier2-screening/1.0 (compliance@example.com)"
    sec_max_requests_per_second: int = 10
    sec_timeout_seconds: float = 20.0

    gleif_base_url: str = "https://api.gleif.org/api/v1"
    opencorporates_base_url: str = "https://api.opencorporates.com/v0.4"
    opencorporates_api_token: str = ""

    tier2_http_timeout_seconds: float = 20.0
    tier2_http_max_retries: int = 3
    tier2_http_backoff_base_seconds: float = 0.6
    tier2_cache_ttl_seconds: int = 3600

    class Config:
        env_file = ".env"
        extra = "ignore"


tier2_settings = Tier2Settings()

