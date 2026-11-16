from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.providers.base import Message, StreamEvent, Usage


class GeminiProvider:
    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ValueError("Chưa có GEMINI_API_KEY, hãy điền vào file .env")
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def stream(
        self, messages: list[Message], system: str = ""
    ) -> AsyncIterator[StreamEvent]:
        # Gemini gọi vai trò của model là "model" chứ không phải "assistant"
        contents = [
            types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[types.Part(text=m.content)],
            )
            for m in messages
        ]
        config = types.GenerateContentConfig(system_instruction=system or None)

        usage = Usage()
        response = await self._client.aio.models.generate_content_stream(
            model=self._model, contents=contents, config=config
        )
        async for chunk in response:
            if chunk.text:
                yield StreamEvent(text=chunk.text)
            # token chỉ có đầy đủ ở chunk cuối, nên cứ ghi đè dần
            meta = chunk.usage_metadata
            if meta:
                usage = Usage(
                    input_tokens=meta.prompt_token_count or 0,
                    output_tokens=meta.candidates_token_count or 0,
                )
        yield StreamEvent(usage=usage)
