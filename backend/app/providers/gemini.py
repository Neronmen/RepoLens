import uuid
from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.providers.base import Message, StreamEvent, ToolCall, ToolSpec, Usage


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
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def stream(
        self,
        messages: list[Message],
        system: str = "",
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        config = types.GenerateContentConfig(system_instruction=system or None)
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

        usage = Usage()
        response = await self._client.aio.models.generate_content_stream(
            model=self._model, contents=_to_contents(messages), config=config
        )
        async for chunk in response:
            # Duyệt từng part thay vì dùng chunk.text, vì một chunk có thể chứa
            # cả chữ lẫn yêu cầu gọi công cụ.
            candidates = chunk.candidates or []
            content = candidates[0].content if candidates else None
            for part in (content.parts if content and content.parts else []):
                if part.function_call:
                    fc = part.function_call
                    yield StreamEvent(
                        tool_call=ToolCall(
                            id=fc.id or uuid.uuid4().hex[:12],
                            name=fc.name or "",
                            args=dict(fc.args or {}),
                            signature=part.thought_signature,
                        )
                    )
                elif part.text and not part.thought:
                    yield StreamEvent(text=part.text)

            # token chỉ có đầy đủ ở chunk cuối, nên cứ ghi đè dần
            meta = chunk.usage_metadata
            if meta:
                usage = Usage(
                    input_tokens=meta.prompt_token_count or 0,
                    output_tokens=(meta.candidates_token_count or 0)
                    + (meta.thoughts_token_count or 0),
                )
        yield StreamEvent(usage=usage)
