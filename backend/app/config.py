"""Cấu hình của app, đọc từ biến môi trường hoặc file .env ở thư mục gốc repo."""
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# .env nằm ở gốc repo (cạnh thư mục backend)
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    # Frontend chạy ở đâu thì cho phép gọi API từ đó. Ngoài môi trường thật chỉ
    # cần viết CORS_ORIGINS=https://a.com,https://b.com (không cần định dạng JSON).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # chỗ lưu database SQLite
    db_path: Path = ROOT_DIR / "data" / "repolens.sqlite"

    # Giới hạn mỗi IP mỗi giờ, để bản công khai không bị đốt hết hạn mức miễn phí.
    ask_limit_per_hour: int = 30
    index_limit_per_hour: int = 10
    # Bật khi chạy sau reverse proxy (Render...) để lấy IP thật từ X-Forwarded-For.
    trust_proxy: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value


def get_settings() -> Settings:
    return Settings()
