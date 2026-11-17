"""Thông báo lỗi hai ngôn ngữ (Việt / Anh) mà người dùng nhìn thấy.

Trình duyệt gửi kèm header `X-Lang: en|vi`. Middleware ghi ngôn ngữ đó vào một
`ContextVar`, và mỗi thông báo (`Msg`) chọn đúng bản dịch vào lúc nó được chuyển
thành chuỗi. Nhờ vậy code sâu bên trong (kiểm tra link, giải nén zip...) vẫn ném
lỗi bình thường mà không phải biết gì về ngôn ngữ của người dùng.

Không có header thì mặc định là tiếng Việt, ngôn ngữ gốc của dự án.
"""
from contextvars import ContextVar

lang_var: ContextVar[str] = ContextVar("lang", default="vi")


class Msg:
    """Một thông báo có cả bản Việt và bản Anh. `{tên}` trong chuỗi được thay bằng tham số."""

    __slots__ = ("vi", "en", "params")

    def __init__(self, vi: str, en: str, **params: object):
        self.vi = vi
        self.en = en
        self.params = params

    def __str__(self) -> str:
        text = self.en if lang_var.get() == "en" else self.vi
        return text.format(**self.params) if self.params else text

    def __repr__(self) -> str:
        return f"Msg({self.vi!r})"


class LangMiddleware:
    """Đọc `X-Lang` của mỗi request. Viết dạng ASGI thuần để ContextVar đi theo cả luồng SSE."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw = dict(scope["headers"]).get(b"x-lang", b"").decode("latin-1").strip().lower()
        token = lang_var.set(raw if raw in ("en", "vi") else "vi")
        try:
            await self.app(scope, receive, send)
        finally:
            lang_var.reset(token)


# --- các thông báo dùng ở nhiều nơi ---

REPO_NOT_FOUND = Msg(
    "Chưa có repo này, hãy thêm nó trước.",
    "This repo hasn't been added yet. Add it first.",
)
