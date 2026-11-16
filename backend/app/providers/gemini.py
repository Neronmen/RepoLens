import asyncio
import logging
import uuid
from collections.abc import AsyncIterator

from google import genai
from google.genai import errors, types

from app.providers.base import (
    Message,
    ModelOverloaded,
    RateLimited,
    StreamEvent,
    ToolCall,
    ToolSpec,
    Usage,
)

log = logging.getLogger("repolens.gemini")

TIMEOUT_MS = 60_000
# gồm cả token "suy nghĩ" của model, nên để rộng kẻo câu trả lời bị cắt ngang
MAX_OUTPUT_TOKENS = 8192
# Gói miễn phí hay báo 429/503 thoáng qua. Thử lại vài lần, nhưng chỉ khi
# chưa có chữ nào được gửi đi, không thì người dùng sẽ thấy câu trả lời bị lặp.
RETRY_DELAYS = (1.0, 3.0)


def _to_contents(messages: list[Message]) -> list[types.Content]:
    """Đổi hội thoại của mình sang định dạng của Gemini."""
    contents = []
    for m in messages:
        parts: list[types.Part] = []
        if m.role == "tool":
            # Gemini nhận kết quả công cụ như một lượt "user" đặc biệt
            for r in m.tool_results:
                parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=r.call_id, name=r.name, response={"result": r.content}
                        )
                    )
                )
            # lời nhắn thêm của mình đi kèm kết quả công cụ (ví dụ "hết lượt rồi")
            if m.content:
                parts.append(types.Part(text=m.content))
            role = "user"
        else:
            if m.content:
                parts.append(types.Part(text=m.content))
            for c in m.tool_calls:
                parts.append(
                    types.Part(
                        function_call=types.FunctionCall(id=c.id, name=c.name, args=c.args),
                        thought_signature=c.signature,
                    )
                )
            # Gemini gọi vai trò của model là "model" chứ không phải "assistant"
            role = "model" if m.role == "assistant" else "user"
        if parts:
            contents.append(types.Content(role=role, parts=parts))
    return contents


class GeminiProvider:
    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ValueError("Chưa có GEMINI_API_KEY, hãy điền vào file .env")
        self._client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS)
        )
        self._model = model

    async def stream(
        self,
        messages: list[Message],
        system: str = "",
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        config = types.GenerateContentConfig(
            system_instruction=system or None, max_output_tokens=MAX_OUTPUT_TOKENS
        )
        if tools:
            config.tools = [
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=t.name,
                            description=t.description,
                            parameters_json_schema=t.parameters,
                        )
                        for t in tools
                    ]
                )
            ]
            # mình tự chạy công cụ và tự quyết định vòng lặp, không để SDK làm hộ
            config.automatic_function_calling = types.AutomaticFunctionCallingConfig(disable=True)

        for attempt in range(len(RETRY_DELAYS) + 1):
            started = False
            try:
                async for ev in self._events(messages, config):
                    started = True
                    yield ev
                return
            except errors.APIError as e:
                retryable = e.code in (429, 503)
                if retryable and not started and attempt < len(RETRY_DELAYS):
                    log.warning("Gemini báo %s, thử lại sau %ss", e.code, RETRY_DELAYS[attempt])
                    await asyncio.sleep(RETRY_DELAYS[attempt])
                    continue
                if e.code == 429:
                    raise RateLimited() from e
                if e.code == 503:
                    raise ModelOverloaded() from e
                raise

    async def _events(
        self, messages: list[Message], config: types.GenerateContentConfig
    ) -> AsyncIterator[StreamEvent]:
        usage = Usage()
        response = await self._client.aio.models.generate_content_stream(
            model=self._model, contents=_to_contents(messages), config=config
        )
        async for chunk in response:
            # Duyệt từng part thay vì dùng chunk.text, vì một chunk có thể chứa
            # cả chữ lẫn yêu cầu gọi công cụ.
            candidates = chunk.candidates or []
            candidate = candidates[0] if candidates else None
            content = candidate.content if candidate else None
            for part in (content.parts if content and content.parts else []):
                if part.text and not part.thought:
                    yield StreamEvent(text=part.text)
                fc = part.function_call
                if fc and fc.name:  # tên rỗng thì gửi lại lượt sau cũng chỉ bị Gemini từ chối
                    yield StreamEvent(
                        tool_call=ToolCall(
                            id=fc.id or uuid.uuid4().hex[:12],
                            name=fc.name,
                            args=dict(fc.args or {}),
                            signature=part.thought_signature,
                        )
                    )

            # Lý do dừng bất thường (hết token, bị chặn vì an toàn...) là manh mối
            # quan trọng khi người dùng báo "không có câu trả lời".
            reason = getattr(getattr(candidate, "finish_reason", None), "name", None)
            if reason and reason not in ("STOP", "FINISH_REASON_UNSPECIFIED"):
                log.warning("Gemini dừng với lý do bất thường: %s", reason)

            # token chỉ có đầy đủ ở chunk cuối, nên cứ ghi đè dần
            meta = chunk.usage_metadata
            if meta:
                usage = Usage(
                    input_tokens=meta.prompt_token_count or 0,
                    output_tokens=(meta.candidates_token_count or 0)
                    + (meta.thoughts_token_count or 0),
                )
        yield StreamEvent(usage=usage)
