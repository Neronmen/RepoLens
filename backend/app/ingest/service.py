"""Đọc file zip của repo, lọc ra các file code rồi lưu vào database."""
import io
import sqlite3
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.ingest.chunker import chunk_text
from app.ingest.github import RepoError

MAX_FILE_BYTES = 200 * 1024
MAX_FILES = 2000
MAX_TOTAL_BYTES = 30 * 1024 * 1024

SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "out", "target", "vendor", "venv",
    ".venv", "__pycache__", ".next", ".nuxt", "coverage", ".idea", ".vscode",
}
SKIP_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "uv.lock", "Cargo.lock", "go.sum",
}
SKIP_SUFFIXES = (".min.js", ".min.css", ".map")

# chỉ nhận những loại file mình biết là chữ, còn lại bỏ qua hết
LANGUAGES = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".go": "go", ".rs": "rust",
    ".java": "java", ".kt": "kotlin", ".rb": "ruby", ".php": "php", ".cs": "csharp",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".swift": "swift",
    ".sql": "sql", ".sh": "shell", ".html": "html", ".css": "css", ".scss": "css",
    ".vue": "vue", ".svelte": "svelte", ".md": "markdown", ".json": "json",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "toml",
}
SPECIAL_FILES = {"Dockerfile": "docker", "Makefile": "make"}


@dataclass
class IndexStats:
    repo_id: int
    file_count: int
    chunk_count: int
    skipped: int


def detect_language(path: PurePosixPath) -> str | None:
    if path.name in SPECIAL_FILES:
        return SPECIAL_FILES[path.name]
    return LANGUAGES.get(path.suffix.lower())


def clean_path(raw: str) -> PurePosixPath | None:
    """Bỏ thư mục gốc `repo-<sha>/` của zip và từ chối đường dẫn đáng ngờ."""
    if "\\" in raw or raw.startswith("/"):
        return None
    parts = PurePosixPath(raw).parts[1:]
    if not parts or any(p in ("..", ".") for p in parts):
        return None
    return PurePosixPath(*parts)


def should_index(path: PurePosixPath) -> bool:
    if any(part in SKIP_DIRS for part in path.parts[:-1]):
        return False
    if path.name in SKIP_NAMES or path.name.endswith(SKIP_SUFFIXES):
        return False
    return detect_language(path) is not None


def read_source_files(zip_bytes: bytes) -> tuple[list[tuple[str, str, str]], int]:
    """Trả về danh sách (đường dẫn, ngôn ngữ, nội dung) và số file bị bỏ qua."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as e:
        raise RepoError("File tải về từ GitHub bị hỏng, thử lại nhé.") from e

    files: list[tuple[str, str, str]] = []
    skipped = 0
    total = 0
    with zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            path = clean_path(info.filename)
            if path is None or not should_index(path) or info.file_size > MAX_FILE_BYTES:
                skipped += 1
                continue
            if len(files) >= MAX_FILES or total >= MAX_TOTAL_BYTES:
                skipped += 1
                continue

            # Kích thước ghi trong zip có thể bị khai gian (zip bomb),
            # nên đọc có giới hạn rồi tự kiểm tra lại.
            with zf.open(info) as f:
                raw = f.read(MAX_FILE_BYTES + 1)
            if len(raw) > MAX_FILE_BYTES or b"\x00" in raw:
                skipped += 1
                continue
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                skipped += 1
                continue

            total += len(raw)
            files.append((str(path), detect_language(path), text))
    return files, skipped


def index_repo(conn: sqlite3.Connection, owner: str, name: str, zip_bytes: bytes) -> IndexStats:
    files, skipped = read_source_files(zip_bytes)
    if not files:
        raise RepoError("Không tìm thấy file code nào đọc được trong repo này.")

    # `with conn` gói tất cả vào một transaction: hỏng giữa chừng thì không lưu dở dang
    with conn:
        row = conn.execute(
            "SELECT id FROM repos WHERE owner = ? AND name = ?", (owner, name)
        ).fetchone()
        if row:
            # lập chỉ mục lại: dọn dữ liệu cũ nhưng giữ nguyên id của repo
            repo_id = row["id"]
            conn.execute(
                "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE repo_id = ?)",
                (repo_id,),
            )
            conn.execute("DELETE FROM files WHERE repo_id = ?", (repo_id,))
        else:
            repo_id = conn.execute(
                "INSERT INTO repos (owner, name) VALUES (?, ?)", (owner, name)
            ).lastrowid

        chunk_count = 0
        for path, language, text in files:
            file_id = conn.execute(
                "INSERT INTO files (repo_id, path, language, line_count) VALUES (?, ?, ?, ?)",
                (repo_id, path, language, text.count("\n") + 1),
            ).lastrowid
            for ch in chunk_text(text):
                chunk_id = conn.execute(
                    "INSERT INTO chunks (repo_id, file_id, path, start_line, end_line, text)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (repo_id, file_id, path, ch.start_line, ch.end_line, ch.text),
                ).lastrowid
                conn.execute(
                    "INSERT INTO chunks_fts (rowid, text, path) VALUES (?, ?, ?)",
                    (chunk_id, ch.text, path),
                )
                chunk_count += 1

        conn.execute(
            "UPDATE repos SET file_count = ?, chunk_count = ?, indexed_at = datetime('now')"
            " WHERE id = ?",
            (len(files), chunk_count, repo_id),
        )
    return IndexStats(
        repo_id=repo_id, file_count=len(files), chunk_count=chunk_count, skipped=skipped
    )
