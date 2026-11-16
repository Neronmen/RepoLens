"""Tìm và kiểm chứng các trích dẫn `[đường/dẫn/file.py:12-34]` trong câu trả lời.

Model rất hay "nhớ nhầm" số dòng hoặc bịa ra file không có thật. Vì vậy mình
không tin thẳng mà đối chiếu từng trích dẫn với database: file có tồn tại
không, khoảng dòng có nằm trong file không, và agent đã thật sự mở file đó
trong lúc tìm hiểu chưa.
"""
import re
import sqlite3
from urllib.parse import quote

# ví dụ khớp: [src/app.py:10-20] hoặc [README.md:5]
_CITATION = re.compile(r"\[([\w./@+\-]+):(\d+)(?:-(\d+))?\]")
MAX_CITATIONS = 30


def extract_citations(answer: str) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for m in _CITATION.finditer(answer):
        start = int(m[2])
        end = int(m[3]) if m[3] else start
        item = (m[1], min(start, end), max(start, end))
        if item not in found:
            found.append(item)
    return found[:MAX_CITATIONS]


def check_citations(
    conn: sqlite3.Connection, repo_id: int, answer: str, seen_paths: set[str]
) -> list[dict]:
    repo = conn.execute("SELECT owner, name FROM repos WHERE id = ?", (repo_id,)).fetchone()
    out = []
    for path, start, end in extract_citations(answer):
        row = conn.execute(
            "SELECT line_count FROM files WHERE repo_id = ? AND path = ?", (repo_id, path)
        ).fetchone()
        valid = row is not None and 1 <= start and end <= row["line_count"]
        item = {
            "path": path,
            "start_line": start,
            "end_line": end,
            # valid: file và khoảng dòng có thật
            "valid": valid,
            # seen: agent đã thấy file này qua công cụ, không phải đoán mò
            "seen": path in seen_paths,
            "url": None,
        }
        if valid and repo:
            anchor = f"#L{start}" if start == end else f"#L{start}-L{end}"
            item["url"] = (
                f"https://github.com/{repo['owner']}/{repo['name']}/blob/HEAD/{quote(path)}{anchor}"
            )
        out.append(item)
    return out
