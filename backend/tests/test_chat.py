import json

from fastapi.testclient import TestClient

from app.chat import get_provider
from app.main import app
from app.providers.base import StreamEvent, Usage


class ProviderGia:
    """Model giả để test không cần key và không tốn tiền."""

    async def stream(self, messages, system=""):
        for mau in ["Xin ", "chào ", "bạn"]:
            yield StreamEvent(text=mau)
        yield StreamEvent(usage=Usage(input_tokens=5, output_tokens=3))


class ProviderLoi:
    async def stream(self, messages, system=""):
        raise RuntimeError("bí mật không được lộ ra ngoài")
        yield  # noqa: biến hàm này thành async generator


def doc_sse(text: str):
    ket_qua = []
    for khoi in text.strip().split("\n\n"):
        dong = khoi.split("\n")
        ket_qua.append((dong[0].removeprefix("event: "), json.loads(dong[1].removeprefix("data: "))))
    return ket_qua


def goi(provider, body):
    app.dependency_overrides[get_provider] = lambda: provider
    try:
        return TestClient(app).post("/api/chat", json=body)
    finally:
        app.dependency_overrides.clear()


def test_stream_tra_ve_token_usage_va_done():
    res = goi(ProviderGia(), {"messages": [{"role": "user", "content": "hi"}]})
    ev = doc_sse(res.text)
    assert [e for e, _ in ev] == ["token", "token", "token", "usage", "done"]
    assert "".join(d["text"] for e, d in ev if e == "token") == "Xin chào bạn"


def test_loi_tu_model_khong_lo_chi_tiet():
    res = goi(ProviderLoi(), {"messages": [{"role": "user", "content": "hi"}]})
    assert "bí mật" not in res.text
    assert doc_sse(res.text)[0][0] == "error"


def test_tu_choi_tin_nhan_rong_hoac_role_la():
    assert goi(ProviderGia(), {"messages": []}).status_code == 422
    assert goi(ProviderGia(), {"messages": [{"role": "system", "content": "x"}]}).status_code == 422
