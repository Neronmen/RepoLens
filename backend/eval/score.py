"""Chấm điểm câu trả lời của agent. Toàn bộ là hàm thuần để test được.

Mình chấm bằng luật rõ ràng (có trích dẫn đúng file không, có nhắc đúng khái niệm
không) thay vì nhờ một model khác chấm. Lý do: kết quả lặp lại được, không tốn
thêm lượt gọi model, và ai đọc cũng hiểu vì sao một câu bị trượt.
"""
import re
import statistics
from dataclasses import dataclass, field
from typing import Any

# câu trả lời "không tìm thấy" một cách trung thực, dùng cho câu hỏi không có đáp án trong repo
NOT_FOUND = re.compile(
    r"not (found|present|implemented|part of|include|contain|support)|"
    r"no (such|mention|evidence|code|reference|trace|database|oauth|support)|"
    r"(doesn't|does not|do not|don't|did not|didn't|isn't|is not|aren't|are not|cannot|can't|couldn't|could not) "
    r"(appear|exist|contain|include|have|connect|implement|find|support|use|provide|seem|handle|perform|any)|"
    r"does not seem|unable to find|nothing (about|related|in)|"
    # cách nói "không có" thường gặp bằng tiếng Việt, ví dụ "không kết nối", "không triển khai"
    r"không (tìm thấy|có|thấy|hỗ trợ|kết nối|triển khai|sử dụng|liên quan|đề cập|bao gồm|chứa|dùng|cài đặt|xử lý)|"
    r"chưa (tìm|thấy|có|hỗ trợ)",
    re.IGNORECASE,
)


@dataclass
class Result:
    id: str
    answerable: bool
    passed: bool
    reasons: list[str]  # vì sao trượt, rỗng nếu đạt
    citations_total: int = 0
    citations_valid: int = 0
    tool_calls: int = 0
    steps: int = 0
    ms: int = 0
    tokens: int = 0
    error: str | None = None
    answer: str = field(default="", repr=False)


def judge(question: dict[str, Any], answer: str, citations: list[dict]) -> tuple[bool, list[str]]:
    """Trả về (đạt không, danh sách lý do trượt)."""
    reasons: list[str] = []

    if question.get("answerable", True) is False:
        if not NOT_FOUND.search(answer):
            reasons.append("expected an honest 'not found', but the answer did not say so")
        # đã nhận là không có mà vẫn trích dẫn "hợp lệ" thì thường là đang bịa ra một đáp án
        return (not reasons), reasons

    must_cite = question.get("must_cite", [])
    if must_cite and not any(c["valid"] and any(c["path"].endswith(m) for m in must_cite) for c in citations):
        reasons.append(f"no valid citation of {' or '.join(must_cite)}")

    for group in question.get("must_mention", []):
        if not any(re.search(p, answer, re.IGNORECASE) for p in group):
            reasons.append(f"answer never mentions: {' | '.join(group)}")

    if not answer.strip():
        reasons.append("empty answer")
    return (not reasons), reasons


def summarize(results: list[Result]) -> dict[str, Any]:
    ok = [r for r in results if r.error is None]
    cites_total = sum(r.citations_total for r in ok)
    cites_valid = sum(r.citations_valid for r in ok)
    answerable = [r for r in ok if r.answerable]
    refusals = [r for r in ok if not r.answerable]

    def pct(a: int, b: int) -> float | None:
        return round(100 * a / b, 1) if b else None

    return {
        "questions": len(results),
        "errors": len(results) - len(ok),
        "pass_rate": pct(sum(r.passed for r in ok), len(ok)),
        "answerable_pass_rate": pct(sum(r.passed for r in answerable), len(answerable)),
        "honest_refusal_rate": pct(sum(r.passed for r in refusals), len(refusals)),
        "citation_validity": pct(cites_valid, cites_total),
        "citations_total": cites_total,
        "median_latency_s": round(statistics.median(r.ms for r in ok) / 1000, 1) if ok else None,
        "mean_tool_calls": round(statistics.mean(r.tool_calls for r in ok), 1) if ok else None,
        "mean_tokens": round(statistics.mean(r.tokens for r in ok)) if ok else None,
    }


def render_markdown(meta: dict[str, Any], summary: dict[str, Any], results: list[Result]) -> str:
    def fmt(v: Any, unit: str = "") -> str:
        return "n/a" if v is None else f"{v}{unit}"

    lines = [
        f"# Eval results: {meta['repo']}",
        "",
        f"- Model: `{meta['model']}`",
        f"- Run at: {meta['run_at']}",
        f"- Questions: {summary['questions']} ({summary['errors']} errored)",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Overall pass rate | {fmt(summary['pass_rate'], '%')} |",
        f"| Answerable questions answered correctly | {fmt(summary['answerable_pass_rate'], '%')} |",
        f"| Unanswerable questions honestly refused | {fmt(summary['honest_refusal_rate'], '%')} |",
        f"| Citations that resolve to real lines | {fmt(summary['citation_validity'], '%')} (of {summary['citations_total']}) |",
        f"| Median time to a full answer | {fmt(summary['median_latency_s'], 's')} |",
        f"| Mean tool calls per question | {fmt(summary['mean_tool_calls'])} |",
        f"| Mean tokens per question | {fmt(summary['mean_tokens'])} |",
        "",
        "| Question | Result | Citations (valid/total) | Tools | Time |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        status = "error" if r.error else ("pass" if r.passed else "FAIL")
        lines.append(
            f"| {r.id} | {status} | {r.citations_valid}/{r.citations_total} | {r.tool_calls} | {r.ms / 1000:.1f}s |"
        )
    failed = [r for r in results if not r.passed]
    if failed:
        lines += ["", "## Why questions failed", ""]
        for r in failed:
            why = r.error or "; ".join(r.reasons)
            lines.append(f"- **{r.id}**: {why}")
    lines.append("")
    return "\n".join(lines)
