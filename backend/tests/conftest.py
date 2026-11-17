import pytest

from app import ratelimit


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    # bộ đếm giới hạn nằm trong bộ nhớ và dùng chung giữa các test, nên phải xóa mỗi lần
    ratelimit.reset_all()
    yield
    ratelimit.reset_all()
