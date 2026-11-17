"""Endpoint hỏi đáp: nhận câu hỏi về một repo, phát từng bước của agent qua SSE."""
import asyncio
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

from app import auth
from app.accounts import store
from app.accounts.recorder import TurnRecorder
from app.agent.loop import run_agent
from app.config import get_settings
from app.db import connect
from app.i18n import REPO_NOT_FOUND, Msg
from app.providers import build_provider
from app.providers.base import LLMProvider, Message, ModelOverloaded, RateLimited
from app.ratelimit import ask_global, ask_limiter

log = logging.getLogger("repolens.ask")
router = APIRouter(prefix="/api")

# Lịch sử do trình duyệt gửi lên nên không thể tin: ai cũng có thể bịa ra. Giới
# hạn tổng độ dài để không ai nhét cả cuốn sách vào, vì mỗi bước của agent đều
# gửi lại toàn bộ lịch sử cho model.
HISTORY_BUDGET_CHARS = 12_000


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)


class AskRequest(BaseModel):
    # giới hạn độ dài để không ai gửi cả cuốn sách vào làm tốn quota
    question: str = Field(min_length=1, max_length=2000)
    # các lượt hỏi đáp trước đó, để hỏi nối tiếp được ("thế còn hàm kia?")
    history: list[HistoryItem] = Field(default_factory=list, max_length=10)
    # có thì (và đã đăng nhập) server tự lưu lượt hỏi đáp này vào hội thoại đó
    conversation_id: str | None = Field(default=None, max_length=36)


@lru_cache
def _build_provider() -> LLMProvider:
    return build_provider(get_settings())


def get_provider() -> LLMProvider:
    try:
        return _build_provider()
    except ValueError as e:
        # thiếu GEMINI_API_KEY: báo cho người dùng biết server chưa sẵn sàng
        # thay vì để lộ ra thành lỗi 500 trống trơn
        log.error("Không tạo được provider: %s", e)
        raise HTTPException(
            status_code=503,
            detail=str(
                Msg(
                    "Server chưa được cấu hình khóa API cho model.",
                    "The server has no API key configured for the model.",
                )
            ),
        ) from e


def get_db_path() -> Path:
    return get_settings().db_path


def clean_history(items: list[HistoryItem]) -> list[Message]:
    """Giữ những lượt gần nhất trong ngân sách ký tự, và luôn bắt đầu bằng lượt của người dùng."""
    kept: list[HistoryItem] = []
    used = 0
    for item in reversed(items):
        used += len(item.content)
        if used > HISTORY_BUDGET_CHARS:
            break
        kept.append(item)
    kept.reverse()
    while kept and kept[0].role != "user":
        kept.pop(0)
    return [Message(role=h.role, content=h.content) for h in kept]


def sse(event: str, data: dict) -> bytes:
    text = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    # errors="replace": model đôi khi sinh ra ký tự Unicode hỏng (surrogate lẻ).
    # Nếu để encode báo lỗi thì cả stream đứt giữa chừng mà client không biết vì sao.
    return text.encode("utf-8", errors="replace")


async def _stream(
    provider: LLMProvider,
    conn: sqlite3.Connection,
    repo: sqlite3.Row,
    req: AskRequest,
    save_to: str | None = None,
) -> AsyncIterator[bytes]:
    label = f"{repo['owner']}/{repo['name']}"
    recorder = TurnRecorder(req.question)
    try:
        async for ev in run_agent(
            provider, conn, repo["id"], label, req.question, clean_history(req.history)
        ):
            recorder.feed(ev.type, ev.data)
            yield sse(ev.type, ev.data)
        recorder.feed("done", {})  # agent chạy trọn vẹn: phải đánh dấu trước khi lưu ở `finally`
    except RateLimited:
        msg = str(Msg(
            "Model đang quá tải hoặc đã hết lượt miễn phí, đợi một chút rồi hỏi lại nhé.",
            "The model is overloaded or the free quota is used up, wait a moment and ask again.",
        ))
        recorder.feed("error", {"message": msg})
        yield sse("error", {"message": msg})
    except ModelOverloaded:
        msg = str(Msg("Model đang bận, thử lại sau ít phút nhé.", "The model is busy, please try again in a few minutes."))
        recorder.feed("error", {"message": msg})
        yield sse("error", {"message": msg})
    except Exception:
        # log chi tiết ở server, chỉ nói chung chung cho client
        log.exception("Lỗi khi chạy agent")
        msg = str(Msg(
            "Có lỗi khi xử lý câu hỏi, thử lại sau nhé.",
            "Something went wrong while handling your question, please try again.",
        ))
        recorder.feed("error", {"message": msg})
        yield sse("error", {"message": msg})
    finally:
        # Lưu lượt hỏi đáp ngay tại server, kể cả khi người dùng đã rớt mạng hay đóng tab:
        # họ mở lại lịch sử vẫn thấy phần đã trả lời được, thay vì mất sạch.
        if save_to:
            _save_turn(save_to, recorder)
        # Kết nối được mở ở endpoint và đóng ở đây, vì phải sống suốt lúc stream.
        # `finally` cũng chạy khi người dùng đóng tab giữa chừng.
        conn.close()
    yield sse("done", {})


def _save_turn(conversation_id: str, recorder: TurnRecorder) -> None:
    try:
        # chưa có chữ nào mà cũng chưa lỗi (đóng tab ngay lập tức) thì không có gì đáng lưu
        if recorder.answer or recorder.steps or recorder.error:
            store.add_turn(conversation_id, recorder.question, recorder.build())
    except Exception:  # noqa: BLE001  lưu lịch sử hỏng không được làm hỏng câu trả lời
        log.exception("Không lưu được lượt hỏi đáp")


@router.post("/repos/{repo_id}/ask", dependencies=[Depends(ask_limiter), Depends(ask_global)])
async def ask(
    repo_id: int,
    req: AskRequest,
    provider: LLMProvider = Depends(get_provider),
    db_path: Path = Depends(get_db_path),
    user: dict | None = Depends(auth.optional_user),
):
    save_to = None
    if req.conversation_id:
        # chỉ lưu vào hội thoại của chính người đang hỏi; sai thì từ chối rõ ràng thay vì lặng lẽ không lưu
        conv = await asyncio.to_thread(store.get_conversation, user["id"], req.conversation_id) if user else None
        if conv is None:
            raise HTTPException(
                status_code=404,
                detail=str(Msg("Không tìm thấy cuộc trò chuyện này.", "That conversation was not found.")),
            )
        save_to = conv["id"]
    conn = connect(db_path)
    try:
        repo = conn.execute("SELECT id, owner, name FROM repos WHERE id = ?", (repo_id,)).fetchone()
    except Exception:
        conn.close()
        raise
    if repo is None:
        conn.close()
        raise HTTPException(status_code=404, detail=str(REPO_NOT_FOUND))
    return StreamingResponse(
        _stream(provider, conn, repo, req, save_to),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
