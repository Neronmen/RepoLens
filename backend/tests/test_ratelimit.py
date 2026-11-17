from fastapi.testclient import TestClient

from app import ratelimit
from app.ask import get_db_path, get_provider
from app.db import connect, get_db
from app.main import app
from app.ratelimit import RateLimiter
from app.repos import get_downloader
from tests.test_agent import ProviderKichBan, chu
from tests.test_ingest import tao_zip


class DongHo:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_cho_phep_den_gioi_han_roi_chan():
    rl = RateLimiter(lambda: 3, window_s=60, clock=DongHo())
    assert [rl.check("a") for _ in range(3)] == [None, None, None]
    assert rl.check("a") is not None


def test_moi_ip_co_bo_dem_rieng():
    rl = RateLimiter(lambda: 1, window_s=60, clock=DongHo())
    assert rl.check("a") is None
    assert rl.check("b") is None
    assert rl.check("a") is not None


def test_het_cua_so_thi_duoc_goi_lai_va_bao_dung_thoi_gian_cho():
    clock = DongHo()
    rl = RateLimiter(lambda: 2, window_s=100, clock=clock)
    rl.check("a")
    clock.t = 30
    rl.check("a")
    clock.t = 60
    assert rl.check("a") == 40  # lượt cũ nhất hết hạn sau 100 - 60 giây
    clock.t = 101
    assert rl.check("a") is None


def test_lan_bi_chan_khong_keo_dai_thoi_gian_phat():
    clock = DongHo()
    rl = RateLimiter(lambda: 1, window_s=100, clock=clock)
    rl.check("a")
    for t in range(10, 90, 10):
        clock.t = t
        assert rl.check("a") is not None
    clock.t = 100
    assert rl.check("a") is None


def test_don_dep_ip_cu_khi_qua_nhieu(monkeypatch):
    monkeypatch.setattr(ratelimit, "_MAX_TRACKED_KEYS", 5)
    clock = DongHo()
    rl = RateLimiter(lambda: 1, window_s=10, clock=clock)
    for i in range(6):
        rl.check(f"ip{i}")
    clock.t = 20
    rl.check("moi")
    rl.check("moi2")
    rl.check("moi3")
    rl.check("moi4")
    rl.check("moi5")
    rl.check("moi6")
    assert len(rl._hits) < 8


def test_gioi_han_chi_tra_ve_429_co_retry_after(monkeypatch):
    conn = connect(":memory:")
    zip_mau = tao_zip({"r/a.py": "x = 1"})
    app.dependency_overrides[get_db] = lambda: conn
    app.dependency_overrides[get_downloader] = lambda: (lambda o, n: zip_mau)
    monkeypatch.setenv("INDEX_LIMIT_PER_HOUR", "2")
    try:
        client = TestClient(app)
        codes = [client.post("/api/repos", json={"url": "a/b"}).status_code for _ in range(3)]
        assert codes == [201, 201, 429]
        res = client.post("/api/repos", json={"url": "a/b"})
        assert int(res.headers["retry-after"]) > 0
        assert "lượt miễn phí" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_gioi_han_hoi_dap(tmp_path, monkeypatch):
    path = tmp_path / "t.sqlite"
    conn = connect(path)
    from app.ingest.service import index_repo

    rid = index_repo(conn, "a", "b", tao_zip({"r/a.py": "x = 1"})).repo_id
    conn.close()
    app.dependency_overrides[get_db_path] = lambda: path
    monkeypatch.setenv("ASK_LIMIT_PER_HOUR", "1")
    try:
        app.dependency_overrides[get_provider] = lambda: ProviderKichBan([[chu("ok")], [chu("ok")]])
        client = TestClient(app)
        assert client.post(f"/api/repos/{rid}/ask", json={"question": "hi"}).status_code == 200
        assert client.post(f"/api/repos/{rid}/ask", json={"question": "hi"}).status_code == 429
    finally:
        app.dependency_overrides.clear()


def test_chi_tin_x_forwarded_for_khi_duoc_bat(monkeypatch):
    zip_mau = tao_zip({"r/a.py": "x = 1"})
    conn = connect(":memory:")
    app.dependency_overrides[get_db] = lambda: conn
    app.dependency_overrides[get_downloader] = lambda: (lambda o, n: zip_mau)
    monkeypatch.setenv("INDEX_LIMIT_PER_HOUR", "1")
    try:
        client = TestClient(app)
        post = lambda ip: client.post("/api/repos", json={"url": "a/b"}, headers={"X-Forwarded-For": ip}).status_code  # noqa: E731

        # mặc định: kẻ xấu đổi header liên tục cũng không né được giới hạn
        assert [post("1.1.1.1"), post("2.2.2.2")] == [201, 429]

        ratelimit.reset_all()
        monkeypatch.setenv("TRUST_PROXY", "true")
        assert [post("1.1.1.1"), post("2.2.2.2"), post("1.1.1.1")] == [201, 201, 429]
    finally:
        app.dependency_overrides.clear()
