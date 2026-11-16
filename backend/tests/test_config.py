from app.config import Settings


def test_cors_doc_duoc_danh_sach_cach_nhau_dau_phay(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.vercel.app, https://b.dev ,")
    assert Settings().cors_origins == ["https://a.vercel.app", "https://b.dev"]


def test_cors_mot_gia_tri_khong_lam_sap_app(monkeypatch):
    # trước đây pydantic đòi định dạng JSON và app chết ngay lúc khởi động
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    assert Settings().cors_origins == ["https://app.example.com"]


def test_cors_mac_dinh_cho_phep_vite_dev(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert "http://localhost:5173" in Settings().cors_origins
