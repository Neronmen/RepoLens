import json

import pytest
from fastapi.testclient import TestClient

from app.ask import get_db_path, get_provider
from app.db import connect, get_db
from app.i18n import Msg, lang_var
from app.ingest.github import RepoError, parse_repo_url
from app.main import app
from app.providers.base import RateLimited
from app.repos import get_downloader
from tests.test_agent import ProviderKichBan, chu
from tests.test_ask import ProviderLoi, doc_sse
from tests.test_ingest import tao_zip


def test_msg_chon_ban_dich_theo_ngon_ngu_hien_tai():
    m = Msg("Xin chào {ten}", "Hello {ten}", ten="An")
    assert str(m) == "Xin chào An"  # mặc định là tiếng Việt
    token = lang_var.set("en")
    try:
        assert str(m) == "Hello An"
    finally:
        lang_var.reset(token)


def test_loi_ban_dau_van_nguyen_ven_khi_khong_co_header():
    with pytest.raises(RepoError, match="Link không hợp lệ"):
        parse_repo_url("https://evil.com/a/b")


@pytest.fixture
def client():
    conn = connect(":memory:")
    app.dependency_overrides[get_db] = lambda: conn
    app.dependency_overrides[get_downloader] = lambda: (lambda o, n: tao_zip({"r/a.py": "x = 1"}))
    yield TestClient(app)
    app.dependency_overrides.clear()


def post_link_sai(client, lang):
    headers = {"X-Lang": lang} if lang else {}
    return client.post("/api/repos", json={"url": "https://gitlab.com/a/b"}, headers=headers).json()["detail"]


def test_loi_http_theo_header_x_lang(client):
    assert "Link không hợp lệ" in post_link_sai(client, "vi")
    assert "Invalid link" in post_link_sai(client, "en")
    assert "Link không hợp lệ" in post_link_sai(client, None)
    # giá trị lạ hoặc cố tình độc hại thì quay về mặc định, không lỗi
    assert "Link không hợp lệ" in post_link_sai(client, "fr")
    assert "Link không hợp lệ" in post_link_sai(client, "en; drop table")


def test_404_va_422_theo_ngon_ngu(client):
    assert "hasn't been added" in client.get("/api/repos/999", headers={"X-Lang": "en"}).json()["detail"]
    assert "Chưa có repo" in client.get("/api/repos/999", headers={"X-Lang": "vi"}).json()["detail"]


def test_gioi_han_lan_goi_theo_ngon_ngu(client, monkeypatch):
    monkeypatch.setenv("INDEX_LIMIT_PER_HOUR", "1")
    h = {"X-Lang": "en"}
    client.post("/api/repos", json={"url": "a/b"}, headers=h)
    assert "free requests" in client.post("/api/repos", json={"url": "a/b"}, headers=h).json()["detail"]


@pytest.fixture
def repo_id(tmp_path):
    duong_dan = tmp_path / "t.sqlite"
    conn = connect(duong_dan)
    from app.ingest.service import index_repo

    rid = index_repo(conn, "a", "b", tao_zip({"r/a.py": "x = 1"})).repo_id
    conn.close()
    app.dependency_overrides[get_db_path] = lambda: duong_dan
    yield rid
    app.dependency_overrides.clear()


def hoi(provider, repo_id, lang):
    app.dependency_overrides[get_provider] = lambda: provider
    headers = {"X-Lang": lang} if lang else {}
    return TestClient(app).post(f"/api/repos/{repo_id}/ask", json={"question": "hi"}, headers=headers)


def test_loi_trong_luong_sse_cung_theo_ngon_ngu(repo_id):
    # đường SSE chạy trong generator riêng: ngôn ngữ phải đi theo vào đó
    en = doc_sse(hoi(ProviderLoi(RateLimited()), repo_id, "en").text)
    vi = doc_sse(hoi(ProviderLoi(RateLimited()), repo_id, "vi").text)
    assert "overloaded" in en[0][1]["message"]
    assert "quá tải" in vi[0][1]["message"]


def test_loi_cua_agent_khi_model_im_lang_theo_ngon_ngu(repo_id):
    en = doc_sse(hoi(ProviderKichBan([[]]), repo_id, "en").text)
    assert en[0][0] == "error" and "did not produce an answer" in en[0][1]["message"]


def test_header_ngon_ngu_khong_anh_huong_cau_tra_loi_cua_model(repo_id):
    ev = doc_sse(hoi(ProviderKichBan([[chu("Hello there")]]), repo_id, "vi").text)
    assert "".join(d["text"] for e, d in ev if e == "token") == "Hello there"


def test_hai_request_dong_thoi_khong_tron_ngon_ngu(client, monkeypatch):
    # ContextVar tách riêng từng request: yêu cầu tiếng Anh không làm lộ tiếng Việt sang yêu cầu khác
    from concurrent.futures import ThreadPoolExecutor

    # 40 request vượt giới hạn 10 lượt/giờ, nên phải nới ra, không thì nhận lỗi 429 thay vì lỗi cần kiểm tra
    monkeypatch.setenv("INDEX_LIMIT_PER_HOUR", "1000")

    def goi(lang):
        return post_link_sai(client, lang)

    with ThreadPoolExecutor(8) as pool:
        kq = list(pool.map(goi, ["en", "vi"] * 20))
    assert all(("Invalid link" in k) == (i % 2 == 0) for i, k in enumerate(kq))


def test_cors_cho_phep_header_x_lang():
    res = TestClient(app).options(
        "/api/repos",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-lang",
        },
    )
    assert res.status_code == 200
    assert "x-lang" in res.headers["access-control-allow-headers"].lower() or res.headers["access-control-allow-headers"] == "*"
    json.dumps(dict(res.headers))
