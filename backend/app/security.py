"""Thêm các header bảo mật vào mọi phản hồi của API."""
from starlette.types import ASGIApp, Message, Receive, Scope, Send

HEADERS = [
    (b"x-content-type-options", b"nosniff"),  # trình duyệt không được tự đoán kiểu nội dung
    (b"x-frame-options", b"DENY"),  # không cho nhúng API vào iframe của trang khác
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),  # nội dung repo và câu trả lời không nên bị cache trung gian
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
]


class SecurityHeadersMiddleware:
    # viết dạng ASGI thuần (không dùng BaseHTTPMiddleware) để không làm hỏng luồng SSE
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message["headers"]}
                message["headers"] = [*message["headers"], *[h for h in HEADERS if h[0] not in present]]
            await send(message)

        await self.app(scope, receive, send_with_headers)
