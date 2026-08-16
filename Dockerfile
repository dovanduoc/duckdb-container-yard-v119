# ==============================================================================
# DOCKERFILE CHO FASTAPI & DUCKDB CONTAINER YARD PLATFORM
# Dùng để deploy miễn phí lên Hugging Face Spaces, Render, Koyeb, Fly.io
# ==============================================================================

FROM python:3.11-slim

WORKDIR /app

# Cài đặt thư viện
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --only-binary :all: -r requirements.txt || \
    pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn và dữ liệu
COPY . .

# Mở cổng mặc định (7860 cho Hugging Face Spaces / 8000 cho Render & Docker)
ENV PORT=7860
EXPOSE 7860

# Khởi chạy server FastAPI bằng Uvicorn
CMD ["uvicorn", "app_server:app", "--host", "0.0.0.0", "--port", "7860"]
