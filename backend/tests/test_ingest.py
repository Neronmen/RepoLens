import io
import zipfile

import pytest

from app.db import connect, search_chunks
from app.ingest.github import RepoError, parse_repo_url
from app.ingest.service import index_repo, read_source_files


def tao_zip(files: dict[str, bytes | str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for path, noi_dung in files.items():
            zf.writestr(path, noi_dung)
    return buf.getvalue()


@pytest.mark.parametrize("url", [
    "https://github.com/pallets/flask",
    "https://github.com/pallets/flask/",
    "https://github.com/pallets/flask.git",
    "github.com/pallets/flask",
    "pallets/flask",
])
def test_doc_duoc_cac_dang_link_hop_le(url):
    assert parse_repo_url(url) == ("pallets", "flask")


@pytest.mark.parametrize("url", [
    "",
    "https://gitlab.com/a/b",
    "https://github.com.evil.com/a/b",
    "https://evil.com/github.com/a/b",
    "http://localhost:8000/a/b",
    "https://github.com/a/b/../../etc",
    "https://github.com/a/..",
    "https://github.com/a/b?x=1",
    "https://github.com/a/b@169.254.169.254",
])
def test_tu_choi_link_la(url):
    with pytest.raises(RepoError):
        parse_repo_url(url)


def test_chi_lay_file_code_va_bo_thu_muc_rac():
    z = tao_zip({
        "repo-abc/app/main.py": "print('hi')",
        "repo-abc/node_modules/x/index.js": "x",
        "repo-abc/logo.png": b"\x89PNG\x00\x00",
        "repo-abc/package-lock.json": "{}",
        "repo-abc/bundle.min.js": "x",
        "repo-abc/data.py": b"\xff\xfe\x00khong phai utf8",
    })
    files, skipped = read_source_files(z)
    assert [f[0] for f in files] == ["app/main.py"]
    assert skipped == 5


def test_bo_duong_dan_thoat_ra_ngoai():
    z = tao_zip({"repo-abc/../../etc/passwd.py": "x", "repo-abc/ok.py": "y = 1"})
    files, _ = read_source_files(z)
    assert [f[0] for f in files] == ["ok.py"]


def test_bo_file_qua_lon():
    z = tao_zip({"r/big.py": "x" * 300_000, "r/small.py": "a = 1"})
    files, _ = read_source_files(z)
    assert [f[0] for f in files] == ["small.py"]


def test_zip_hong_bao_loi_de_hieu():
    with pytest.raises(RepoError):
        read_source_files(b"day khong phai zip")


def test_lap_chi_muc_roi_tim_duoc():
    conn = connect(":memory:")
    z = tao_zip({"r/auth.py": "def login_user():\n    pass\n", "r/README.md": "# Demo"})
    stats = index_repo(conn, "a", "b", z)
    assert (stats.file_count, stats.chunk_count) == (2, 2)
    assert search_chunks(conn, stats.repo_id, "login")[0]["path"] == "auth.py"


def test_lap_chi_muc_lai_khong_bi_trung():
    conn = connect(":memory:")
    lan1 = index_repo(conn, "a", "b", tao_zip({"r/old.py": "def cu(): pass"}))
    lan2 = index_repo(conn, "a", "b", tao_zip({"r/new.py": "def moi(): pass"}))
    assert lan1.repo_id == lan2.repo_id
    assert search_chunks(conn, lan2.repo_id, "cu") == []
    assert search_chunks(conn, lan2.repo_id, "moi")[0]["path"] == "new.py"
    assert conn.execute("SELECT count(*) FROM chunks").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM chunks_fts").fetchone()[0] == 1


def test_repo_khong_co_code_thi_bao_loi():
    conn = connect(":memory:")
    with pytest.raises(RepoError):
        index_repo(conn, "a", "b", tao_zip({"r/logo.png": b"\x00"}))
    assert conn.execute("SELECT count(*) FROM repos").fetchone()[0] == 0
