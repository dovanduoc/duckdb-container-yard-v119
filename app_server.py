"""
Hệ Thống Phân Tích & Giám Sát Container Tồn Bãi - DuckDB Engine.
Phiên bản 119.0 - FastAPI Backend & Modern Web SPA Architecture.
Hỗ trợ cả chạy cục bộ (Windows/Linux/macOS) và Deploy Cloud (Render, Hugging Face, Koyeb).
"""

import sys
import os
import socket
import webbrowser
import threading
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn

from src.config import APP_TITLE, APP_CODE_VERSION, DATA_SOURCE_NAME
from src.core.duckdb_engine import get_connection
from src.api.routes import api_router

# Khởi tạo FastAPI App
app = FastAPI(
    title=APP_TITLE,
    version=APP_CODE_VERSION,
    description="Hệ thống phân tích và giám sát container tồn bãi sử dụng DuckDB & Apache Parquet",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn API Router
app.include_router(api_router)

# Mount thư mục Static
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    """Phục vụ file Single Page Application chính."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/favicon.ico")
def serve_favicon():
    """Phục vụ biểu tượng Favicon của website."""
    return FileResponse(str(STATIC_DIR / "favicon.svg"))


def find_free_port(start_port=8000, max_tries=30):
    """Tự động tìm cổng còn trống để khởi chạy máy chủ."""
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    return start_port


def open_browser_delayed(url, delay_seconds=1.2):
    """Tự động mở trình duyệt sau khi server sẵn sàng (chỉ chạy trên môi trường cục bộ)."""
    # Không mở trình duyệt nếu đang chạy trên cloud (Docker / Render / Hugging Face)
    if os.environ.get("PORT") or os.environ.get("RENDER") or os.environ.get("SPACE_ID"):
        return

    def _open():
        time.sleep(delay_seconds)
        try:
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=_open, daemon=True).start()


def main():
    print("=" * 65)
    print(f"HỆ THỐNG PHÂN TÍCH VÀ GIÁM SÁT CONTAINER TỒN BÃI")
    print(f"PHIÊN BẢN: {APP_CODE_VERSION}")
    print(f"NGUỒN DỮ LIỆU: {DATA_SOURCE_NAME}")
    print("=" * 65)

    # 1. Khởi động DuckDB Engine in-memory
    print("\n[1/3] Đang nạp DuckDB OLAP Engine & 6 Views nghiệp vụ...")
    get_connection()
    print("      -> DuckDB Engine sẵn sàng 100%!")

    # 2. Xác định cổng (Ưu tiên biến môi trường PORT từ Cloud, nếu không thì tìm port 8000)
    env_port = os.environ.get("PORT")
    if env_port:
        active_port = int(env_port)
    else:
        active_port = find_free_port(start_port=8000)

    app_url = f"http://localhost:{active_port}"
    api_docs_url = f"http://localhost:{active_port}/docs"

    print("\n[2/3] Khởi chạy FastAPI Server:")
    print(f"      - Cổng hoạt động:     {active_port}")
    print(f"      - Giao diện Web SPA:  {app_url}")
    print(f"      - Swagger API Docs:   {api_docs_url}")

    # 3. Mở trình duyệt nếu chạy cục bộ
    print("\n[3/3] Đang mở trình duyệt web...")
    open_browser_delayed(app_url, delay_seconds=1.2)

    # 4. Chạy Uvicorn Server
    uvicorn.run(app, host="0.0.0.0", port=active_port, log_level="info")


if __name__ == "__main__":
    main()
