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
    assert "còn 265 dòng khớp nữa" in out


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
