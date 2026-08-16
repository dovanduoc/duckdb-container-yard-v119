"""
Cấu hình đường dẫn và hằng số toàn cục cho hệ thống DEMO_DUCKDB_FASTAPI_V119.
"""

from pathlib import Path

# Thư mục gốc dự án
BASE_DIR = Path(__file__).resolve().parent.parent

# Thư mục dữ liệu
DATA_DIR = BASE_DIR / "data"
RAW_DATA_PATH = DATA_DIR / "raw"
PARQUET_DIR = DATA_DIR / "demo_data_100k"
PROCESSED_DATA_PATH = DATA_DIR / "etl_output"
BENCHMARK_PATH = DATA_DIR / "benchmark"

# Đường dẫn file dữ liệu cụ thể
PARQUET_PATHS = {
    "container": PARQUET_DIR / "container.parquet",
    "container_event": PARQUET_DIR / "container_event.parquet",
    "yard_area": PARQUET_DIR / "yard_area.parquet",
    "shipping_line": PARQUET_DIR / "shipping_line.parquet",
    "daily_yard_capacity": PARQUET_DIR / "daily_yard_capacity.parquet"
}

CONTAINER_CSV_PATH = RAW_DATA_PATH / "container.csv"
ETL_DEMO_INPUT_PATH = DATA_DIR / "etl_input" / "container_etl_demo.csv"
ETL_VALID_PARQUET_PATH = PROCESSED_DATA_PATH / "container_valid.parquet"
ETL_REJECTED_CSV_PATH = PROCESSED_DATA_PATH / "container_rejected.csv"
BENCHMARK_HISTORY_PATH = BENCHMARK_PATH / "benchmark_results.csv"

# Thông tin ứng dụng
APP_TITLE = "Hệ thống Phân tích và Giám sát Container Tồn bãi"
APP_CODE_VERSION = "119.0 - FASTAPI & MODERN WEB SPA"
DATA_SOURCE_NAME = "Bộ dữ liệu thực nghiệm 100.000 lượt (DuckDB Engine)"
