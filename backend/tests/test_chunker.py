from app.ingest.chunker import chunk_text, split_lines


def test_file_rong_khong_ra_doan_nao():
    assert chunk_text("") == []
    assert chunk_text("\n\n   \n") == []


def test_file_ngan_la_mot_doan():
    chunks = chunk_text("a = 1\nb = 2\n")
    assert len(chunks) == 1
    assert (chunks[0].start_line, chunks[0].end_line) == (1, 2)


def test_file_dai_duoc_cat_va_phu_het_cac_dong():
    text = "\n".join(f"dong {i}" for i in range(1, 201))
    chunks = chunk_text(text, max_lines=50, overlap=5)
    assert len(chunks) > 1
    assert chunks[0].start_line == 1
    assert chunks[-1].end_line == 200
    # hai đoạn liền nhau phải chồng lên nhau, không để hở dòng nào
    for a, b in zip(chunks, chunks[1:]):
        assert b.start_line <= a.end_line + 1
        assert b.start_line > a.start_line


def test_uu_tien_cat_o_dong_trong():
    code = "\n".join(["x = 1"] * 45 + [""] + ["y = 2"] * 40)
    chunks = chunk_text(code, max_lines=50, overlap=0)
    assert chunks[0].end_line == 46  # dừng ngay sau dòng trống


def test_dong_qua_dai_khong_lam_doan_phinh_to():
    text = "\n".join("x" * 1000 for _ in range(20))
    chunks = chunk_text(text)
    assert all(len(c.text) <= 3600 for c in chunks)
    assert chunks[-1].end_line == 20


def test_file_chi_co_mot_dong_khong_lo():
    # kiểu file json hoặc bundle js viết liền một dòng
    chunks = chunk_text("x" * 150_000)
    assert len(chunks) == 1
    assert len(chunks[0].text) < 600


def test_dong_dai_khong_bi_lap_lai_qua_nhieu():
    # trước đây mỗi dòng xuất hiện trong ~8 đoạn, làm database phình gấp 8 lần
    text = "\n".join("y" * 400 for _ in range(200))
    chunks = chunk_text(text)
    tong = sum(len(c.text) for c in chunks)
    assert tong < len(text) * 1.5


def test_so_dong_khop_voi_github():
    # form feed và \r\n không được làm lệch số dòng
    chunks = chunk_text("a = 1\x0cb = 2\r\nc = 3\r\n")
    assert (chunks[0].start_line, chunks[0].end_line) == (1, 2)
    assert "\r" not in chunks[0].text
    assert split_lines("a\nb\n") == ["a", "b"]
