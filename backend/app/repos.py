"""Các endpoint làm việc với repo: thêm repo, xem danh sách, tìm trong code."""
import logging
import sqlite3
import threading
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app import embeddings
from app.config import get_settings
from app.db import connect, get_db
from app.search import hybrid_search
from app.i18n import REPO_NOT_FOUND, Msg
from app.ingest.chunker import split_lines
from app.ingest.github import RepoError, download_zip, parse_repo_url
from app.ingest.service import index_repo
from app.ratelimit import ask_global, ask_limiter, index_global, index_limiter, read_limiter

MAX_FILE_WINDOW = 400

log = logging.getLogger("repolens.repos")
router = APIRouter(prefix="/api/repos", dependencies=[Depends(read_limiter)])

_ingest_slot = threading.BoundedSemaphore(1)

Downloader = Callable[[str, str], bytes]


def get_downloader() -> Downloader:
    # tách ra thành dependency để test thay bằng hàm giả, khỏi gọi GitHub thật
    return download_zip


class AddRepoRequest(BaseModel):
    url: str = Field(min_length=1, max_length=300)


def _embed_later(repo_id: int) -> None:
    """Tạo vector ở luồng nền, để người dùng vào hỏi được ngay mà không phải chờ.

    Trong lúc chờ, tìm từ khóa vẫn chạy; vector xong thì tìm theo nghĩa tự bật lên.
    """
    if embeddings.get_embedder() is None:
        return

    def work() -> None:
        conn = connect(get_settings().db_path)
        try:
            n = embeddings.embed_repo(conn, repo_id)
            log.info("Repo %s: đã tạo vector cho %d đoạn", repo_id, n)
        except Exception:  # noqa: BLE001  việc nền không được làm sập server
            log.exception("Tạo vector cho repo %s bị lỗi", repo_id)
        finally:
            conn.close()

    threading.Thread(target=work, name=f"embed-{repo_id}", daemon=True).start()


def _require_repo(conn: sqlite3.Connection, repo_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM repos WHERE id = ?", (repo_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=str(REPO_NOT_FOUND))
    return row


# Lưu ý: các endpoint ở đây là `def` thường (không async) để FastAPI tự chạy
# chúng trong threadpool. Tải zip và ghi SQLite đều là việc chặn luồng.
@router.post("", status_code=201, dependencies=[Depends(index_limiter), Depends(index_global)])
def add_repo(
    req: AddRepoRequest,
    conn: sqlite3.Connection = Depends(get_db),
    download: Downloader = Depends(get_downloader),
):
    try:
        owner, name = parse_repo_url(req.url)
    except RepoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Mỗi lần lập chỉ mục có thể giữ cả trăm MB trong RAM (file zip + nội dung
    # đã giải nén). Server free chỉ có khoảng 512MB nên chỉ cho chạy từng cái một.
    if not _ingest_slot.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail=str(
                Msg(
                    "Server đang lập chỉ mục một repo khác, đợi chút rồi thử lại nhé.",
                    "The server is indexing another repo, wait a moment and try again.",
                )
            ),
            headers={"Retry-After": "15"},
        )
    try:
        stats = index_repo(conn, owner, name, download(owner, name))
    except RepoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except sqlite3.OperationalError as e:
        # thường là "database is locked" khi có tiến trình khác đang ghi
        log.warning("Không ghi được database: %s", e)
        raise HTTPException(
            status_code=503,
            detail=str(Msg("Server đang bận, thử lại sau nhé.", "The server is busy, please try again later.")),
        ) from e
    finally:
        _ingest_slot.release()
    _embed_later(stats.repo_id)
    return {
        "id": stats.repo_id,
        "owner": owner,
        "name": name,
        "file_count": stats.file_count,
        "chunk_count": stats.chunk_count,
        "skipped": stats.skipped,
    }


@router.get("")
def list_repos(conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        "SELECT id, owner, name, indexed_at, file_count, chunk_count"
        " FROM repos ORDER BY indexed_at DESC LIMIT 100"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/by-name/{owner}/{name}")
def find_repo(owner: str, name: str, conn: sqlite3.Connection = Depends(get_db)):
    """Tìm repo đã lập chỉ mục theo tên. Mở lại một cuộc trò chuyện cũ cần nó, vì id đổi sau mỗi lần server khởi động lại."""
    row = conn.execute("SELECT id FROM repos WHERE owner = ? AND name = ?", (owner, name)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=str(REPO_NOT_FOUND))
    return get_repo(row["id"], conn)


@router.get("/{repo_id}")
def get_repo(repo_id: int, conn: sqlite3.Connection = Depends(get_db)):
    # để trang hỏi đáp tải lại được mà không cần nhớ thông tin repo ở trình duyệt
    row = _require_repo(conn, repo_id)
    info = {k: row[k] for k in ("id", "owner", "name", "indexed_at", "file_count", "chunk_count")}
    # giao diện dùng cờ này để báo "đang tìm theo nghĩa" hay mới chỉ tìm từ khóa
    info["semantic"] = embeddings.has_vectors(conn, repo_id)
    return info


@router.get("/{repo_id}/file")
def read_file(
    repo_id: int,
    path: str = Query(min_length=1, max_length=500),
    start: int = Query(default=1, ge=1),
    end: int | None = Query(default=None, ge=1),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Trả về một khoảng dòng của file, cho khung xem code ở giao diện."""
    _require_repo(conn, repo_id)
    row = conn.execute(
        "SELECT path, language, content FROM files WHERE repo_id = ? AND path = ?",
        (repo_id, path),
    ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404, detail=str(Msg("Không có file này trong repo.", "That file isn't in this repo."))
        )

    lines = split_lines(row["content"])
    if start > len(lines):
        raise HTTPException(
            status_code=416,
            detail=str(Msg("File chỉ có {n} dòng.", "The file only has {n} lines.", n=len(lines))),
        )
    # giới hạn số dòng mỗi lần để một request không kéo về cả file khổng lồ
    last = min(end or start + MAX_FILE_WINDOW - 1, start + MAX_FILE_WINDOW - 1, len(lines))
    last = max(last, start)
    return {
        "path": row["path"],
        "language": row["language"],
        "line_count": len(lines),
        "start_line": start,
        "end_line": last,
        "lines": lines[start - 1:last],
    }


@router.get("/{repo_id}/files")
def list_files(repo_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _require_repo(conn, repo_id)
    rows = conn.execute(
        "SELECT path, language, line_count FROM files WHERE repo_id = ? ORDER BY path",
        (repo_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# tìm kiếm gọi cả API embedding nên tính như một lượt hỏi, không để gọi tự do
@router.get("/{repo_id}/search", dependencies=[Depends(ask_limiter), Depends(ask_global)])
def search(
    repo_id: int,
    q: str = Query(min_length=1, max_length=300),
    limit: int = Query(default=8, ge=1, le=20),
    conn: sqlite3.Connection = Depends(get_db),
):
    _require_repo(conn, repo_id)
    return hybrid_search(conn, repo_id, q, limit)
