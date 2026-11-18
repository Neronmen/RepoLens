import pytest

from app.agent.tools import TOOLS, run_tool
from app.db import connect
from app.ingest.service import index_repo
from tests.test_ingest import tao_zip

AUTH = "\n".join(
    ["import hashlib", "", "def login_user(name, password):", "    return check(name, password)", ""]
    + [f"# dong {i}" for i in range(6, 301)]
)


@pytest.fixture
def db():
    conn = connect(":memory:")
    mot = index_repo(conn, "a", "mot", tao_zip({
        "r/src/auth.py": AUTH,
        "r/src/a_b.py": "x = 1",
        "r/src/axb.py": "x = 2",
        "r/README.md": "# Demo\nGọi login_user để đăng nhập.",
    }))
    hai = index_repo(conn, "a", "hai", tao_zip({"r/secret.py": "MAT_KHAU = 'repo khac'"}))
    return conn, mot.repo_id, hai.repo_id


def test_moi_cong_cu_khai_bao_deu_chay_duoc(db):
    conn, repo, _ = db
    for tool in TOOLS:
        assert isinstance(run_tool(conn, repo, tool.name, {}), str)


def test_search_code_tra_ve_dong_co_danh_so(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "search_code", {"query": "login user"})
    assert "src/auth.py" in out
    assert "    3 | def login_user" in out


def test_grep_tra_ve_dung_file_va_so_dong(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "grep", {"text": "LOGIN_USER"})
    assert "src/auth.py:3: def login_user(name, password):" in out
    assert "README.md:2:" in out


def test_grep_gioi_han_theo_thu_muc(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "grep", {"text": "login_user", "path_prefix": "src/"})
    assert "README.md" not in out


def test_grep_qua_nhieu_ket_qua_thi_bao_con_nua(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "grep", {"text": "# dong"})
    assert out.count("\n") == 30  # 30 dòng khớp + 1 dòng báo còn nữa
    assert "còn nhiều dòng khớp nữa" in out


def test_ky_tu_dac_biet_cua_like_duoc_hieu_dung_nghia_den(db):
    conn, repo, _ = db
    # nếu không escape, dấu _ sẽ khớp cả "axb.py"
    out = run_tool(conn, repo, "list_files", {"path_prefix": "src/a_b"})
    assert "a_b.py" in out and "axb.py" not in out
    assert run_tool(conn, repo, "list_files", {"path_prefix": "%"}) == "Không có file nào khớp."


def test_read_file_theo_khoang_dong(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": 3, "end_line": 4})
    assert "    3 | def login_user(name, password):" in out
    assert "    4 |     return check(name, password)" in out
    assert "import hashlib" not in out


def test_read_file_khong_doc_qua_150_dong_mot_lan(db):
    conn, repo, _ = db
    out = run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": 1, "end_line": 9999})
    assert "(dòng 1-150)" in out
    assert "đọc tiếp từ dòng 151" in out


def test_read_file_chiu_duoc_tham_so_la(db):
    conn, repo, _ = db
    # model thật đôi khi gửi số dạng chuỗi, số thực, hoặc giá trị vô nghĩa
    out = run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": "3", "end_line": 4.0})
    assert "(dòng 3-4)" in out
    assert "(dòng 1-" in run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": "abc"})
    assert "(dòng 1-" in run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": -5})
    assert "chỉ có" in run_tool(conn, repo, "read_file", {"path": "src/auth.py", "start_line": 9999})


def test_tham_so_null_hoac_sai_kieu_khong_bi_hieu_thanh_chu_none(db):
    conn, repo, _ = db
    # trước đây None thành chuỗi "None" rồi công cụ báo sai là không có dòng nào khớp
    assert "src/auth.py:3:" in run_tool(conn, repo, "grep", {"text": "login_user", "path_prefix": None})
    assert "src/auth.py" in run_tool(conn, repo, "list_files", {"path_prefix": None})
    assert "Thiếu tham số" in run_tool(conn, repo, "grep", {"text": None})
    assert "Thiếu tham số" in run_tool(conn, repo, "search_code", {"query": None})
    assert "Thiếu tham số" in run_tool(conn, repo, "search_code", {"query": ["a", "b"]})


def test_duong_dan_dang_khac_van_hieu_duoc(db):
    conn, repo, _ = db
    for prefix in ["./src", "/src/", "src"]:
        assert "src/auth.py:3:" in run_tool(conn, repo, "grep", {"text": "login_user", "path_prefix": prefix})
    assert "Không có file nào có đường dẫn bắt đầu bằng" in run_tool(
        conn, repo, "grep", {"text": "login_user", "path_prefix": "khong_co/"}
    )
    assert "dòng 3-4" in run_tool(conn, repo, "read_file", {"path": "./src/auth.py", "start_line": 3, "end_line": 4})


def test_read_file_cac_kieu_khoang_dong_vo_ly(db):
    conn, repo, _ = db
    doc = lambda **kw: run_tool(conn, repo, "read_file", {"path": "src/auth.py", **kw})  # noqa: E731
    # trước đây end_line âm làm Python cắt "từ cuối lên" và trả về gần hết file
    am = doc(start_line=1, end_line=-5)
    assert "(dòng 1-1)" in am and am.count("\n") < 5
    assert "(dòng 10-10)" in doc(start_line=10, end_line=5)
    assert "(dòng 10-10)" in doc(start_line=10, end_line=0)
    for la in ["1e999", "inf", "nan", 10**400, None, [], {}]:
        assert isinstance(doc(start_line=la, end_line=la), str)


def test_ten_cong_cu_hoac_khoa_tham_so_la_kieu_khong_sap(db):
    conn, repo, _ = db
    assert "Không có công cụ" in run_tool(conn, repo, ["grep"], {})
    assert "Không có công cụ" in run_tool(conn, repo, None, {})
    assert isinstance(run_tool(conn, repo, "grep", {1: 2, "text": "login"}), str)
    assert "Tham số không hợp lệ" in run_tool(conn, repo, "grep", ["text"])


def test_grep_dung_som_tren_repo_lon():
    import time

    conn = connect(":memory:")
    # 600 file, mỗi file đều có chuỗi cần tìm: nếu quét hết thì chậm
    index_repo(conn, "a", "lon", tao_zip({f"r/f{i}.py": "x = 1\n" * 3000 for i in range(600)}))
    t = time.perf_counter()
    out = run_tool(conn, 1, "grep", {"text": "x = 1"})
    assert time.perf_counter() - t < 0.5
    assert "còn nhiều dòng khớp nữa" in out


def test_goi_sai_thi_nhan_loi_nhan_chu_khong_sap(db):
    conn, repo, _ = db
    assert "Không có công cụ" in run_tool(conn, repo, "xoa_het", {})
    assert "Không có file" in run_tool(conn, repo, "read_file", {"path": "../../etc/passwd"})
    assert isinstance(run_tool(conn, repo, "grep", {"text": "x", "tham_so_la": 1}), str)


def test_khong_doc_duoc_repo_khac(db):
    conn, repo, repo_khac = db
    assert "Không có file" in run_tool(conn, repo, "read_file", {"path": "secret.py"})
    assert "repo khac" not in run_tool(conn, repo, "grep", {"text": "MAT_KHAU"})
    assert "repo khac" not in run_tool(conn, repo, "search_code", {"query": "MAT_KHAU"})
    assert "secret.py" not in run_tool(conn, repo, "list_files", {})
    # kể cả khi model cố tình truyền repo_id của repo kia
    lua = run_tool(conn, repo, "read_file", {"path": "secret.py", "repo_id": repo_khac})
    assert "repo khac" not in lua
    # còn hỏi đúng repo thì vẫn đọc được bình thường
    assert "repo khac" in run_tool(conn, repo_khac, "read_file", {"path": "secret.py"})


def test_ket_qua_qua_dai_bi_cat(db, monkeypatch):
    conn, repo, _ = db
    monkeypatch.setattr("app.agent.tools.MAX_OUTPUT_CHARS", 200)
    out = run_tool(conn, repo, "read_file", {"path": "src/auth.py"})
    assert len(out) < 260 and "đã cắt bớt" in out


def test_scan_secrets_tim_ra_secret_viet_cung_va_che_gia_tri():
    from app.db import connect
    from app.ingest.service import index_repo
    from tests.test_ingest import tao_zip

    secret = "Q9X7K2M4P6R8T0V1W3Y5Z7B9D1F3H5J7"
    conn = connect(":memory:")
    stats = index_repo(conn, "a", "b", tao_zip({
        "r/src/pay.ts": f'const s = process.env.HASH_SECRET ?? "{secret}";\nconst port = process.env.PORT ?? "3000";\n',
        "r/src/ok.ts": "const k = process.env.API_KEY\n",
    }))
    out = run_tool(conn, stats.repo_id, "scan_secrets", {})
    assert "src/pay.ts:1" in out and "src/ok.ts" not in out
    assert secret not in out and "đã che" in out
    assert "Đã quét 2 file" in out and "lịch sử Git" in out


def test_scan_secrets_sach_thi_noi_ro_pham_vi_da_quet():
    from app.db import connect
    from app.ingest.service import index_repo
    from tests.test_ingest import tao_zip

    conn = connect(":memory:")
    stats = index_repo(conn, "a", "b", tao_zip({"r/a.py": "x = 1\n"}))
    out = run_tool(conn, stats.repo_id, "scan_secrets", {})
    assert out.startswith("Không phát hiện") and "Đã quét 1 file" in out
