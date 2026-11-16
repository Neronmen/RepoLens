"""Endpoint chat: nhận câu hỏi, trả lời từng chữ qua SSE."""
import json
import logging
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.providers import build_provider
from app.providers.base import LLMProvider, Message

log = logging.getLogger("repolens.chat")
router = APIRouter(prefix="/api")

SYSTEM_PROMPT = "Bạn là RepoLens, trợ lý giúp người dùng hiểu codebase. Trả lời ngắn gọn, rõ ràng."


class MessageIn(BaseModel):
    role: Literal["user", "assistant"]
    # giới hạn độ dài để không ai gửi cả cuốn sách vào làm tốn quota
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    messages: list[MessageIn] = Field(min_length=1, max_length=40)


@lru_cache
def get_provider() -> LLMProvider:
    return build_provider(get_settings())


def sse(event: str, data: dict) -> str:
    # ensure_ascii=False để tiếng Việt đi qua nguyên vẹn
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream(provider: LLMProvider, messages: list[Message]) -> AsyncIterator[str]:
    try:
        async for ev in provider.stream(messages, system=SYSTEM_PROMPT):
            if ev.text:
                yield sse("token", {"text": ev.text})
            if ev.usage:
                yield sse("usage", {
                    "input_tokens": ev.usage.input_tokens,
                    "output_tokens": ev.usage.output_tokens,
                })
    except Exception:
        # log chi tiết ở server, chỉ nói chung chung cho client
        log.exception("Lỗi khi gọi model")
        yield sse("error", {"message": "Model đang gặp lỗi, thử lại sau nhé."})
    yield sse("done", {})


@router.post("/chat")
async def chat(req: ChatRequest, provider: LLMProvider = Depends(get_provider)):
    return StreamingResponse(
        _stream(provider, [Message(m.role, m.content) for m in req.messages]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
