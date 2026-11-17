import pytest
from fastapi.testclient import TestClient

from app import auth
from app.accounts import store
from app.ask import get_db_path, get_provider
from app.db import connect
from app.ingest.service import index_repo
from app.main import app
from tests.test_agent import AUTH, ProviderKichBan, chu
from tests.test_ask import doc_sse
from tests.test_ingest import tao_zip


@pytest.fixture(autouse=True)
def _accounts_env(tmp_path, monkeypatch):
    # mỗi test một database tài khoản riêng, và bật đăng nhập bằng client id giả
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'acc.sqlite').as_posix()}")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("SESSION_SECRET", "x" * 40)
    yield
    app.dependency_overrides.clear()


def fake_google(monkeypatch, sub="g-1", email="a@x.com", name="An"):
    monkeypatch.setattr(
        auth, "verify_google_credential", lambda c: {"sub": sub, "email": email, "name": name, "picture": ""}
    )


def login(monkeypatch, sub="g-1", email="a@x.com") -> dict:
    fake_google(monkeypatch, sub, email)
    res = TestClient(app).post("/api/auth/google", json={"credential": "c" * 30})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_dang_nhap_tao_nguoi_dung_va_cap_token(monkeypatch):
    h = login(monkeypatch)
    me = TestClient(app).get("/api/me", headers=h).json()
    assert me["email"] == "a@x.com"
    # đăng nhập lại cùng tài khoản Google thì vẫn là một người dùng
    h2 = login(monkeypatch)
    assert TestClient(app).get("/api/me", headers=h2).json()["id"] == me["id"]


def test_token_google_sai_bi_tu_choi(monkeypatch):
    def boom(_):
        raise auth.GoogleAuthError("bad")

    monkeypatch.setattr(auth, "verify_google_credential", boom)
    res = TestClient(app).post("/api/auth/google", json={"credential": "c" * 30})
    assert res.status_code == 401


def test_chua_cau_hinh_client_id_thi_tat_dang_nhap(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    c = TestClient(app)
    assert c.get("/api/auth/config").json()["enabled"] is False
    assert c.post("/api/auth/google", json={"credential": "c" * 30}).status_code == 503


def test_khong_co_hoac_gia_token_thi_401():
    c = TestClient(app)
    assert c.get("/api/conversations").status_code == 401
    assert c.get("/api/conversations", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401


def test_token_het_han_bi_tu_choi(monkeypatch):
    import jwt

    login(monkeypatch)
    user_id = TestClient(app).get("/api/me", headers=login(monkeypatch)).json()["id"]
    expired = jwt.encode({"sub": user_id, "iss": "repolens", "exp": 1}, "x" * 40, algorithm="HS256")
    assert TestClient(app).get("/api/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_ky_bang_khoa_khac_bi_tu_choi(monkeypatch):
    import jwt

    user_id = TestClient(app).get("/api/me", headers=login(monkeypatch)).json()["id"]
    forged = jwt.encode({"sub": user_id, "iss": "repolens", "exp": 9999999999}, "khac" * 12, algorithm="HS256")
    assert TestClient(app).get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_tao_xem_xoa_hoi_thoai(monkeypatch):
    h = login(monkeypatch)
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "https://github.com/pallets/flask"}, headers=h).json()
    assert (conv["owner"], conv["name"]) == ("pallets", "flask")
    # hội thoại rỗng (chưa hỏi gì) chưa đáng hiện trong danh sách
    assert c.get("/api/conversations", headers=h).json() == []
    store.add_turn(conv["id"], "login ở đâu?", {"question": "login ở đâu?", "status": "done", "answer": "ở auth.py"})
    lst = c.get("/api/conversations", headers=h).json()
    assert lst[0]["title"] == "login ở đâu?" and lst[0]["turn_count"] == 1
    full = c.get(f"/api/conversations/{conv['id']}", headers=h).json()
    assert full["turns"][0]["answer"] == "ở auth.py"
    assert c.delete(f"/api/conversations/{conv['id']}", headers=h).status_code == 204
    assert c.get(f"/api/conversations/{conv['id']}", headers=h).status_code == 404


def test_khong_xem_duoc_hoi_thoai_cua_nguoi_khac(monkeypatch):
    a = login(monkeypatch, sub="a", email="a@x.com")
    b = login(monkeypatch, sub="b", email="b@x.com")
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "a/b"}, headers=a).json()
    assert c.get(f"/api/conversations/{conv['id']}", headers=b).status_code == 404
    assert c.delete(f"/api/conversations/{conv['id']}", headers=b).status_code == 404
    assert c.get(f"/api/conversations/{conv['id']}", headers=a).status_code == 200


def test_xoa_tai_khoan_xoa_het_du_lieu(monkeypatch):
    h = login(monkeypatch)
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "a/b"}, headers=h).json()
    store.add_turn(conv["id"], "q", {"question": "q", "status": "done"})
    assert c.delete("/api/me", headers=h).status_code == 204
    assert c.get("/api/me", headers=h).status_code == 401
    assert store.list_turns(conv["id"]) == []


def test_repo_khong_hop_le_bi_tu_choi(monkeypatch):
    h = login(monkeypatch)
    res = TestClient(app).post("/api/conversations", json={"repo": "https://gitlab.com/a/b"}, headers=h)
    assert res.status_code == 400


@pytest.fixture
def indexed(tmp_path):
    path = tmp_path / "repo.sqlite"
    conn = connect(path)
    stats = index_repo(conn, "a", "b", tao_zip({"r/src/auth.py": AUTH}))
    conn.close()
    app.dependency_overrides[get_db_path] = lambda: path
    return stats.repo_id


def test_hoi_dap_duoc_luu_o_server(monkeypatch, indexed):
    h = login(monkeypatch)
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "a/b"}, headers=h).json()
    app.dependency_overrides[get_provider] = lambda: ProviderKichBan([[chu("Hàm đăng nhập ở [src/auth.py:3-4].")]])
    res = c.post(
        f"/api/repos/{indexed}/ask",
        json={"question": "login ở đâu?", "conversation_id": conv["id"]},
        headers=h,
    )
    assert doc_sse(res.text)[-1][0] == "done"
    turns = c.get(f"/api/conversations/{conv['id']}", headers=h).json()["turns"]
    assert len(turns) == 1
    assert turns[0]["status"] == "done"
    assert "src/auth.py" in turns[0]["answer"]
    assert turns[0]["citations"][0]["valid"] is True


def test_hoi_vao_hoi_thoai_cua_nguoi_khac_bi_tu_choi(monkeypatch, indexed):
    a = login(monkeypatch, sub="a", email="a@x.com")
    b = login(monkeypatch, sub="b", email="b@x.com")
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "a/b"}, headers=a).json()
    app.dependency_overrides[get_provider] = lambda: ProviderKichBan([[chu("ok")]])
    res = c.post(f"/api/repos/{indexed}/ask", json={"question": "hi", "conversation_id": conv["id"]}, headers=b)
    assert res.status_code == 404
    assert store.list_turns(conv["id"]) == []


def test_hoi_khong_dang_nhap_van_chay_binh_thuong(indexed):
    app.dependency_overrides[get_provider] = lambda: ProviderKichBan([[chu("ok")]])
    res = TestClient(app).post(f"/api/repos/{indexed}/ask", json={"question": "hi"})
    assert doc_sse(res.text)[-1][0] == "done"


def test_hoi_dap_loi_cung_duoc_luu(monkeypatch, indexed):
    from app.providers.base import ModelOverloaded

    class Loi:
        async def stream(self, messages, system="", tools=None):
            raise ModelOverloaded()
            yield  # pragma: no cover

    h = login(monkeypatch)
    c = TestClient(app)
    conv = c.post("/api/conversations", json={"repo": "a/b"}, headers=h).json()
    app.dependency_overrides[get_provider] = lambda: Loi()
    c.post(f"/api/repos/{indexed}/ask", json={"question": "hi", "conversation_id": conv["id"]}, headers=h)
    turn = c.get(f"/api/conversations/{conv['id']}", headers=h).json()["turns"][0]
    assert turn["status"] == "error" and turn["error"]


def test_chuan_hoa_url_postgres():
    assert store._normalize("postgres://u:p@h/db").startswith("postgresql+psycopg://")
    assert store._normalize("postgresql://u:p@h/db").startswith("postgresql+psycopg://")
    assert store._normalize("sqlite:///x.db") == "sqlite:///x.db"
