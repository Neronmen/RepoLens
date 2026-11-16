"""Endpoint hỏi đáp: nhận câu hỏi về một repo, phát từng bước của agent qua SSE."""
import json
import logging
import sqlite3
from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.loop import run_agent
from app.config import get_settings
from app.db import connect
from app.providers import build_provider
from app.providers.base import LLMProvider, Message, RateLimited

log = logging.getLogger("repolens.ask")
router = APIRouter(prefix="/api")


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)


class AskRequest(BaseModel):
    # giới hạn độ dài để không ai gửi cả cuốn sách vào làm tốn quota
    question: str = Field(min_length=1, max_length=2000)
    # các lượt hỏi đáp trước đó, để hỏi nối tiếp được ("thế còn hàm kia?")
    history: list[HistoryItem] = Field(default_factory=list, max_length=10)


@lru_cache
def get_provider() -> LLMProvider:
    return build_provider(get_settings())


def get_db_path() -> Path:
    return get_settings().db_path


def sse(event: str, data: dict) -> str:
    # ensure_ascii=False để tiếng Việt đi qua nguyên vẹn
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream(
    provider: LLMProvider,
    conn: sqlite3.Connection,
    repo: sqlite3.Row,
    req: AskRequest,
) -> AsyncIterator[str]:
    history = [Message(role=h.role, content=h.content) for h in req.history]
    label = f"{repo['owner']}/{repo['name']}"
    try:
        async for ev in run_agent(provider, conn, repo["id"], label, req.question, history):
            yield sse(ev.type, ev.data)
    except RateLimited:
        yield sse("error", {"message": "Model đang quá tải (hết lượt miễn phí trong phút này), đợi một chút rồi hỏi lại nhé."})
    except Exception:
        # log chi tiết ở server, chỉ nói chung chung cho client
        log.exception("Lỗi khi chạy agent")
        yield sse("error", {"message": "Có lỗi khi xử lý câu hỏi, thử lại sau nhé."})
    finally:
        # Kết nối được mở ở endpoint và đóng ở đây, vì phải sống suốt lúc stream.
        # `finally` cũng chạy khi người dùng đóng tab giữa chừng.
        conn.close()
    yield sse("done", {})


@router.post("/repos/{repo_id}/ask")
async def ask(
    repo_id: int,
    req: AskRequest,
    provider: LLMProvider = Depends(get_provider),
    db_path: Path = Depends(get_db_path),
):
    conn = connect(db_path)
    repo = conn.execute("SELECT id, owner, name FROM repos WHERE id = ?", (repo_id,)).fetchone()
    if repo is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Chưa có repo này, hãy thêm nó trước.")
    return StreamingResponse(
        _stream(provider, conn, repo, req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
