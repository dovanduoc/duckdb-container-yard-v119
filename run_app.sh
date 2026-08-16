#!/usr/bin/env bash
# ==============================================================================
# HỆ THỐNG PHÂN TÍCH VÀ GIÁM SÁT CONTAINER TỒN BÃI - FASTAPI & DUCKDB V119
# ==============================================================================

set -e
echo "=============================================================================="
echo "  HỆ THỐNG PHÂN TÍCH VÀ GIÁM SÁT CONTAINER TỒN BÃI (FASTAPI & DUCKDB V119)"
echo "=============================================================================="
echo ""

# Kiểm tra Python
if ! command -v python3 &> /dev/null; then
    echo "[LỖI] Không tìm thấy Python 3 trên hệ thống."
    exit 1
fi

# Cài đặt thư viện nếu chưa có
echo "[1/3] Kiểm tra môi trường thư viện..."
python3 -c "import fastapi, uvicorn, duckdb, pandas" 2>/dev/null || {
    echo "[THÔNG BÁO] Đang cài đặt thư viện..."
    pip install -r requirements.txt
}

# Khởi chạy server
echo "[2/3] Đang khởi động máy chủ FastAPI & DuckDB Engine..."
echo "[3/3] Trình duyệt web: http://localhost:8000"
echo ""

python3 app_server.py
