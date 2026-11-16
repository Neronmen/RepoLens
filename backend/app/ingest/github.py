"""Tải mã nguồn của một repo GitHub công khai về dưới dạng file zip.

Tải zip thay vì `git clone` để server không cần cài git, và để mình kiểm soát
được dung lượng ngay trong lúc tải.
"""
import re

import httpx

MAX_ZIP_BYTES = 40 * 1024 * 1024  # 40MB là quá đủ cho một repo để hỏi đáp

# Chỉ nhận đúng dạng github.com/<owner>/<repo>, không nhận host nào khác.
# Nhờ vậy người dùng không thể lừa server gọi vào địa chỉ nội bộ (SSRF).
_URL = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/"
    r"(?P<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})/"
    r"(?P<name>[A-Za-z0-9._-]{1,100}?)(?:\.git)?/?$"
)
_SHORT = re.compile(r"^(?P<owner>[A-Za-z0-9][A-Za-z0-9-]{0,38})/(?P<name>[A-Za-z0-9._-]{1,100})$")


class RepoError(Exception):
    """Lỗi có thể nói thẳng cho người dùng biết (link sai, repo không tồn tại...)."""


def parse_repo_url(url: str) -> tuple[str, str]:
    url = url.strip()
    m = _URL.match(url) or _SHORT.match(url)
    if not m or m["name"] in {".", ".."}:
        raise RepoError("Link không hợp lệ. Ví dụ đúng: https://github.com/pallets/flask")
    return m["owner"], m["name"]


def download_zip(owner: str, name: str) -> bytes:
    url = f"https://codeload.github.com/{owner}/{name}/zip/HEAD"
    try:
        with httpx.Client(timeout=30, follow_redirects=False) as client:
            with client.stream("GET", url) as res:
                if res.status_code == 404:
                    raise RepoError("Không tìm thấy repo này (hoặc nó là repo riêng tư).")
                if res.status_code != 200:
                    raise RepoError(f"GitHub trả về lỗi {res.status_code}, thử lại sau nhé.")

                # đếm dung lượng trong lúc tải, vượt ngưỡng là dừng ngay
                data = bytearray()
                for part in res.iter_bytes():
                    data.extend(part)
                    if len(data) > MAX_ZIP_BYTES:
                        raise RepoError("Repo này lớn quá (hơn 40MB), hiện chưa hỗ trợ.")
                return bytes(data)
    except httpx.HTTPError as e:
        raise RepoError("Không kết nối được tới GitHub, thử lại sau nhé.") from e
