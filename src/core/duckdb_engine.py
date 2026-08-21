"""
Quản lý kết nối DuckDB và khởi tạo các View nghiệp vụ.
"""

import threading
import duckdb
import pandas as pd

from src.config import (
    PARQUET_PATHS,
    CONTAINER_CSV_PATH,
    ETL_DEMO_INPUT_PATH,
    RAW_DATA_PATH
)

# FastAPI có thể thực thi các endpoint sync trên nhiều worker thread.
# Mỗi thread giữ một DuckDB connection riêng để không dùng chung state/TEMP TABLE.
_thread_state = threading.local()
_init_lock = threading.Lock()


def escape_duckdb_path(file_path):
    """Chuyển đường dẫn thành chuỗi an toàn cho câu SQL DuckDB."""
    return str(file_path).replace("\\", "/").replace("'", "''")


def get_connection():
    """Lấy hoặc tạo DuckDB in-memory connection riêng cho thread hiện tại."""
    con = getattr(_thread_state, "connection", None)
    if con is None:
        con = duckdb.connect()
        # Chỉ khóa bước bootstrap file/view để tránh race khi nhiều request đầu tiên đến cùng lúc.
        with _init_lock:
            init_duckdb_views(con)
        _thread_state.connection = con
    return con


def close_connection():
    """Đóng DuckDB connection của thread hiện tại (nếu có)."""
    con = getattr(_thread_state, "connection", None)
    if con is not None:
        try:
            con.close()
        finally:
            _thread_state.connection = None


def init_duckdb_views(con):
    """Khởi tạo 6 TEMP VIEW phục vụ phân tích nghiệp vụ."""
    missing_files = [
        str(path) for name, path in PARQUET_PATHS.items() if not path.exists()
    ]
    if missing_files:
        raise FileNotFoundError(
            "Thiếu các file Parquet nghiệp vụ:\n- " + "\n- ".join(missing_files)
        )

    # 1. Bảo đảm container.csv sẵn sàng
    if not CONTAINER_CSV_PATH.exists():
        RAW_DATA_PATH.mkdir(parents=True, exist_ok=True)
        con.execute(f"""
            COPY (
                SELECT *
                FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["container"])}')
            )
            TO '{escape_duckdb_path(CONTAINER_CSV_PATH)}'
            (FORMAT CSV, HEADER TRUE)
        """)

    # 2. Tạo CSV demo 204 dòng (200 đúng + 4 sai) nếu chưa có
    if not ETL_DEMO_INPUT_PATH.exists():
        _prepare_etl_demo_csv(con)

    # 3. Tạo 6 TEMP VIEW.
    # v_container chuẩn hóa hist theo temporal truth: Gate-Out hợp lệ là bằng chứng đã ra bãi,
    # tránh trường hợp hist='N' làm container bị tính tồn sau Gate-Out.
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW v_container AS
        SELECT
            * EXCLUDE (hist),
            CASE
                WHEN TRY_CAST(gate_in_ts AS TIMESTAMP) IS NOT NULL
                 AND TRY_CAST(gate_out_ts AS TIMESTAMP) IS NOT NULL
                 AND TRY_CAST(gate_out_ts AS TIMESTAMP) >= TRY_CAST(gate_in_ts AS TIMESTAMP)
                    THEN 'Y'
                ELSE UPPER(TRIM(hist))
            END AS hist
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["container"])}');

        CREATE OR REPLACE TEMP VIEW v_container_event AS
        SELECT *
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["container_event"])}');

        CREATE OR REPLACE TEMP VIEW v_yard_area AS
        SELECT *
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["yard_area"])}');

        CREATE OR REPLACE TEMP VIEW v_shipping_line AS
        SELECT *
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["shipping_line"])}');

        CREATE OR REPLACE TEMP VIEW v_daily_yard_capacity AS
        SELECT *
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["daily_yard_capacity"])}');

        CREATE OR REPLACE TEMP VIEW v_container_type_ref AS
        SELECT DISTINCT
            TRIM(container_type) AS container_type,
            COALESCE(
                TRY_CAST(REGEXP_EXTRACT(container_type, '^[0-9]+') AS INTEGER),
                TRY_CAST(container_size AS INTEGER),
                20
            ) AS container_size_feet
        FROM v_container
        WHERE container_type IS NOT NULL AND TRIM(container_type) != '';
    """)


def _prepare_etl_demo_csv(con):
    """Trích xuất 200 dòng hợp lệ và bổ sung 4 dòng sai quy tắc để trình diễn Data Contract Quality."""
    ETL_DEMO_INPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sample_df = con.execute(f"""
        SELECT *
        FROM read_parquet('{escape_duckdb_path(PARQUET_PATHS["container"])}')
        LIMIT 200
    """).df()

    now_ts = pd.Timestamp.now()
    error_rows = pd.DataFrame([
        {
            "container_id": 999901,
            "container_no": "INVALID_NO_123",
            "shipping_line_id": 1,
            "yard_area_id": 1,
            "container_size": 20,
            "container_type": "20DC",
            "full_empty": "F",
            "gate_in_ts": now_ts - pd.Timedelta(days=5),
            "gate_out_ts": None,
            "hist": "N"
        },
        {
            "container_id": 999902,
            "container_no": "SITU9999021",
            "shipping_line_id": 1,
            "yard_area_id": 1,
            "container_size": 99,
            "container_type": "99XX",
            "full_empty": "F",
            "gate_in_ts": now_ts - pd.Timedelta(days=10),
            "gate_out_ts": None,
            "hist": "N"
        },
        {
            "container_id": 999903,
            "container_no": "SITU9999032",
            "shipping_line_id": 1,
            "yard_area_id": 1,
            "container_size": 40,
            "container_type": "40HC",
            "full_empty": "F",
            "gate_in_ts": now_ts - pd.Timedelta(days=2),
            "gate_out_ts": now_ts - pd.Timedelta(days=4),
            "hist": "Y"
        },
        {
            "container_id": 999904,
            "container_no": "SITU9999043",
            "shipping_line_id": 1,
            "yard_area_id": 1,
            "container_size": 20,
            "container_type": "20DC",
            "full_empty": "X",
            "gate_in_ts": now_ts - pd.Timedelta(days=1),
            "gate_out_ts": None,
            "hist": "N"
        }
    ])

    demo_df = pd.concat([sample_df, error_rows], ignore_index=True)
    demo_df.to_csv(ETL_DEMO_INPUT_PATH, index=False)
