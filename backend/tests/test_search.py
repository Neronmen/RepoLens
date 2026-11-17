from app import embeddings, search
from app.db import connect
from app.ingest.service import index_repo
from tests.test_ingest import tao_zip

ZIP = tao_zip({
    "r/auth.py": "def login_user(name):\n    return name\n",
    "r/guard.py": "def reject_tampered(token):\n    raise ValueError('bad signature')\n",
})


class FakeEmbedder:
    """Vector giả: đoạn nào chứa 'tampered' thì giống câu hỏi 'forgery', còn lại thì không."""

    def embed(self, texts, *, query):
        out = []
        for t in texts:
            hit = "tampered" in t or "forgery" in t
            out.append([1.0, 0.0] if hit else [0.0, 1.0])
        return out


def _repo():
    conn = connect(":memory:")
    stats = index_repo(conn, "a", "b", ZIP)
    return conn, stats.repo_id


def test_rrf_dua_doan_xuat_hien_o_ca_hai_danh_sach_len_dau():
    assert search.rrf([[1, 2, 3], [3, 4]])[0] == 3


def test_rrf_dong_diem_thi_lay_id_nho_hon():
    assert search.rrf([[5], [2]]) == [2, 5]


def test_vector_tim_duoc_khi_khong_trung_tu_khoa(monkeypatch):
    conn, repo_id = _repo()
    fake = FakeEmbedder()
    monkeypatch.setattr(embeddings, "get_embedder", lambda: fake)
    assert embeddings.embed_repo(conn, repo_id) == 2

    # "forgery" không xuất hiện ở đâu trong code nên FTS5 chịu thua
    assert search.hybrid_search(conn, repo_id, "forgery", mode="keyword") == []
    hits = search.hybrid_search(conn, repo_id, "forgery", mode="hybrid")
    assert hits[0]["path"] == "guard.py"


def test_khong_co_vector_thi_van_tim_tu_khoa(monkeypatch):
    conn, repo_id = _repo()
    monkeypatch.setattr(embeddings, "get_embedder", lambda: FakeEmbedder())
    hits = search.hybrid_search(conn, repo_id, "login", mode="hybrid")
    assert hits[0]["path"] == "auth.py"


def test_api_embedding_loi_thi_quay_ve_tu_khoa(monkeypatch):
    conn, repo_id = _repo()
    monkeypatch.setattr(embeddings, "get_embedder", lambda: FakeEmbedder())
    embeddings.embed_repo(conn, repo_id)

    class Broken:
        def embed(self, texts, *, query):
            raise RuntimeError("hết hạn mức")

    monkeypatch.setattr(embeddings, "get_embedder", lambda: Broken())
    hits = search.hybrid_search(conn, repo_id, "login", mode="hybrid")
    assert hits[0]["path"] == "auth.py"


def test_embed_loi_giua_chung_van_giu_phan_da_lam(monkeypatch):
    conn, repo_id = _repo()

    class Once:
        calls = 0

        def embed(self, texts, *, query):
            self.calls += 1
            raise RuntimeError("429")

    assert embeddings.embed_repo(conn, repo_id, Once()) == 0
    assert not embeddings.has_vectors(conn, repo_id)


def test_lap_chi_muc_lai_thi_vector_cu_bi_xoa(monkeypatch):
    conn, repo_id = _repo()
    embeddings.embed_repo(conn, repo_id, FakeEmbedder())
    assert embeddings.has_vectors(conn, repo_id)
    index_repo(conn, "a", "b", ZIP)
    assert not embeddings.has_vectors(conn, repo_id)


def test_vector_nhan_gui_di_dung_loai(monkeypatch):
    seen = []

    class Spy(FakeEmbedder):
        def embed(self, texts, *, query):
            seen.append(query)
            return super().embed(texts, query=query)

    conn, repo_id = _repo()
    embeddings.embed_repo(conn, repo_id, Spy())
    monkeypatch.setattr(embeddings, "get_embedder", lambda: Spy())
    search.hybrid_search(conn, repo_id, "forgery", mode="vector")
    assert seen == [False, True]
