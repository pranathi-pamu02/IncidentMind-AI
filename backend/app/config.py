from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://incidentmind:change-this-password@localhost:5432/incidentmind"
    jwt_secret: str = "development-only-change-this-secret-before-deploying-123456"
    jwt_expire_minutes: int = 720
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    ai_mode: str = "mock"
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    hindsight_base_url: str = ""
    hindsight_api_key: str = ""
    hindsight_bank_id: str = "incidentmind"
    cors_origins: str = "http://localhost:3000"

settings = Settings()
