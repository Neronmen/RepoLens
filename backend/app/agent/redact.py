"""Che bí mật (key, token, mật khẩu...) trước khi chúng đi đâu đó.

Repo công khai đôi khi lỡ để lộ key thật. Hỏi "repo này có lộ key không" mà agent
in nguyên giá trị ra thì mình vừa phát tán lại bí mật đó. Vì vậy có hai chốt chặn nằm
ngoài model, không phụ thuộc việc model có "ngoan" hay không:

1. Kết quả công cụ được che trước khi đưa cho model: key thật không rời máy mình sang
   Gemini, và model không thể làm lộ thứ nó chưa từng thấy.
2. Chữ model trả ra cũng được che trước khi gửi cho người dùng, phòng khi nó tự gõ ra
   một chuỗi trông như key.

Chỉ giữ vài ký tự đầu để người dùng nhận ra loại key và biết chỗ nào cần đổi.
"""
import re
from dataclasses import dataclass

# (nhãn, mẫu, số ký tự đầu được giữ lại)
_TOKEN_PATTERNS: list[tuple[str, re.Pattern[str], int]] = [
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), 4),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"), 4),
    ("Google/Gemini key", re.compile(r"\bAQ\.[A-Za-z0-9_\-]{30,}"), 3),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"), 4),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}"), 4),
    ("Stripe key", re.compile(r"\b[sr]k_live_[0-9a-zA-Z]{16,}"), 7),
    ("API key (sk-...)", re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}"), 3),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"), 3),
]

_PRIVATE_KEY = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)", re.DOTALL
)

# user:mật-khẩu@host trong URL kết nối (postgres://u:p@host)
_URL_CRED = re.compile(r"(\b[a-z][a-z0-9+.\-]*://[^\s:/@]+:)([^\s@/]{3,})(@)")

# password = "giá-trị-viết-cứng". Chỉ bắt khi có dấu nháy: process.env.X hay biến khác thì không phải bí mật.
_ASSIGN = re.compile(
    r"""(?ix)
    (\b[\w.\-]*(?:pass(?:word|wd)?|pwd|secret|token|api[_\-]?key|apikey|access[_\-]?key|private[_\-]?key|auth[_\-]?key)[\w\-]*
      ["']?\s*[:=]\s*)
    (["'])([^"'\s\\]{8,})(\2)
    """
)
_PLACEHOLDER = re.compile(r"(?i)example|your[_\-]|xxxx|placeholder|changeme|<.*>|\$\{|\{\{|process\.env|^\*+")

MASK = "****"


def _mask(secret: str, keep: int) -> str:
    return secret[:keep] + MASK


def _assign(m: re.Match[str]) -> str:
    key, q, value, q2 = m.groups()
    if _PLACEHOLDER.search(value) or MASK in value:
        return m.group(0)
    return f"{key}{q}{MASK}[đã che: giá trị viết cứng]{q2}"


def redact(text: str) -> str:
    """Che mọi thứ trông như bí mật trong `text`. Chạy lại trên chuỗi đã che thì không đổi gì thêm."""
    if not text:
        return text
    text = _PRIVATE_KEY.sub("-----BEGIN PRIVATE KEY-----\n****[đã che: private key]\n-----END PRIVATE KEY-----", text)
    for label, pattern, keep in _TOKEN_PATTERNS:
        text = pattern.sub(lambda m, label=label, keep=keep: f"{_mask(m.group(0), keep)}[đã che: {label}]", text)
    text = _URL_CRED.sub(lambda m: f"{m.group(1)}{MASK}[đã che: mật khẩu]{m.group(3)}", text)
    return _ASSIGN.sub(_assign, text)


@dataclass
class StreamRedactor:
    """Che chữ đang chảy từng mẩu nhỏ. Một key có thể bị cắt đôi giữa hai mẩu, nên chỉ phát ra
    phần đã chắc chắn xong (tới khoảng trắng cuối cùng) và giữ phần đuôi lại chờ mẩu sau."""

    _pending: str = ""

    def feed(self, chunk: str) -> str:
        self._pending += chunk
        cut = max(self._pending.rfind(c) for c in (" ", "\n", "\t"))
        if cut < 0:
            return ""
        ready, self._pending = self._pending[: cut + 1], self._pending[cut + 1 :]
        return redact(ready)

    def flush(self) -> str:
        rest, self._pending = self._pending, ""
        return redact(rest)

    def reset(self) -> None:
        self._pending = ""
