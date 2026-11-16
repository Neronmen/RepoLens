import pytest
from fastapi.testclient import TestClient

from app.db import connect, get_db
from app.ingest.github import RepoError
from app.main import app
from app.repos import get_downloader
from tests.test_ingest import tao_zip

ZIP_MAU = tao_zip({
    "r/auth.py": "def login_user(name):\n    return name\n",
    "r/README.md": "# Demo\nMột repo nhỏ để test.",
})


@pytest.fixture
def client():
    # mỗi test dùng một database riêng trong bộ nhớ
    conn = connect(":memory:")
    app.dependency_overrides[get_db] = lambda: conn
    app.dependency_overrides[get_downloader] = lambda: (lambda owner, name: ZIP_MAU)
    yield TestClient(app)
    app.dependency_overrides.clear()
    conn.close()


def test_them_repo_roi_xem_danh_sach(client):
    res = client.post("/api/repos", json={"url": "https://github.com/a/b"})
    assert res.status_code == 201
    assert res.json()["file_count"] == 2

    ds = client.get("/api/repos").json()
    assert [(r["owner"], r["name"]) for r in ds] == [("a", "b")]


def test_tim_trong_repo(client):
    repo_id = client.post("/api/repos", json={"url": "a/b"}).json()["id"]
    kq = client.get(f"/api/repos/{repo_id}/search", params={"q": "login"}).json()
    assert kq[0]["path"] == "auth.py"
    assert kq[0]["start_line"] == 1


def test_liet_ke_file(client):
    repo_id = client.post("/api/repos", json={"url": "a/b"}).json()["id"]
    files = client.get(f"/api/repos/{repo_id}/files").json()
    assert [f["path"] for f in files] == ["README.md", "auth.py"]


def test_link_sai_tra_400(client):
    res = client.post("/api/repos", json={"url": "https://gitlab.com/a/b"})
    assert res.status_code == 400
    assert "Link không hợp lệ" in res.json()["detail"]


def test_repo_khong_ton_tai_tra_400(client):
    def tai_loi(owner, name):
        raise RepoError("Không tìm thấy repo này (hoặc nó là repo riêng tư).")

    app.dependency_overrides[get_downloader] = lambda: tai_loi
    res = client.post("/api/repos", json={"url": "a/khong-co"})
    assert res.status_code == 400


def test_repo_chua_them_tra_404(client):
    assert client.get("/api/repos/999/search", params={"q": "x"}).status_code == 404
    assert client.get("/api/repos/999/files").status_code == 404
