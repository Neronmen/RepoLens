"""Test lớp Gemini bằng client giả, không gọi mạng và không cần key."""
import asyncio
from types import SimpleNamespace as NS

import pytest
from google.genai import errors

from app.providers import gemini
from app.providers.base import Message, ModelOverloaded, RateLimited, ToolCall, ToolResult
from app.providers.gemini import GeminiProvider, _to_contents


def part(text=None, fc=None, thought=False, sig=None):
    return NS(text=text, function_call=fc, thought=thought, thought_signature=sig)


def chunk(*parts, usage=None, finish=None):
    cand = NS(content=NS(parts=list(parts)), finish_reason=NS(name=finish) if finish else None)
    return NS(candidates=[cand], usage_metadata=usage)


def luot(*chunks, loi=None):
    """Một lần gọi model giả: phát các chunk rồi (nếu có) ném lỗi giữa chừng."""
    async def gen():
        for c in chunks:
            yield c
        if loi:
            raise loi
    return gen


def api_loi(code):
    return errors.APIError(code, {"error": {"message": "x", "status": "X"}})


class ClientGia:
    def __init__(self, *cac_luot):
        self.cac_luot = list(cac_luot)
        self.so_lan_goi = 0
        self.aio = NS(models=NS(generate_content_stream=self._goi))

    async def _goi(self, **kwargs):
        self.so_lan_goi += 1
        return self.cac_luot.pop(0)()


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr(gemini, "RETRY_DELAYS", (0.0, 0.0))  # khỏi phải chờ thật

    def tao(*cac_luot):
        p = GeminiProvider("khoa-gia", "model-gia")
        p._client = ClientGia(*cac_luot)
        return p

    return tao


def chay(p, tools=None):
    async def gom():
        return [ev async for ev in p.stream([Message("user", "hi")], tools=tools)]

    return asyncio.run(gom())


def test_chuyen_hoi_thoai_sang_dinh_dang_gemini():
    goi = ToolCall(id="c1", name="grep", args={"text": "x"}, signature=b"chu-ky")
    contents = _to_contents([
        Message("user", "hỏi"),
        Message("assistant", "để tìm", tool_calls=[goi]),
        Message("tool", "hết lượt rồi", tool_results=[ToolResult("c1", "grep", "kết quả")]),
    ])
    assert [c.role for c in contents] == ["user", "model", "user"]
    model_parts = contents[1].parts
    assert model_parts[0].text == "để tìm"
    assert model_parts[1].function_call.name == "grep"
    # chữ ký phải được gửi lại đúng part, Gemini 3 từ chối nếu thiếu
    assert model_parts[1].thought_signature == b"chu-ky"
    tool_parts = contents[2].parts
    assert tool_parts[0].function_response.response == {"result": "kết quả"}
    assert tool_parts[1].text == "hết lượt rồi"


def test_doc_chu_cong_cu_va_token(provider):
    fc = NS(id=None, name="grep", args={"text": "x"})
    p = provider(luot(
        chunk(part(text="Để tìm. "), part(fc=fc, sig=b"s")),
        chunk(part(text="suy nghĩ nội bộ", thought=True)),
        chunk(usage=NS(prompt_token_count=10, candidates_token_count=2, thoughts_token_count=7)),
    ))
    ev = chay(p)
    assert ev[0].text == "Để tìm. "
    assert ev[1].tool_call.name == "grep" and ev[1].tool_call.signature == b"s"
    assert ev[1].tool_call.id  # Gemini không gửi id thì mình tự đặt
    assert all("suy nghĩ" not in e.text for e in ev)  # phần "thought" không được lộ ra
    assert (ev[-1].usage.input_tokens, ev[-1].usage.output_tokens) == (10, 9)


def test_part_co_ca_chu_lan_cong_cu_thi_giu_ca_hai(provider):
    fc = NS(id="1", name="grep", args=None)
    ev = chay(provider(luot(chunk(part(text="chữ", fc=fc)))))
    assert ev[0].text == "chữ"
    assert ev[1].tool_call.args == {}


def test_chunk_la_khong_lam_sap(provider):
    rong = NS(candidates=None, usage_metadata=None)
    khong_content = NS(candidates=[NS(content=None, finish_reason=None)], usage_metadata=None)
    khong_parts = NS(candidates=[NS(content=NS(parts=None), finish_reason=None)], usage_metadata=None)
    ev = chay(provider(luot(rong, khong_content, khong_parts)))
    assert len(ev) == 1 and ev[0].usage is not None


def test_cong_cu_ten_rong_bi_bo(provider):
    ev = chay(provider(luot(chunk(part(fc=NS(id="1", name="", args={}))))))
    assert all(e.tool_call is None for e in ev)


def test_429_thoang_qua_duoc_thu_lai(provider):
    p = provider(luot(loi=api_loi(429)), luot(chunk(part(text="ok"))))
    assert chay(p)[0].text == "ok"
    assert p._client.so_lan_goi == 2


def test_503_thoang_qua_duoc_thu_lai(provider):
    p = provider(luot(loi=api_loi(503)), luot(loi=api_loi(503)), luot(chunk(part(text="ok"))))
    assert chay(p)[0].text == "ok"
    assert p._client.so_lan_goi == 3


def test_het_so_lan_thu_thi_bao_loi_de_hieu(provider):
    p = provider(*[luot(loi=api_loi(429))] * 3)
    with pytest.raises(RateLimited):
        chay(p)
    assert p._client.so_lan_goi == 3
    p = provider(*[luot(loi=api_loi(503))] * 3)
    with pytest.raises(ModelOverloaded):
        chay(p)


def test_loi_giua_stream_sau_khi_da_co_chu_thi_khong_thu_lai(provider):
    # thử lại lúc này sẽ làm người dùng thấy câu trả lời bị lặp
    p = provider(luot(chunk(part(text="một nửa")), loi=api_loi(503)), luot(chunk(part(text="lặp"))))
    with pytest.raises(ModelOverloaded):
        chay(p)
    assert p._client.so_lan_goi == 1


def test_loi_khac_khong_bi_nuot_va_khong_thu_lai(provider):
    p = provider(luot(loi=api_loi(400)), luot(chunk(part(text="ok"))))
    with pytest.raises(errors.APIError):
        chay(p)
    assert p._client.so_lan_goi == 1


def test_thieu_khoa_bao_loi_ro_rang():
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        GeminiProvider("", "model")
