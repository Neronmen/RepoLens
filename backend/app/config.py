"""Cấu hình của app, đọc từ biến môi trường hoặc file .env ở thư mục gốc repo."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env nằm ở gốc repo (cạnh thư mục backend)
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    # frontend chạy ở đâu thì cho phép gọi API từ đó
    cors_origins: list[str] = ["http://localhost:5173"]


def get_settings() -> Settings:
    return Settings()
