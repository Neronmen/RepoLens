"""Lưu repo đã lập chỉ mục vào SQLite và tìm kiếm bằng FTS5.

Mình chọn SQLite vì deploy miễn phí rất dễ (một file, không cần server riêng),
và FTS5 có sẵn bm25 để xếp hạng kết quả nên chưa cần đến vector database.
"""
import re
import sqlite3
from collections.abc import Iterator
from pathlib import Path

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS repos (
    id          INTEGER PRIMARY KEY,
    owner       TEXT NOT NULL,
    name        TEXT NOT NULL,
    indexed_at  TEXT NOT NULL DEFAULT (datetime('now')),
    file_count  INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (owner, name)
);

CREATE TABLE IF NOT EXISTS files (
    id         INTEGER PRIMARY KEY,
    repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    language   TEXT NOT NULL,
    line_count INTEGER NOT NULL,
    UNIQUE (repo_id, path)
);

CREATE TABLE IF NOT EXISTS chunks (
    id         INTEGER PRIMARY KEY,
    repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line   INTEGER NOT NULL,
    text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);

-- rowid của bảng FTS chính là chunks.id, nhờ vậy xóa và join đều nhanh
-- tokenizer mặc định tách ở dấu gạch dưới, nên login_user khớp được với "login"
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, path);
"""


def connect(path: Path | str) -> sqlite3.Connection:
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    # FastAPI chạy endpoint sync trong threadpool nên cần cho phép khác thread
    # timeout: nếu đang có request khác ghi thì chờ tối đa 30 giây thay vì báo lỗi ngay
    conn = sqlite3.connect(path, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect(get_settings().db_path)
    try:
        yield conn
    finally:
        conn.close()


# --- tìm kiếm -------------------------------------------------------------

# \w nhận cả chữ có dấu. Nếu chỉ lấy a-z thì "xác thực" bị xé thành "x", "c",
# "th", "c" và tìm ra toàn kết quả rác. \w không chứa dấu nháy nên vẫn an toàn.
_WORD = re.compile(r"\w+")
_CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+")
_STOPWORDS = {"the", "a", "an", "is", "of", "to", "in", "and", "or", "how", "what", "does", "do"}


def build_match_query(question: str, max_terms: int = 12) -> str:
    """Biến câu hỏi thành truy vấn FTS5 an toàn.

    Không bao giờ nhét thẳng chuỗi của người dùng vào MATCH: ký tự như " hay *
    sẽ làm FTS5 báo lỗi cú pháp. Mỗi từ được bọc trong dấu nháy kép, và tên
    kiểu camelCase được tách thêm để loginUser còn khớp được với login, user.
    """
    terms: list[str] = []
    for word in _WORD.findall(question):
        pieces = [word]
        if word.isascii():  # tách camelCase chỉ có nghĩa với tên biến, tên hàm
            pieces += [p for p in _CAMEL.findall(word) if p.lower() != word.lower()]
        for piece in pieces:
            low = piece.lower()
            if len(low) > 1 and low not in _STOPWORDS and low not in terms:
                terms.append(low)
    return " OR ".join(f'"{t}"' for t in terms[:max_terms])


def search_chunks(conn: sqlite3.Connection, repo_id: int, question: str, limit: int = 8) -> list[dict]:
    match = build_match_query(question)
    if not match:
        return []
    rows = conn.execute(
        """
        SELECT c.id, c.path, c.start_line, c.end_line, c.text,
               bm25(chunks_fts, 1.0, 2.0) AS score
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        WHERE chunks_fts MATCH ? AND c.repo_id = ?
        ORDER BY score
        LIMIT ?
        """,
        (match, repo_id, max(1, min(limit, 20))),
    ).fetchall()
    return [dict(r) for r in rows]
