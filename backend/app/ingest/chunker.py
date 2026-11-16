"""Cắt một file code thành nhiều đoạn nhỏ để dễ tìm kiếm và nhét vừa vào prompt.

Cách làm khá đơn giản: lấy một cửa sổ khoảng 60 dòng, cố gắng cắt ở dòng trống
gần cuối cửa sổ (thường là ranh giới giữa hai hàm), và cho hai đoạn liền nhau
chồng lên vài dòng để không mất ngữ cảnh ở chỗ cắt.
"""
from dataclasses import dataclass

MAX_LINES = 60
OVERLAP = 8
MAX_CHARS = 3500


@dataclass
class Chunk:
    start_line: int  # đánh số từ 1, gồm cả dòng này
    end_line: int  # gồm cả dòng này
    text: str


def chunk_text(text: str, max_lines: int = MAX_LINES, overlap: int = OVERLAP) -> list[Chunk]:
    lines = text.splitlines()
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

        # giới hạn số ký tự để một đoạn không phình to vì dòng quá dài
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
        # chồng lên vài dòng, nhưng luôn phải tiến về phía trước
        start = max(end - overlap, start + 1)

    return chunks
