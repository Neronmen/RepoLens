"""Tìm đoạn code liên quan: trộn kết quả tìm từ khóa (FTS5) và tìm theo nghĩa (embedding).

Hai cách tìm cho điểm theo thang khác nhau (bm25 và độ giống cosine) nên không
cộng điểm trực tiếp được. Mình dùng Reciprocal Rank Fusion: mỗi đoạn được
cộng 1/(60 + hạng) ở từng danh sách. Chỉ cần thứ hạng, không cần chỉnh trọng số.
"""
import logging
import sqlite3

from app import embeddings
from app.config import get_settings
from app.db import search_chunks

log = logging.getLogger("repolens.search")

RRF_K = 60
POOL = 20  # mỗi cách tìm lấy 20 ứng viên rồi mới trộn


def rrf(rankings: list[list[int]]) -> list[int]:
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    # đồng điểm thì lấy id nhỏ hơn để kết quả lặp lại được giữa các lần chạy
    return sorted(scores, key=lambda cid: (-scores[cid], cid))


def _semantic_ids(conn: sqlite3.Connection, repo_id: int, query: str) -> list[int]:
    if not embeddings.has_vectors(conn, repo_id):
        return []
    embedder = embeddings.get_embedder()
    if embedder is None:
        return []
    try:
        (qvec,) = embedder.embed([query], query=True)
    except Exception as e:  # noqa: BLE001  mất mạng hay hết hạn mức thì quay về tìm từ khóa
        log.warning("Không tạo được vector cho câu hỏi: %s", e)
        return []
    return embeddings.vector_search(conn, repo_id, qvec, POOL)


def hybrid_search(
    conn: sqlite3.Connection, repo_id: int, query: str, limit: int = 8, mode: str | None = None
) -> list[dict]:
    mode = mode or get_settings().search_mode
    limit = max(1, min(limit, 20))
    if mode == "keyword":
        return search_chunks(conn, repo_id, query, limit)

    semantic = _semantic_ids(conn, repo_id, query)
    if mode == "vector":
        ranked = semantic
    else:
        keyword = [h["id"] for h in search_chunks(conn, repo_id, query, POOL)]
        ranked = rrf([keyword, semantic]) if semantic else keyword
    ids = ranked[:limit]
    if not ids:
        return []

    marks = ",".join("?" * len(ids))
    rows = {
        r["id"]: dict(r)
        for r in conn.execute(
            f"SELECT id, path, start_line, end_line, text FROM chunks WHERE repo_id = ? AND id IN ({marks})",
            (repo_id, *ids),
        )
    }
    return [rows[i] | {"score": rank} for rank, i in enumerate(ids) if i in rows]
