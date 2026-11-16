"""Giao diện chung cho các nhà cung cấp LLM.

Ý tưởng: phần còn lại của app chỉ biết đến `LLMProvider`, nên sau này muốn
đổi từ Gemini sang Claude hay model khác thì chỉ cần viết thêm một lớp mới.
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


class RateLimited(Exception):
    """Nhà cung cấp báo đã hết lượt gọi (HTTP 429). Tách riêng để báo cho người dùng dễ hiểu."""


@dataclass
class ToolSpec:
    """Mô tả một công cụ để model biết khi nào gọi và truyền tham số gì."""
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]
    # Một số model (Gemini 3) gửi kèm một "chữ ký" cho mỗi lần gọi công cụ và
    # bắt mình gửi lại y nguyên ở lượt sau. Mình không cần hiểu nó, chỉ cần giữ.
    signature: bytes | None = None


@dataclass
class ToolResult:
    call_id: str
    name: str
    content: str


@dataclass
class Message:
    """Một lượt trong cuộc hội thoại.

    - user: câu hỏi của người dùng (`content`)
    - assistant: chữ model viết (`content`) và/hoặc các lần gọi công cụ (`tool_calls`)
    - tool: kết quả chạy công cụ trả về cho model (`tool_results`)
    """
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class StreamEvent:
    """Một mẩu dữ liệu trong lúc model đang trả lời.

    Mỗi event chỉ mang một thứ: một đoạn chữ mới (`text`), một yêu cầu gọi
    công cụ (`tool_call`), hoặc báo cáo token ở cuối (`usage`).
    """
    text: str = ""
    tool_call: ToolCall | None = None
    usage: Usage | None = None


class LLMProvider(Protocol):
    def stream(
        self,
        messages: list[Message],
        system: str = "",
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamEvent]: ...
