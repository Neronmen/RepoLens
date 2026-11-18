from app.agent.redact import StreamRedactor, redact

# Các giá trị dưới đây là chuỗi giả đúng định dạng, không phải key thật.
AWS = "AKIAIOSFODNN7EXAMPLE"
GOOGLE = "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"
GITHUB = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"


def test_che_cac_dang_key_pho_bien_nhung_giu_vai_ky_tu_dau():
    for secret, label in [(AWS, "AWS"), (GOOGLE, "Google"), (GITHUB, "GitHub"), (JWT, "JWT")]:
        out = redact(f"const k = {secret};")
        assert secret not in out
        assert secret[:3] in out and "****" in out and label in out


def test_che_mat_khau_viet_cung_nhung_khong_che_bien_moi_truong():
    assert "hunter2hunter2" not in redact('password = "hunter2hunter2"')
    assert "supersecretvalue" not in redact("api_key: 'supersecretvalue'")
    assert redact("const key = process.env.API_KEY") == "const key = process.env.API_KEY"
    assert redact('password: "<your-password>"') == 'password: "<your-password>"'
    assert redact('token = "${TOKEN}"') == 'token = "${TOKEN}"'


def test_che_mat_khau_trong_url_ket_noi_va_private_key():
    out = redact("DATABASE_URL=postgresql://admin:p4ssw0rdreal@db.example.com:5432/app")
    assert "p4ssw0rdreal" not in out and "admin:" in out and "@db.example.com" in out
    pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabcdef\n-----END RSA PRIVATE KEY-----"
    assert "MIIEowIBAAKCAQEA" not in redact(f"key:\n{pem}\nxong")
    assert "xong" in redact(f"key:\n{pem}\nxong")


def test_chay_lai_tren_chuoi_da_che_khong_doi_them():
    once = redact(f'k = "{AWS}"; password = "hunter2hunter2"')
    assert redact(once) == once


def test_van_ban_binh_thuong_khong_bi_dong_cham():
    code = "def login(user, password):\n    return check(user, password)  # token hết hạn sau 1 giờ\n"
    assert redact(code) == code


def test_che_ca_khi_key_bi_cat_doi_giua_hai_mau_chu():
    s = StreamRedactor()
    out = s.feed("Key la AKIAIOS") + s.feed("FODNN7EXAMPLE roi") + s.flush()
    assert AWS not in out
    assert "đã che" in out and out.endswith("roi")


def test_stream_giu_nguyen_noi_dung_khi_khong_co_bi_mat():
    s = StreamRedactor()
    chunks = ["Hàm ", "login ", "gọi ", "check", "Password ở ", "auth.py:12"]
    assert "".join(s.feed(c) for c in chunks) + s.flush() == "".join(chunks)


def test_che_gia_tri_mac_dinh_viet_cung_sau_toan_tu_du_phong():
    dong = 'const secureSecret = process.env.VNPAY_HASH_SECRET ?? "Q9X7K2M4P6R8T0V1W3Y5Z7B9D1F3H5J7";'
    out = redact(dong)
    assert "Q9X7K2M4P6R8T0V1W3Y5Z7B9D1F3H5J7" not in out
    assert "process.env.VNPAY_HASH_SECRET" in out and "đã che" in out
    assert redact('const port = process.env.PORT ?? "3000"') == 'const port = process.env.PORT ?? "3000"'
    url = 'const ret = process.env.RETURN_URL ?? "https://example.com/api/v1/payment/vnpay-return"'
    assert redact(url) == url
