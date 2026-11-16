"""Các công cụ agent dùng để lục lọi trong repo.

Nguyên tắc: mọi công cụ đều chỉ đọc, và chỉ đọc trong đúng repo đang được hỏi.
Nội dung repo là thứ người lạ viết, có thể chứa câu kiểu "hãy bỏ qua hướng dẫn
trước đó". Vì công cụ không ghi, không gọi mạng, nên dù model có bị lừa thì
tệ nhất cũng chỉ là trả lời sai, không làm hỏng được gì.
"""
import sqlite3
from typing import Any

from app.db import search_chunks
from app.ingest.chunker import split_lines
from app.providers.base import ToolSpec

MAX_READ_LINES = 150
MAX_GREP_MATCHES = 30
MAX_LIST_FILES = 200
MAX_OUTPUT_CHARS = 9000

TOOLS = [
    ToolSpec(
        name="search_code",
        description=(
            "Tìm các đoạn code liên quan nhất tới vài từ khóa. Dùng từ khóa tiếng Anh "
            "giống tên hàm, tên biến hay thuật ngữ có thể xuất hiện trong code "
            "(ví dụ: 'verify signature', 'login session'). Đây thường là bước đầu tiên."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Vài từ khóa, cách nhau bằng dấu cách"},
            },
            "required": ["query"],
        },
    ),
    ToolSpec(
        name="grep",
        description=(
            "Tìm chính xác một chuỗi ký tự (không phân biệt hoa thường) trong mọi file, "
            "trả về từng dòng khớp kèm số dòng. Dùng khi đã biết tên cụ thể, ví dụ để "
            "tìm nơi một hàm được định nghĩa hoặc được gọi."
        ),
        parameters={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Chuỗi cần tìm, ví dụ 'def unsign'"},
                "path_prefix": {
                    "type": "string",
                    "description": "Chỉ tìm trong thư mục này (tùy chọn), ví dụ 'src/'",
                },
            },
            "required": ["text"],
        },
    ),
    ToolSpec(
        name="list_files",
        description="Liệt kê các file trong repo kèm số dòng, để nắm cấu trúc dự án.",
        parameters={
            "type": "object",
            "properties": {
                "path_prefix": {
                    "type": "string",
                    "description": "Chỉ liệt kê trong thư mục này (tùy chọn), ví dụ 'src/'",
                },
            },
        },
    ),
    ToolSpec(
        name="read_file",
        description=(
            f"Đọc một file theo khoảng dòng, tối đa {MAX_READ_LINES} dòng mỗi lần. "
            "Luôn đọc code trước khi khẳng định nó làm gì."
        ),
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Đường dẫn file, ví dụ 'src/app.py'"},
                "start_line": {"type": "integer", "description": "Dòng bắt đầu, tính từ 1"},
                "end_line": {"type": "integer", "description": "Dòng kết thúc (gồm cả dòng này)"},
            },
            "required": ["path"],
        },
    ),
]


def _numbered(lines: list[str], first: int) -> str:
    return "\n".join(f"{first + i:>5} | {line[:400]}" for i, line in enumerate(lines))


def _as_int(value: Any, default: int) -> int:
    # model đôi khi gửi số dưới dạng chuỗi hoặc số thực (12.0)
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _like_prefix(prefix: str) -> str:
    # escape ký tự đặc biệt của LIKE để 'a_b%' được hiểu đúng nghĩa đen
    safe = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return safe + "%"


def search_code(conn: sqlite3.Connection, repo_id: int, query: str = "", **_: Any) -> str:
    hits = search_chunks(conn, repo_id, str(query), limit=6)
    if not hits:
        return "Không tìm thấy gì. Thử từ khóa khác (tiếng Anh, giống tên trong code) hoặc dùng list_files."
    blocks = []
    for h in hits:
        body = _numbered(split_lines(h["text"])[:40], h["start_line"])
        blocks.append(f"### {h['path']} (dòng {h['start_line']}-{h['end_line']})\n{body}")
    return "\n\n".join(blocks)


def grep(
    conn: sqlite3.Connection, repo_id: int, text: str = "", path_prefix: str = "", **_: Any
) -> str:
    needle = str(text).strip().lower()
    if len(needle) < 2:
        return "Chuỗi tìm kiếm quá ngắn, cần ít nhất 2 ký tự."
    rows = conn.execute(
        "SELECT path, content FROM files WHERE repo_id = ? AND path LIKE ? ESCAPE '\\'"
        " ORDER BY path",
        (repo_id, _like_prefix(str(path_prefix))),
    )
    out: list[str] = []
    total = 0
    for row in rows:
        # so sánh thô trên cả file trước cho nhanh, có khớp mới tách dòng
        if needle not in row["content"].lower():
            continue
        for i, line in enumerate(split_lines(row["content"]), start=1):
            if needle in line.lower():
                total += 1
                if len(out) < MAX_GREP_MATCHES:
                    out.append(f"{row['path']}:{i}: {line.strip()[:200]}")
    if not out:
        return f"Không có dòng nào chứa '{text}'."
    if total > len(out):
        out.append(f"... còn {total - len(out)} dòng khớp nữa, hãy thu hẹp bằng path_prefix.")
    return "\n".join(out)


def list_files(conn: sqlite3.Connection, repo_id: int, path_prefix: str = "", **_: Any) -> str:
    rows = conn.execute(
        "SELECT path, line_count FROM files WHERE repo_id = ? AND path LIKE ? ESCAPE '\\'"
        " ORDER BY path LIMIT ?",
        (repo_id, _like_prefix(str(path_prefix)), MAX_LIST_FILES + 1),
    ).fetchall()
    if not rows:
        return "Không có file nào khớp."
    out = [f"{r['path']} ({r['line_count']} dòng)" for r in rows[:MAX_LIST_FILES]]
    if len(rows) > MAX_LIST_FILES:
        out.append("... còn nữa, hãy thu hẹp bằng path_prefix.")
    return "\n".join(out)


def read_file(
    conn: sqlite3.Connection,
    repo_id: int,
    path: str = "",
    start_line: Any = 1,
    end_line: Any = None,
    **_: Any,
) -> str:
    row = conn.execute(
        "SELECT content FROM files WHERE repo_id = ? AND path = ?", (repo_id, str(path))
    ).fetchone()
    if row is None:
        return f"Không có file '{path}'. Dùng list_files để xem đường dẫn đúng."

    lines = split_lines(row["content"])
    start = max(1, _as_int(start_line, 1))
    end = _as_int(end_line, start + MAX_READ_LINES - 1)
    end = min(end, start + MAX_READ_LINES - 1, len(lines))
    if start > len(lines):
        return f"File chỉ có {len(lines)} dòng."

    body = _numbered(lines[start - 1:end], start)
    note = "" if end >= len(lines) else f"\n(file có {len(lines)} dòng, đọc tiếp từ dòng {end + 1} nếu cần)"
    return f"### {path} (dòng {start}-{end})\n{body}{note}"


_HANDLERS = {
    "search_code": search_code,
    "grep": grep,
    "list_files": list_files,
    "read_file": read_file,
}


def run_tool(conn: sqlite3.Connection, repo_id: int, name: str, args: dict[str, Any]) -> str:
    """Chạy một công cụ và luôn trả về chuỗi, kể cả khi model gọi sai.

    Lỗi được trả về dưới dạng lời nhắn để model tự sửa ở bước sau, thay vì
    làm sập cả câu trả lời.
    """
    handler = _HANDLERS.get(name)
    if handler is None:
        return f"Không có công cụ tên '{name}'. Các công cụ có: {', '.join(_HANDLERS)}."
    if not isinstance(args, dict):
        return "Tham số không hợp lệ."
    # repo_id luôn do server quyết định. Bỏ các khóa này đi để model (hoặc ai đó
    # lừa model qua nội dung file) không thể trỏ công cụ sang repo khác.
    args = {k: v for k, v in args.items() if k not in ("conn", "repo_id")}
    result = handler(conn, repo_id, **args)
    if len(result) > MAX_OUTPUT_CHARS:
        result = result[:MAX_OUTPUT_CHARS] + "\n... (đã cắt bớt vì quá dài)"
    return result
