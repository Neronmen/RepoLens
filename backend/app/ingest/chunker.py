"""Cắt một file code thành nhiều đoạn nhỏ để dễ tìm kiếm và nhét vừa vào prompt.

Cách làm khá đơn giản: lấy một cửa sổ khoảng 60 dòng, cố gắng cắt ở dòng trống
gần cuối cửa sổ (thường là ranh giới giữa hai hàm), và cho hai đoạn liền nhau
chồng lên vài dòng để không mất ngữ cảnh ở chỗ cắt.
"""
from dataclasses import dataclass

MAX_LINES = 60
OVERLAP = 8
MAX_CHARS = 3500
MAX_LINE_CHARS = 500


@dataclass
class Chunk:
    start_line: int  # đánh số từ 1, gồm cả dòng này
    end_line: int  # gồm cả dòng này
    text: str


def split_lines(text: str) -> list[str]:
    """Tách dòng giống cách GitHub và editor đếm.

    Không dùng `str.splitlines()` vì nó còn tách ở mấy ký tự lạ như form feed,
    làm số dòng trong trích dẫn bị lệch so với khi mở file trên GitHub.
    """
    lines = [line.removesuffix("\r") for line in text.split("\n")]
    if lines and lines[-1] == "":
        lines.pop()  # file kết thúc bằng xuống dòng thì không tính thêm một dòng rỗng
    return lines


def _shorten(line: str) -> str:
    # dòng dài bất thường (json một dòng, code bundle) thì chỉ giữ phần đầu
    if len(line) <= MAX_LINE_CHARS:
        return line
    return line[:MAX_LINE_CHARS] + " …"


def chunk_text(text: str, max_lines: int = MAX_LINES, overlap: int = OVERLAP) -> list[Chunk]:
    lines = [_shorten(line) for line in split_lines(text)]
    n = len(lines)
    chunks: list[Chunk] = []
    start = 0

    while start < n:
        end = min(start + max_lines, n)

        # file còn dài thì thử lùi về dòng trống gần nhất trong 1/3 cuối cửa sổ
        if end < n:
            floor = start + (max_lines * 2) // 3
            for i in range(end - 1, floor, -1):
                if not lines[i].strip():
                    end = i + 1
                    break

        # giới hạn số ký tự để một đoạn không phình to vì nhiều dòng dài
        size = 0
        for i in range(start, end):
            size += len(lines[i]) + 1
            if size > MAX_CHARS and i > start:
                end = i
                break

        body = "\n".join(lines[start:end])
        if body.strip():
            chunks.append(Chunk(start_line=start + 1, end_line=end, text=body))

        if end >= n:
            break
        # Chồng lên tối đa 1/4 đoạn vừa cắt. Nếu để cố định 8 dòng thì với đoạn
        # ngắn (toàn dòng dài) mỗi dòng sẽ bị lặp lại trong rất nhiều đoạn.
        step_back = min(overlap, (end - start) // 4)
        start = max(end - step_back, start + 1)

    return chunks
