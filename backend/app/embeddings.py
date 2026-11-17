"""Vector hóa các đoạn code để tìm theo nghĩa, bổ sung cho tìm từ khóa FTS5.

Vector được lưu ngay trong SQLite (mỗi đoạn một BLOB float32) và so sánh bằng
Python thuần. Repo cỡ vài nghìn đoạn thì quét hết chỉ mất vài chục mili giây,
nên mình chưa cần dựng một dịch vụ vector riêng. Nếu repo lớn hơn nhiều thì
mới là lúc nghĩ tới chỉ mục xấp xỉ (HNSW...).

Mọi thứ ở đây là "cố gắng hết sức": hết hạn mức, mất mạng hay thiếu key thì
chỉ mất phần tìm theo nghĩa, tìm từ khóa vẫn chạy bình thường.
"""
import logging
import math
import sqlite3
import time
from array import array
from typing import Protocol

from app.config import get_settings

log = logging.getLogger("repolens.embeddings")

DIMENSIONS = 256  # đủ để phân biệt đoạn code, và vector nhỏ nên SQLite nhẹ
BATCH_SIZE = 100  # giới hạn của API cho mỗi lần gọi
MAX_EMBED_CHUNKS = 1500  # trần để một repo lớn không ngốn hết hạn mức miễn phí
MAX_TEXT_CHARS = 2000
RETRY_DELAYS = (3.0, 15.0)


class Embedder(Protocol):
    def embed(self, texts: list[str], *, query: bool) -> list[list[float]]: ...


class GeminiEmbedder:
    def __init__(self, api_key: str, model: str):
        from google import genai
        from google.genai import types

        self._types = types
        self._client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=30_000))
        self._model = model

    def embed(self, texts: list[str], *, query: bool) -> list[list[float]]:
        # Gemini phân biệt "câu hỏi" và "tài liệu": ghép đúng cặp thì kết quả khớp tốt hơn
        config = self._types.EmbedContentConfig(
            task_type="CODE_RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT",
            output_dimensionality=DIMENSIONS,
        )
        last: Exception | None = None
        for delay in (*RETRY_DELAYS, None):
            try:
                resp = self._client.models.embed_content(model=self._model, contents=texts, config=config)
                return [normalize(list(e.values or [])) for e in resp.embeddings or []]
            except Exception as e:  # noqa: BLE001  429 hay lỗi mạng đều xử lý như nhau
                last = e
                if delay is not None:
                    time.sleep(delay)
        raise last  # type: ignore[misc]


def get_embedder() -> Embedder | None:
    """Trả về None nếu chưa có key. Tách riêng để test thay bằng bản giả."""
    s = get_settings()
    if not s.gemini_api_key or s.search_mode == "keyword":
        return None
    return GeminiEmbedder(s.gemini_api_key, s.embed_model)


def normalize(vec: list[float]) -> list[float]:
    # Gemini chỉ tự chuẩn hóa ở số chiều đầy đủ; ta cắt còn 256 chiều nên phải tự làm.
    # Sau đó độ giống nhau chỉ cần phép nhân vô hướng.
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm else vec


def pack(vec: list[float]) -> bytes:
    return array("f", vec).tobytes()


def unpack(blob: bytes) -> array:
    a = array("f")
    a.frombytes(blob)
    return a


def _doc_text(path: str, text: str) -> str:
    # đưa cả đường dẫn vào, vì tên file thường là manh mối rõ nhất về nội dung
    return f"{path}\n{text}"[:MAX_TEXT_CHARS]


def embed_repo(conn: sqlite3.Connection, repo_id: int, embedder: Embedder | None = None) -> int:
    """Tạo vector cho các đoạn của repo, trả về số đoạn đã có vector.

    Làm theo từng lô và commit từng lô, nên hết hạn mức giữa chừng thì phần đã làm vẫn dùng được.
    """
    embedder = embedder or get_embedder()
    if embedder is None:
        return 0
    rows = conn.execute(
        "SELECT id, path, text FROM chunks WHERE repo_id = ? AND id NOT IN"
        " (SELECT chunk_id FROM chunk_vectors WHERE repo_id = ?) ORDER BY id LIMIT ?",
        (repo_id, repo_id, MAX_EMBED_CHUNKS),
    ).fetchall()
    done = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        try:
            vecs = embedder.embed([_doc_text(r["path"], r["text"]) for r in batch], query=False)
        except Exception as e:  # noqa: BLE001
            log.warning("Dừng tạo vector sau %d đoạn: %s", done, e)
            break
        if len(vecs) != len(batch):
            log.warning("API trả về %d vector cho %d đoạn, bỏ lô này", len(vecs), len(batch))
            break
        try:
            with conn:
                conn.executemany(
                    "INSERT OR REPLACE INTO chunk_vectors (chunk_id, repo_id, vec) VALUES (?, ?, ?)",
                    [(r["id"], repo_id, pack(v)) for r, v in zip(batch, vecs, strict=True)],
                )
        except sqlite3.Error as e:
            # thường là repo vừa bị lập chỉ mục lại nên các đoạn này không còn nữa
            log.warning("Không lưu được vector: %s", e)
            break
        done += len(batch)
    return done


def has_vectors(conn: sqlite3.Connection, repo_id: int) -> bool:
    return conn.execute("SELECT 1 FROM chunk_vectors WHERE repo_id = ? LIMIT 1", (repo_id,)).fetchone() is not None


def vector_search(conn: sqlite3.Connection, repo_id: int, query_vec: list[float], limit: int) -> list[int]:
    """Trả về id các đoạn giống câu hỏi nhất, giống nhất đứng đầu."""
    q = array("f", query_vec)
    scored = []
    for row in conn.execute("SELECT chunk_id, vec FROM chunk_vectors WHERE repo_id = ?", (repo_id,)):
        v = unpack(row["vec"])
        if len(v) != len(q):
            continue
        scored.append((sum(map(float.__mul__, q, v)), row["chunk_id"]))
    scored.sort(reverse=True)
    return [cid for _, cid in scored[:limit]]
