"""Chạy bộ đánh giá: lập chỉ mục repo mẫu, hỏi agent từng câu, chấm điểm, ghi kết quả.

Cách chạy (từ thư mục backend, cần GEMINI_API_KEY trong .env):

    python -m eval.run                  # tìm lai (mặc định)
    python -m eval.run --mode keyword   # chỉ FTS5
    python -m eval.run --mode vector    # chỉ embedding

Ba chế độ cho ra ba file trong eval/results/, để so sánh công bằng cùng một bộ câu hỏi.
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.agent.loop import run_agent
from app.config import get_settings
from app import embeddings
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


async def main(mode: str) -> int:
    # đặt trước khi đọc cấu hình, để cả agent lẫn công cụ tìm kiếm cùng dùng chế độ này
    os.environ["SEARCH_MODE"] = mode
    dataset = json.loads((HERE / "dataset.json").read_text(encoding="utf-8"))
    settings = get_settings()
    owner, name = parse_repo_url(dataset["repo"])

    print(f"Indexing {owner}/{name} ...", flush=True)
    conn = connect(":memory:")
    stats = index_repo(conn, owner, name, download_zip(owner, name))
    print(f"  {stats.file_count} files, {stats.chunk_count} chunks", flush=True)
    if mode != "keyword":
        n = embeddings.embed_repo(conn, stats.repo_id)
        print(f"  embedded {n} chunks", flush=True)
        if n == 0:
            print("  no vectors were created (missing key or quota?), refusing to label this run as", mode)
            return 1

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
        "search_mode": mode,
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    summary = summarize(results)
    # tách riêng nhóm câu "diễn đạt khác từ vựng của code", nơi tìm theo nghĩa đáng lẽ phải thắng
    groups = {q["id"]: q.get("group", "keyword-friendly") for q in questions}
    for name in sorted(set(groups.values())):
        part = [r for r in results if groups[r.id] == name]
        summary[f"group:{name}"] = f"{sum(r.passed for r in part)}/{len(part)}"
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    payload = {
        "meta": meta,
        "summary": summary,
        "results": [{k: v for k, v in r.__dict__.items() if k != "answer"} | {"answer": r.answer} for r in results],
    }
    (out / f"{mode}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / f"{mode}.md").write_text(render_markdown(meta, summary, results), encoding="utf-8")
    print("\n" + json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["keyword", "vector", "hybrid"], default="hybrid")
    sys.exit(asyncio.run(main(ap.parse_args().mode)))
