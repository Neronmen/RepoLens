from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ask import router as ask_router
from app.config import get_settings
from app.i18n import LangMiddleware
from app.repos import router as repos_router

settings = get_settings()

app = FastAPI(title="RepoLens")

# Thêm trước CORS để CORS bọc ngoài cùng và vẫn trả lời được các request kiểm tra trước (preflight).
app.add_middleware(LangMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(ask_router)
app.include_router(repos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
