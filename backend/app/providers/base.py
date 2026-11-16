"""Giao diện chung cho các nhà cung cấp LLM.

Ý tưởng: phần còn lại của app chỉ biết đến `LLMProvider`, nên sau này muốn
đổi từ Gemini sang Claude hay model khác thì chỉ cần viết thêm một lớp mới.
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass
class Message:
    role: Literal["user", "assistant"]
    content: str


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class StreamEvent:
    """Một mẩu dữ liệu trong lúc model đang trả lời.

    Hoặc là `text` (một đoạn chữ mới), hoặc là `usage` (báo cáo token ở cuối).
    """
    text: str = ""
    usage: Usage | None = None


class LLMProvider(Protocol):
    def stream(
        self, messages: list[Message], system: str = ""
    ) -> AsyncIterator[StreamEvent]: ...
