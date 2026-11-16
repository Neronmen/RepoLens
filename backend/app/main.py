from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.chat import router as chat_router
from app.config import get_settings
from app.repos import router as repos_router

settings = get_settings()

app = FastAPI(title="RepoLens")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(chat_router)
app.include_router(repos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
