"""Tìm và kiểm chứng các trích dẫn `[đường/dẫn/file.py:12-34]` trong câu trả lời.

Model rất hay "nhớ nhầm" số dòng hoặc bịa ra file không có thật. Vì vậy mình
không tin thẳng mà đối chiếu từng trích dẫn với database: file có tồn tại
không, khoảng dòng có nằm trong file không, và agent đã thật sự đọc file đó
trong lúc tìm hiểu chưa.
"""
import re
import sqlite3
from urllib.parse import quote

MAX_CITATIONS = 30

# Một cặp ngoặc vuông, cho phép lồng một tầng để nhận được file kiểu Next.js
# như `app/[id]/page.tsx`. Nội dung bên trong được phân tích kỹ ở bước sau.
_BRACKET = re.compile(r"\[((?:[^\[\]\n]|\[[^\[\]\n]*\]){1,400})\]")

# "đường/dẫn:12-34, 50": đường dẫn có thể chứa ngoặc, $, unicode và dấu cách đơn
_ENTRY = re.compile(
    r"""(?P<path>(?:[^\s,;:`\[\]]|\[[^\[\]\s]*\]|\s(?=[^\s,;:`\[\]]))+)`?\s*:\s*
        (?P<ranges>L?\d{1,7}(?!\d)(?:\s*[-–]\s*L?\d{1,7}(?!\d))?
                   (?:\s*,\s*L?\d{1,7}(?!\d)(?:\s*[-–]\s*L?\d{1,7}(?!\d))?)*)""",
    re.VERBOSE,
)
# (?!\d): số dài quá 7 chữ số thì bỏ cả trích dẫn, đừng cắt lấy 7 chữ số đầu
_RANGE = re.compile(r"L?(\d{1,7})(?!\d)(?:\s*[-–]\s*L?(\d{1,7})(?!\d))?")


def _looks_like_path(path: str) -> bool:
    # loại các thứ như `data[1:2]` hay `[localhost:8080]` bị nhận nhầm
    return "/" in path or "." in path


def extract_citations(
    answer: str, known_paths: set[str] | None = None
) -> list[tuple[str, int, int]]:
    found: dict[tuple[str, int, int], None] = {}  # dict giữ thứ tự và loại trùng nhanh
    for bracket in _BRACKET.finditer(answer):
        for entry in _ENTRY.finditer(bracket[1]):
            path = entry["path"].strip()
            if not (_looks_like_path(path) or (known_paths and path in known_paths)):
                continue
            for r in _RANGE.finditer(entry["ranges"]):
                start = int(r[1])
                end = int(r[2]) if r[2] else start
                found[(path, min(start, end), max(start, end))] = None
                if len(found) >= MAX_CITATIONS:
                    return list(found)
    return list(found)


def check_citations(
    conn: sqlite3.Connection, repo_id: int, answer: str, read_paths: set[str]
) -> list[dict]:
    repo = conn.execute("SELECT owner, name FROM repos WHERE id = ?", (repo_id,)).fetchone()
    lines = {
        r["path"]: r["line_count"]
        for r in conn.execute("SELECT path, line_count FROM files WHERE repo_id = ?", (repo_id,))
    }
    out = []
    for path, start, end in extract_citations(answer, set(lines)):
        valid = path in lines and 1 <= start and end <= lines[path]
        item = {
            "path": path,
            "start_line": start,
            "end_line": end,
            # valid: file và khoảng dòng có thật
            "valid": valid,
            # seen: agent đã đọc nội dung file này qua công cụ, không phải đoán mò
            "seen": path in read_paths,
            "url": None,
        }
        if valid and repo:
            anchor = f"#L{start}" if start == end else f"#L{start}-L{end}"
            # file markdown mà không có ?plain=1 thì GitHub hiển thị bản đã render
            # và #L không nhảy đúng dòng
            plain = "?plain=1" if path.lower().endswith(".md") else ""
            item["url"] = (
                f"https://github.com/{repo['owner']}/{repo['name']}"
                f"/blob/HEAD/{quote(path)}{plain}{anchor}"
            )
        out.append(item)
    return out
