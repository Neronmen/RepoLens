"""Gom các sự kiện của agent thành một "lượt hỏi đáp" để lưu lại.

Hình dạng khớp với `Turn` ở frontend (features/chat/turns.ts), nên khi mở lại lịch sử
giao diện đọc thẳng được mà không phải chuyển đổi.
"""
from typing import Any


class TurnRecorder:
    def __init__(self, question: str):
        self.question = question
        self.notes: list[str] = []
        self.steps: list[dict[str, Any]] = []
        self.answer = ""
        self.citations: list[Any] = []
        self.usage: dict[str, Any] | None = None
        self.error: str | None = None
        self.finished = False

    def feed(self, event: str, data: dict[str, Any]) -> None:
        if event == "token":
            self.answer += data.get("text", "")
        elif event == "preamble":
            # chữ vừa stream hóa ra chỉ là lời dẫn (hoặc phần dở bị chạy lại): bỏ khỏi câu trả lời
            text = (data.get("text") or "").strip()
            if text:
                self.notes.append(text)
            self.answer = ""
        elif event == "tool_call":
            self.steps.append(
                {"id": data["id"], "name": data["name"], "args": data.get("args", {}), "status": "running"}
            )
        elif event == "tool_result":
            for s in self.steps:
                if s["id"] == data["id"]:
                    s.update(status="done", ms=data.get("ms"), chars=data.get("chars"), preview=data.get("preview"))
        elif event == "citations":
            self.citations = data.get("items", [])
        elif event == "usage":
            self.usage = data
        elif event == "error":
            self.error = data.get("message")
        elif event == "done":
            self.finished = True

    def build(self) -> dict[str, Any]:
        if self.error:
            status = "error"
        elif self.finished:
            status = "done"
        else:
            status = "stopped"  # kết nối đứt hoặc người dùng đóng tab giữa chừng
        return {
            "question": self.question,
            "status": status,
            "notes": self.notes,
            "steps": self.steps,
            "answer": self.answer,
            "citations": self.citations,
            "usage": self.usage,
            "error": self.error,
        }
