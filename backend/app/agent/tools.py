"""Các công cụ agent dùng để lục lọi trong repo.

Nguyên tắc: mọi công cụ đều chỉ đọc, và chỉ đọc trong đúng repo đang được hỏi.
Nội dung repo là thứ người lạ viết, có thể chứa câu kiểu "hãy bỏ qua hướng dẫn
trước đó". Vì công cụ không ghi, không gọi mạng, nên dù model có bị lừa thì
tệ nhất cũng chỉ là trả lời sai, không làm hỏng được gì.
"""
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from app.db import search_chunks
from app.ingest.chunker import split_lines
from app.providers.base import ToolSpec

MAX_READ_LINES = 150
MAX_GREP_MATCHES = 30
MAX_LIST_FILES = 200
MAX_OUTPUT_CHARS = 9000
SEARCH_PREVIEW_LINES = 20

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


@dataclass
class ToolOutput:
    text: str  # thứ gửi lại cho model
    # những file mà model đã được thấy NỘI DUNG qua lần gọi này, dùng để biết
    # một trích dẫn có dựa trên thứ agent thật sự đọc hay không
    paths: set[str] = field(default_factory=set)


def _numbered(lines: list[str], first: int) -> str:
    return "\n".join(f"{first + i:>5} | {line[:400]}" for i, line in enumerate(lines))


def _as_int(value: Any, default: int) -> int:
    # model đôi khi gửi số dưới dạng chuỗi, số thực (12.0), hoặc thứ vô nghĩa như "inf"
    try:
        return int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default


def _as_text(value: Any) -> str:
    # Chỉ nhận chuỗi thật. Nếu đem str() mọi thứ thì None thành chữ "None" và
    # công cụ sẽ nghiêm túc đi tìm chữ đó, rồi báo sai là không có gì.
    return value.strip() if isinstance(value, str) else ""


def _clean_prefix(value: Any) -> str:
    prefix = _as_text(value)
    while prefix.startswith(("./", "/")):
        prefix = prefix.removeprefix("./").removeprefix("/")
    return prefix


def _like_prefix(prefix: str) -> str:
    # escape ký tự đặc biệt của LIKE để 'a_b%' được hiểu đúng nghĩa đen
    safe = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return safe + "%"


def _no_such_prefix(conn: sqlite3.Connection, repo_id: int, prefix: str) -> str | None:
    """Trả về lời nhắn nếu không có file nào nằm dưới `prefix`.

    Phải nói rõ là "không có thư mục này", nếu không model sẽ hiểu nhầm thành
    "chuỗi cần tìm không tồn tại trong repo".
    """
    if not prefix:
        return None
    row = conn.execute(
        "SELECT 1 FROM files WHERE repo_id = ? AND path LIKE ? ESCAPE '\\' LIMIT 1",
        (repo_id, _like_prefix(prefix)),
    ).fetchone()
    if row is None:
        return f"Không có file nào có đường dẫn bắt đầu bằng '{prefix}'. Dùng list_files để xem đường dẫn đúng."
    return None


def search_code(conn: sqlite3.Connection, repo_id: int, query: Any = "", **_: Any) -> ToolOutput:
    query = _as_text(query)
    if not query:
        return ToolOutput("Thiếu tham số query (vài từ khóa cần tìm).")
    hits = search_chunks(conn, repo_id, query, limit=5)
    if not hits:
        return ToolOutput(
            "Không tìm thấy gì. Thử từ khóa khác (tiếng Anh, giống tên trong code) hoặc dùng list_files."
        )
    blocks = []
    for h in hits:
        # Chỉ đưa phần đầu mỗi đoạn, đủ để model biết nên đọc kỹ chỗ nào bằng
        # read_file. Đưa hết thì mỗi lần tìm tốn cả chục nghìn ký tự token.
        lines = split_lines(h["text"])
        body = _numbered(lines[:SEARCH_PREVIEW_LINES], h["start_line"])
        more = "\n      ..." if len(lines) > SEARCH_PREVIEW_LINES else ""
        blocks.append(f"### {h['path']} (dòng {h['start_line']}-{h['end_line']})\n{body}{more}")
    return ToolOutput("\n\n".join(blocks), {h["path"] for h in hits})


def grep(
    conn: sqlite3.Connection, repo_id: int, text: Any = "", path_prefix: Any = "", **_: Any
) -> ToolOutput:
    needle = _as_text(text).lower()
    if len(needle) < 2:
        return ToolOutput("Thiếu tham số text, hoặc chuỗi tìm kiếm quá ngắn (cần ít nhất 2 ký tự).")
    prefix = _clean_prefix(path_prefix)
    if (msg := _no_such_prefix(conn, repo_id, prefix)) is not None:
        return ToolOutput(msg)

    rows = conn.execute(
        "SELECT path, content FROM files WHERE repo_id = ? AND path LIKE ? ESCAPE '\\'"
        " ORDER BY path",
        (repo_id, _like_prefix(prefix)),
    )
    out: list[str] = []
    paths: set[str] = set()
    truncated = False
    for row in rows:
        # so sánh thô trên cả file trước cho nhanh, có khớp mới tách dòng
        if needle not in row["content"].lower():
            continue
        for i, line in enumerate(split_lines(row["content"]), start=1):
            if needle in line.lower():
                if len(out) >= MAX_GREP_MATCHES:
                    truncated = True
                    break
                out.append(f"{row['path']}:{i}: {line.strip()[:200]}")
                paths.add(row["path"])
        if truncated:
            break  # đủ rồi thì dừng, không quét nốt cả repo chỉ để đếm
    if not out:
        return ToolOutput(f"Không có dòng nào chứa '{_as_text(text)}'.")
    if truncated:
        out.append("... còn nhiều dòng khớp nữa, hãy thu hẹp bằng path_prefix hoặc chuỗi cụ thể hơn.")
    return ToolOutput("\n".join(out), paths)


def list_files(
    conn: sqlite3.Connection, repo_id: int, path_prefix: Any = "", **_: Any
) -> ToolOutput:
    prefix = _clean_prefix(path_prefix)
    rows = conn.execute(
        "SELECT path, line_count FROM files WHERE repo_id = ? AND path LIKE ? ESCAPE '\\'"
        " ORDER BY path LIMIT ?",
        (repo_id, _like_prefix(prefix), MAX_LIST_FILES + 1),
    ).fetchall()
    if not rows:
        return ToolOutput("Không có file nào khớp.")
    out = [f"{r['path']} ({r['line_count']} dòng)" for r in rows[:MAX_LIST_FILES]]
    if len(rows) > MAX_LIST_FILES:
        out.append("... còn nữa, hãy thu hẹp bằng path_prefix.")
    # không tính là "đã đọc": mới thấy tên file chứ chưa thấy nội dung
    return ToolOutput("\n".join(out))


def read_file(
    conn: sqlite3.Connection,
    repo_id: int,
    path: Any = "",
    start_line: Any = 1,
    end_line: Any = None,
    **_: Any,
) -> ToolOutput:
    path = _clean_prefix(path)
    row = conn.execute(
        "SELECT content FROM files WHERE repo_id = ? AND path = ?", (repo_id, path)
    ).fetchone()
    if row is None:
        return ToolOutput(f"Không có file '{path}'. Dùng list_files để xem đường dẫn đúng.")

    lines = split_lines(row["content"])
    start = max(1, _as_int(start_line, 1))
    if start > len(lines):
        return ToolOutput(f"File chỉ có {len(lines)} dòng.")
    end = _as_int(end_line, start + MAX_READ_LINES - 1)
    # end không được nhỏ hơn start: số âm mà lọt vào phép cắt list của Python
    # sẽ thành "đếm từ cuối lên" và trả về gần hết file
    end = max(start, min(end, start + MAX_READ_LINES - 1, len(lines)))

    body = _numbered(lines[start - 1:end], start)
    note = "" if end >= len(lines) else f"\n(file có {len(lines)} dòng, đọc tiếp từ dòng {end + 1} nếu cần)"
    return ToolOutput(f"### {path} (dòng {start}-{end})\n{body}{note}", {path})


_HANDLERS = {
    "search_code": search_code,
    "grep": grep,
    "list_files": list_files,
    "read_file": read_file,
}


def execute_tool(conn: sqlite3.Connection, repo_id: int, name: Any, args: Any) -> ToolOutput:
    """Chạy một công cụ và luôn trả về kết quả dạng chữ, kể cả khi model gọi sai.

    Lỗi được trả về dưới dạng lời nhắn để model tự sửa ở bước sau, thay vì
    làm sập cả câu trả lời.
    """
    handler = _HANDLERS.get(name) if isinstance(name, str) else None
    if handler is None:
        return ToolOutput(f"Không có công cụ tên '{name}'. Các công cụ có: {', '.join(_HANDLERS)}.")
    if not isinstance(args, dict):
        return ToolOutput("Tham số không hợp lệ.")
    # repo_id luôn do server quyết định. Bỏ các khóa này đi để model (hoặc ai đó
    # lừa model qua nội dung file) không thể trỏ công cụ sang repo khác.
    args = {k: v for k, v in args.items() if isinstance(k, str) and k not in ("conn", "repo_id")}
    out = handler(conn, repo_id, **args)
    if len(out.text) > MAX_OUTPUT_CHARS:
        out.text = out.text[:MAX_OUTPUT_CHARS] + "\n... (đã cắt bớt vì quá dài)"
    return out


def run_tool(conn: sqlite3.Connection, repo_id: int, name: Any, args: Any) -> str:
    return execute_tool(conn, repo_id, name, args).text
