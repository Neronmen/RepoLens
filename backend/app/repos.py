"""Các endpoint làm việc với repo: thêm repo, xem danh sách, tìm trong code."""
import logging
import sqlite3
import threading
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_db, search_chunks
from app.ingest.github import RepoError, download_zip, parse_repo_url
from app.ingest.service import index_repo

log = logging.getLogger("repolens.repos")
router = APIRouter(prefix="/api/repos")

_ingest_slot = threading.BoundedSemaphore(1)

Downloader = Callable[[str, str], bytes]


def get_downloader() -> Downloader:
    # tách ra thành dependency để test thay bằng hàm giả, khỏi gọi GitHub thật
    return download_zip


class AddRepoRequest(BaseModel):
    url: str = Field(min_length=1, max_length=300)


def _require_repo(conn: sqlite3.Connection, repo_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM repos WHERE id = ?", (repo_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Chưa có repo này, hãy thêm nó trước.")
    return row


# Lưu ý: các endpoint ở đây là `def` thường (không async) để FastAPI tự chạy
# chúng trong threadpool. Tải zip và ghi SQLite đều là việc chặn luồng.
@router.post("", status_code=201)
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
            detail="Server đang lập chỉ mục một repo khác, đợi chút rồi thử lại nhé.",
            headers={"Retry-After": "15"},
        )
    try:
        stats = index_repo(conn, owner, name, download(owner, name))
    except RepoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except sqlite3.OperationalError as e:
        # thường là "database is locked" khi có tiến trình khác đang ghi
        log.warning("Không ghi được database: %s", e)
        raise HTTPException(status_code=503, detail="Server đang bận, thử lại sau nhé.") from e
    finally:
        _ingest_slot.release()
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


@router.get("/{repo_id}/files")
def list_files(repo_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _require_repo(conn, repo_id)
    rows = conn.execute(
        "SELECT path, language, line_count FROM files WHERE repo_id = ? ORDER BY path",
        (repo_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{repo_id}/search")
def search(
    repo_id: int,
    q: str = Query(min_length=1, max_length=300),
    limit: int = Query(default=8, ge=1, le=20),
    conn: sqlite3.Connection = Depends(get_db),
):
    _require_repo(conn, repo_id)
    return search_chunks(conn, repo_id, q, limit)
