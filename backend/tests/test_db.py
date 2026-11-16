import pytest

from app.db import build_match_query, connect, search_chunks


@pytest.fixture
def conn():
    c = connect(":memory:")
    c.execute("INSERT INTO repos (id, owner, name) VALUES (1, 'a', 'b')")
    c.execute("INSERT INTO files (id, repo_id, path, language, line_count) VALUES (1, 1, 'auth.py', 'python', 10)")
    mau = [
        (1, "auth.py", 1, 5, "def login_user(name, password):\n    return check_password(name, password)"),
        (2, "auth.py", 6, 10, "def render_homepage():\n    return 'xin chao'"),
    ]
    for id_, path, s, e, text in mau:
        c.execute(
            "INSERT INTO chunks (id, repo_id, file_id, path, start_line, end_line, text) VALUES (?,1,1,?,?,?,?)",
            (id_, path, s, e, text),
        )
        c.execute("INSERT INTO chunks_fts (rowid, text, path) VALUES (?,?,?)", (id_, text, path))
    c.commit()
    return c


def test_tim_dung_doan_lien_quan(conn):
    kq = search_chunks(conn, 1, "how does login work?")
    assert kq and kq[0]["id"] == 1


def test_camel_case_duoc_tach(conn):
    assert '"login"' in build_match_query("loginUser")


def test_ky_tu_la_khong_lam_vo_truy_van(conn):
    # những chuỗi này mà đưa thẳng vào MATCH sẽ báo lỗi cú pháp
    for q in ['"', "login AND", "foo*", "(((", "NEAR(", "-- ; drop table"]:
        search_chunks(conn, 1, q)


def test_nhieu_luong_cung_mo_database_moi(tmp_path):
    # trước đây việc bật WAL ở mỗi kết nối làm chỗ này báo "database is locked"
    import threading

    duong_dan = tmp_path / "moi.sqlite"
    loi = []

    def mo():
        try:
            connect(duong_dan).close()
        except Exception as e:  # noqa: BLE001
            loi.append(e)

    cac_luong = [threading.Thread(target=mo) for _ in range(8)]
    for t in cac_luong:
        t.start()
    for t in cac_luong:
        t.join()
    assert loi == []


def test_tieng_viet_khong_bi_xe_thanh_manh(conn):
    assert build_match_query("xác thực người dùng") == '"xác" OR "thực" OR "người" OR "dùng"'
    # "chao" trong code khớp được với "chào" vì FTS5 tự bỏ dấu khi so sánh
    kq = search_chunks(conn, 1, "trang chào")
    assert kq and kq[0]["id"] == 2


def test_cau_hoi_toan_stopword_tra_ve_rong(conn):
    assert search_chunks(conn, 1, "how does the") == []


def test_khong_thay_ket_qua_cua_repo_khac(conn):
    assert search_chunks(conn, 2, "login") == []
