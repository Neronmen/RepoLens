import pytest

from app import ratelimit


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    # bộ đếm giới hạn nằm trong bộ nhớ và dùng chung giữa các test, nên phải xóa mỗi lần
    ratelimit.reset_all()
    yield
    ratelimit.reset_all()


@pytest.fixture(autouse=True)
def _no_real_embeddings(monkeypatch):
    # test không được gọi API thật dù máy có GEMINI_API_KEY trong .env
    monkeypatch.setattr("app.embeddings.get_embedder", lambda: None)


@pytest.fixture(autouse=True)
def _no_pause_between_embedding_batches(monkeypatch):
    monkeypatch.setattr("app.embeddings.BATCH_PAUSE", 0)
