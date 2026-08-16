"""
Quản lý kết nối DuckDB và khởi tạo các View nghiệp vụ.
"""

from pathlib import Path
import duckdb
import pandas as pd

from src.config import (
    PARQUET_PATHS,
    CONTAINER_CSV_PATH,
    ETL_DEMO_INPUT_PATH,
    RAW_DATA_PATH
)

_connection = None


def escape_duckdb_path(file_path):
    """Chuyển đường dẫn thành chuỗi an toàn cho câu SQL DuckDB."""
    return str(file_path).replace("\\", "/").replace("'", "''")


def get_connection():
    """Lấy hoặc tạo kết nối DuckDB in-memory duy nhất."""
    global _connection
    if _connection is None:
        _connection = duckdb.connect()
        init_duckdb_views(_connection)
    return _connection


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

    # 3. Tạo 6 TEMP VIEW
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW v_container AS
        SELECT *
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
            container_type,
            CAST(
                REGEXP_EXTRACT(container_type, '^[0-9]+') AS INTEGER
            ) AS container_size_feet
        FROM v_container
        WHERE container_type IS NOT NULL;
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
