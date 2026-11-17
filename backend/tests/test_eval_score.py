from eval.score import Result, judge, render_markdown, summarize


def cite(path, valid=True):
    return {"path": path, "start_line": 1, "end_line": 2, "valid": valid, "seen": True, "url": None}


Q = {
    "id": "q",
    "must_cite": ["signer.py"],
    "must_mention": [["sha1|sha-1"], ["default"]],
}


def test_dat_khi_trich_dan_dung_file_va_nhac_du_khai_niem():
    ok, why = judge(Q, "The default hash is SHA1.", [cite("src/x/signer.py")])
    assert ok and why == []


def test_truot_khi_trich_dan_sai_file():
    ok, why = judge(Q, "The default hash is SHA1.", [cite("src/x/timed.py")])
    assert not ok and "no valid citation of signer.py" in why[0]


def test_trich_dan_khong_hop_le_khong_duoc_tinh():
    ok, _ = judge(Q, "The default hash is SHA1.", [cite("src/x/signer.py", valid=False)])
    assert not ok


def test_truot_khi_thieu_mot_nhom_khai_niem():
    ok, why = judge(Q, "It uses sha1.", [cite("signer.py")])
    assert not ok and why == ["answer never mentions: default"]


def test_cau_tra_loi_rong_la_truot():
    ok, why = judge({"id": "q", "must_cite": [], "must_mention": []}, "  ", [])
    assert not ok and why == ["empty answer"]


def test_cau_hoi_khong_co_dap_an_dat_khi_noi_khong_tim_thay():
    q = {"id": "n", "answerable": False}
    for text in [
        "I could not find any PostgreSQL code in this repository.",
        "This library does not connect to a database.",
        "Không tìm thấy phần nào xử lý OAuth2 trong repo này.",
        "There is no evidence of an OAuth flow.",
    ]:
        assert judge(q, text, [])[0], text


def test_nhan_cac_cach_tu_choi_bang_tieng_viet_thuong_gap():
    # hai câu trả lời thật của agent ở lượt chạy đầu, bị chấm trượt oan vì bộ chấm quá hẹp
    q = {"id": "n", "answerable": False}
    assert judge(q, "Thư viện itsdangerous không kết nối với cơ sở dữ liệu PostgreSQL.", [])[0]
    assert judge(q, "Thư viện này **không** triển khai quy trình đăng nhập OAuth2.".replace("**", ""), [])[0]


def test_bo_cham_khong_bi_qua_de_dai_voi_cau_tra_loi_khang_dinh():
    q = {"id": "n", "answerable": False}
    assert not judge(q, "Thư viện kết nối PostgreSQL qua hàm connect() trong db.py.", [])[0]
    assert not judge(q, "OAuth2 được triển khai trong auth.py bằng cách gọi authorize().", [])[0]


def test_cau_hoi_khong_co_dap_an_truot_khi_bia_ra_cau_tra_loi():
    q = {"id": "n", "answerable": False}
    ok, why = judge(q, "It connects via psycopg2 in db.py using a connection pool.", [cite("db.py")])
    assert not ok and "honest" in why[0]


def r(**kw):
    base = dict(id="x", answerable=True, passed=True, reasons=[], citations_total=0, citations_valid=0,
                tool_calls=0, steps=1, ms=1000, tokens=100)
    return Result(**(base | kw))


def test_tong_hop_so_lieu():
    s = summarize([
        r(id="a", passed=True, citations_total=4, citations_valid=4, tool_calls=2, ms=2000, tokens=100),
        r(id="b", passed=False, citations_total=2, citations_valid=1, tool_calls=4, ms=6000, tokens=300),
        r(id="c", answerable=False, passed=True, ms=4000, tokens=200),
    ])
    assert s["pass_rate"] == 66.7
    assert s["answerable_pass_rate"] == 50.0
    assert s["honest_refusal_rate"] == 100.0
    assert s["citation_validity"] == 83.3
    assert s["median_latency_s"] == 4.0
    assert s["mean_tool_calls"] == 2.0
    assert s["mean_tokens"] == 200


def test_cau_bi_loi_tinh_la_truot_chu_khong_bi_loai_khoi_mau_so():
    # loại câu lỗi ra khỏi mẫu số sẽ báo 100% trong khi người dùng không nhận được 1/2 câu trả lời
    s = summarize([r(id="a", passed=True), r(id="b", passed=False, error="boom")])
    assert s["errors"] == 1 and s["pass_rate"] == 50.0
    assert s["answerable_pass_rate"] == 50.0


def test_tong_hop_khi_khong_co_gi():
    s = summarize([])
    assert s["pass_rate"] is None and s["median_latency_s"] is None


def test_bao_cao_markdown_neu_ly_do_truot():
    results = [r(id="good"), r(id="bad", passed=False, reasons=["no valid citation of a.py"])]
    md = render_markdown({"repo": "a/b", "model": "m", "run_at": "now"}, summarize(results), results)
    assert "| good | pass |" in md and "| bad | FAIL |" in md
    assert "**bad**: no valid citation of a.py" in md
