"""Cấu hình của app, đọc từ biến môi trường hoặc file .env ở thư mục gốc repo."""
from pathlib import Path
from typing import Annotated, Literal

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
    embed_model: str = "gemini-embedding-001"
    # keyword = chỉ FTS5, vector = chỉ embedding, hybrid = trộn cả hai (mặc định).
    # Có ba chế độ để bộ đánh giá đo được từng cách tìm hơn kém nhau bao nhiêu.
    search_mode: Literal["keyword", "vector", "hybrid"] = "hybrid"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # chỗ lưu database SQLite
    db_path: Path = ROOT_DIR / "data" / "repolens.sqlite"

    # Giới hạn mỗi IP mỗi giờ, để bản công khai không bị đốt hết hạn mức miễn phí.
    ask_limit_per_hour: int = 30
    index_limit_per_hour: int = 10
    read_limit_per_hour: int = 600  # xem file, danh sách file: rẻ nhưng vẫn không để ai cào vô hạn
    # Trần cho CẢ SERVER, bất kể IP nào. Giới hạn theo IP không cản được kẻ đổi IP liên tục,
    # nhưng trần chung đảm bảo hạn mức Gemini miễn phí không bao giờ bị đốt hết bởi một đợt tấn công.
    ask_global_per_hour: int = 400
    index_global_per_hour: int = 60
    # Trang tài liệu API tự sinh (/docs) chỉ bật khi phát triển.
    enable_docs: bool = False

    # Tài khoản và lịch sử chat. Máy dev dùng một file SQLite; bản deploy đặt DATABASE_URL
    # trỏ tới Postgres miễn phí (Neon, Supabase) vì đĩa của server free bị xóa khi khởi động lại.
    database_url: str = f"sqlite:///{(ROOT_DIR / 'data' / 'accounts.sqlite').as_posix()}"
    google_client_id: str = ""  # để trống thì tắt tính năng đăng nhập
    session_secret: str = ""  # khóa ký phiên đăng nhập, bản deploy bắt buộc phải đặt
    session_days: int = 30
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
