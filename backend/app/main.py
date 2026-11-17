from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts_api import router as accounts_router
from app.ask import router as ask_router
from app.config import get_settings
from app.i18n import LangMiddleware
from app.security import SecurityHeadersMiddleware
from app.repos import router as repos_router

settings = get_settings()

# Tắt /docs và /openapi.json ở bản công khai: không cần phơi bày danh sách endpoint cho người lạ.
app = FastAPI(
    title="RepoLens",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

# Thêm trước CORS để CORS bọc ngoài cùng và vẫn trả lời được các request kiểm tra trước (preflight).
app.add_middleware(LangMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # chỉ mở đúng những gì frontend dùng, không mở toang
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Lang", "Authorization"],
)


app.include_router(ask_router)
app.include_router(accounts_router)
app.include_router(repos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
