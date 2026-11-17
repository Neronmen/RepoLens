"""Chạy bộ đánh giá: lập chỉ mục repo mẫu, hỏi agent từng câu, chấm điểm, ghi kết quả.

Cách chạy (từ thư mục backend, cần GEMINI_API_KEY trong .env):

    python -m eval.run
"""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.agent.loop import run_agent
from app.config import get_settings
from app.db import connect
from app.ingest.github import download_zip, parse_repo_url
from app.ingest.service import index_repo
from app.providers import build_provider
from app.providers.base import RateLimited
from eval.score import Result, judge, render_markdown, summarize

HERE = Path(__file__).parent
PAUSE_SECONDS = 8  # nghỉ giữa các câu để không dội quá nhiều request vào gói miễn phí
RETRY_WAIT_SECONDS = 65  # hạn mức miễn phí tính theo phút, chờ hơn một phút là được cấp lại
RETRIES = 4
RATE_LIMITED = "rate limited by the model provider"


async def ask_once(provider, conn, repo_id: int, label: str, question: dict) -> Result:
    answerable = question.get("answerable", True)
    result = Result(id=question["id"], answerable=answerable, passed=False, reasons=[])
    answer = ""
    citations: list[dict] = []
    try:
        async for ev in run_agent(provider, conn, repo_id, label, question["question"]):
            if ev.type == "token":
                answer += ev.data["text"]
            elif ev.type == "preamble":
                answer = ""  # chữ vừa stream chỉ là lời dẫn trước khi gọi công cụ
            elif ev.type == "citations":
                citations = ev.data["items"]
            elif ev.type == "usage":
                result.tool_calls = ev.data["tool_calls"]
                result.steps = ev.data["steps"]
                result.ms = ev.data["ms"]
                result.tokens = ev.data["input_tokens"] + ev.data["output_tokens"]
            elif ev.type == "error":
                result.error = ev.data["message"]
    except RateLimited:
        result.error = RATE_LIMITED
    except Exception as e:  # noqa: BLE001  một câu lỗi không được làm hỏng cả lượt chạy
        result.error = f"{type(e).__name__}: {e}"

    result.answer = answer
    result.citations_total = len(citations)
    result.citations_valid = sum(1 for c in citations if c["valid"])
    if result.error is None:
        result.passed, result.reasons = judge(question, answer, citations)
    return result


async def ask_with_retry(provider, conn, repo_id: int, label: str, question: dict) -> Result:
    """Gói miễn phí hay báo hết lượt trong phút. Chờ rồi thử lại, vì câu bị chặn tốc độ
    không phải câu trả lời sai và không nên bị tính vào điểm."""
    for attempt in range(1, RETRIES + 1):
        result = await ask_once(provider, conn, repo_id, label, question)
        if result.error != RATE_LIMITED or attempt == RETRIES:
            return result
        print(f"    rate limited, waiting {RETRY_WAIT_SECONDS}s (attempt {attempt}/{RETRIES})", flush=True)
        await asyncio.sleep(RETRY_WAIT_SECONDS)
    return result  # pragma: no cover


async def main() -> int:
    dataset = json.loads((HERE / "dataset.json").read_text(encoding="utf-8"))
    settings = get_settings()
    owner, name = parse_repo_url(dataset["repo"])

    print(f"Indexing {owner}/{name} ...", flush=True)
    conn = connect(":memory:")
    stats = index_repo(conn, owner, name, download_zip(owner, name))
    print(f"  {stats.file_count} files, {stats.chunk_count} chunks", flush=True)

    provider = build_provider(settings)
    results: list[Result] = []
    questions = dataset["questions"]
    for i, q in enumerate(questions, start=1):
        r = await ask_with_retry(provider, conn, stats.repo_id, f"{owner}/{name}", q)
        results.append(r)
        status = "ERROR" if r.error else ("pass" if r.passed else "FAIL")
        print(f"[{i}/{len(questions)}] {q['id']:<20} {status}  {r.ms / 1000:.1f}s  {r.error or '; '.join(r.reasons)}", flush=True)
        if i < len(questions):
            await asyncio.sleep(PAUSE_SECONDS)

    meta = {
        "repo": dataset["repo"],
        "model": settings.gemini_model,
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    summary = summarize(results)
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    payload = {
        "meta": meta,
        "summary": summary,
        "results": [{k: v for k, v in r.__dict__.items() if k != "answer"} | {"answer": r.answer} for r in results],
    }
    (out / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "latest.md").write_text(render_markdown(meta, summary, results), encoding="utf-8")
    print("\n" + json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
