"""Giới hạn số lượt gọi theo từng địa chỉ IP.

Bản deploy công khai dùng khóa Gemini miễn phí của người làm dự án. Nếu không có
giới hạn này thì chỉ cần một vòng lặp là đốt hết hạn mức của cả ngày.

Mình đếm trong bộ nhớ (cửa sổ trượt) thay vì dùng Redis: server free chỉ chạy một
tiến trình, và mất bộ đếm khi server khởi động lại thì cũng chấp nhận được.
"""
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request

from app.config import get_settings
from app.i18n import Msg

_MAX_TRACKED_KEYS = 10_000


class RateLimiter:
    def __init__(
        self,
        limit: Callable[[], int],
        window_s: float = 3600.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._limit = limit
        self._window = window_s
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> float | None:
        """Ghi nhận một lượt gọi. Trả về số giây phải chờ nếu đã hết lượt, ngược lại trả None."""
        now = self._clock()
        limit = self._limit()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self._window:
            hits.popleft()

        if len(hits) >= limit:
            return max(1.0, self._window - (now - hits[0]))
        hits.append(now)

        if len(self._hits) > _MAX_TRACKED_KEYS:
            self._purge(now)
        return None

    def _purge(self, now: float) -> None:
        # dọn các IP đã lâu không quay lại, không thì bộ nhớ phình mãi
        for k in [k for k, h in self._hits.items() if not h or now - h[-1] >= self._window]:
            del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()

    def __call__(self, request: Request) -> None:
        wait = self.check(client_ip(request))
        if wait is not None:
            raise HTTPException(
                status_code=429,
                detail=str(
                    Msg(
                        "Bạn đã dùng hết lượt miễn phí trong giờ này, hãy quay lại sau nhé.",
                        "You've used up your free requests for this hour, please come back later.",
                    )
                ),
                headers={"Retry-After": str(int(wait))},
            )


class GlobalLimiter(RateLimiter):
    """Cùng cơ chế nhưng đếm chung cho mọi người dùng."""

    def __call__(self, request: Request) -> None:
        wait = self.check("*")
        if wait is not None:
            raise HTTPException(
                status_code=429,
                detail=str(
                    Msg(
                        "Hệ thống đang quá tải lượt dùng miễn phí, hãy thử lại sau ít phút.",
                        "The free service is at capacity right now, please try again in a few minutes.",
                    )
                ),
                headers={"Retry-After": str(int(wait))},
            )


def client_ip(request: Request) -> str:
    # Sau reverse proxy (Render, Vercel...) địa chỉ thật nằm ở X-Forwarded-For.
    # Chỉ tin header này khi được bật rõ ràng, nếu không ai cũng giả mạo IP để né giới hạn.
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


ask_limiter = RateLimiter(lambda: get_settings().ask_limit_per_hour)
index_limiter = RateLimiter(lambda: get_settings().index_limit_per_hour)


login_limiter = RateLimiter(lambda: 30)
read_limiter = RateLimiter(lambda: get_settings().read_limit_per_hour)
ask_global = GlobalLimiter(lambda: get_settings().ask_global_per_hour)
index_global = GlobalLimiter(lambda: get_settings().index_global_per_hour)


def reset_all() -> None:
    for limiter in (login_limiter, ask_limiter, index_limiter, read_limiter, ask_global, index_global):
        limiter.reset()
