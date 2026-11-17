# Image chạy backend. Dùng được trên Render, Hugging Face Spaces, Fly.io...
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# cài thư viện trước để Docker tái sử dụng lớp này khi chỉ có code thay đổi
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# không chạy bằng root trong container
RUN useradd --create-home appuser
USER appuser

# Ổ đĩa của gói miễn phí là tạm thời: database mất khi server khởi động lại, repo sẽ được lập chỉ mục lại khi cần.
ENV DB_PATH=/tmp/repolens.sqlite

# Render và Hugging Face cho biết cổng qua biến PORT (mặc định 8000 khi chạy ở máy mình)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
