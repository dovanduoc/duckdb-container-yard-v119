"""
Dịch vụ ETL và Kiểm soát chất lượng dữ liệu (Data Contract Quality).
Thực thi 10 quy tắc hợp đồng dữ liệu, tách dòng hợp lệ (Parquet) và dòng sai lệch (CSV).
"""

from pathlib import Path
import pandas as pd
from src.config import (
    ETL_DEMO_INPUT_PATH,
    CONTAINER_CSV_PATH,
    ETL_VALID_PARQUET_PATH,
    ETL_REJECTED_CSV_PATH
)
from src.core.duckdb_engine import get_connection, escape_duckdb_path


def resolve_etl_csv_path(source_type, uploaded_file):
    """Xác định đường dẫn file CSV đầu vào cho quy trình ETL."""
    if source_type == "demo":
        return ETL_DEMO_INPUT_PATH
    elif source_type == "raw":
        return CONTAINER_CSV_PATH
    elif source_type == "upload":
        if uploaded_file is None:
            raise ValueError("Vui lòng tải lên file CSV để thực hiện ETL.")
        return Path(uploaded_file.name if hasattr(uploaded_file, "name") else str(uploaded_file))
    else:
        return ETL_DEMO_INPUT_PATH


def classify_container_csv(csv_file_path):
    """
    Sử dụng DuckDB SQL để phân loại dữ liệu theo 10 quy tắc hợp đồng dữ liệu.
    """
    con = get_connection()
    safe_path = escape_duckdb_path(csv_file_path)

    # Đọc dữ liệu đầu vào
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE stage_container_raw AS
        SELECT *
        FROM read_csv_auto(
            '{safe_path}',
            header = true,
            all_varchar = true
        )
    """)

    # Kiểm tra 10 quy tắc hợp đồng
    con.execute("""
        CREATE OR REPLACE TEMP TABLE stage_container_classified AS
        WITH rules_applied AS (
            SELECT
                r.*,
                CASE
                    -- Rule 1: container_id bắt buộc và là số nguyên dương
                    WHEN container_id IS NULL OR TRIM(container_id) = '' OR TRY_CAST(container_id AS BIGINT) IS NULL OR TRY_CAST(container_id AS BIGINT) <= 0
                        THEN 'Rule 01: container_id không hợp lệ hoặc thiếu'

                    -- Rule 2: container_no đúng chuẩn ISO 6346 (4 chữ cái + 7 số)
                    WHEN container_no IS NULL OR NOT REGEXP_MATCHES(TRIM(container_no), '^[A-Z]{4}[0-9]{7}$')
                        THEN 'Rule 02: container_no sai định dạng ISO 6346'

                    -- Rule 3: shipping_line_id hợp lệ và tồn tại trong danh mục v_shipping_line
                    WHEN shipping_line_id IS NULL OR TRY_CAST(shipping_line_id AS BIGINT) IS NULL
                         OR TRY_CAST(shipping_line_id AS BIGINT) NOT IN (SELECT shipping_line_id FROM v_shipping_line)
                        THEN 'Rule 03: shipping_line_id không tồn tại trong danh mục'

                    -- Rule 4: yard_area_id hợp lệ và tồn tại trong danh mục v_yard_area
                    WHEN yard_area_id IS NULL OR TRY_CAST(yard_area_id AS BIGINT) IS NULL
                         OR TRY_CAST(yard_area_id AS BIGINT) NOT IN (SELECT yard_area_id FROM v_yard_area)
                        THEN 'Rule 04: yard_area_id không tồn tại trong danh mục'

                    -- Rule 5: container_size thuộc {20, 40, 45}
                    WHEN container_size IS NULL OR TRY_CAST(container_size AS INTEGER) NOT IN (20, 40, 45)
                        THEN 'Rule 05: container_size không thuộc {20, 40, 45}'

                    -- Rule 6: container_type bắt buộc, tồn tại trong danh mục và tương thích size
                    WHEN container_type IS NULL OR TRIM(container_type) = ''
                         OR TRIM(container_type) NOT IN (SELECT container_type FROM v_container_type_ref)
                         OR (
                             TRY_CAST(REGEXP_EXTRACT(TRIM(container_type), '^[0-9]+') AS INTEGER) IS NOT NULL
                             AND TRY_CAST(container_size AS INTEGER) IS NOT NULL
                             AND TRY_CAST(REGEXP_EXTRACT(TRIM(container_type), '^[0-9]+') AS INTEGER) != TRY_CAST(container_size AS INTEGER)
                         )
                        THEN 'Rule 06: container_type không thuộc danh mục hoặc sai lệch kích thước'

                    -- Rule 7: full_empty thuộc {'F', 'E'}
                    WHEN full_empty IS NULL OR UPPER(TRIM(full_empty)) NOT IN ('F', 'E')
                        THEN 'Rule 07: full_empty phải là F hoặc E'

                    -- Rule 8: gate_in_ts bắt buộc và đúng chuẩn thời gian
                    WHEN gate_in_ts IS NULL OR TRY_CAST(gate_in_ts AS TIMESTAMP) IS NULL
                        THEN 'Rule 08: gate_in_ts không hợp lệ'

                    -- Rule 9: gate_out_ts phải sau gate_in_ts nếu có
                    WHEN gate_out_ts IS NOT NULL AND TRIM(gate_out_ts) != '' AND (
                        TRY_CAST(gate_out_ts AS TIMESTAMP) IS NULL OR
                        TRY_CAST(gate_out_ts AS TIMESTAMP) <= TRY_CAST(gate_in_ts AS TIMESTAMP)
                    ) THEN 'Rule 09: gate_out_ts phải sau gate_in_ts'

                    -- Rule 10: hist thuộc {'Y', 'N'}
                    WHEN hist IS NULL OR UPPER(TRIM(hist)) NOT IN ('Y', 'N')
                        THEN 'Rule 10: hist phải là Y hoặc N'

                    ELSE 'VALID'
                END AS data_quality_status
            FROM stage_container_raw AS r
        )
        SELECT *
        FROM rules_applied
    """)

    # Đếm số lượng hợp lệ và lỗi
    summary_df = con.execute("""
        SELECT
            COUNT(*) AS total_rows,
            COUNT(CASE WHEN data_quality_status = 'VALID' THEN 1 END) AS valid_rows,
            COUNT(CASE WHEN data_quality_status != 'VALID' THEN 1 END) AS error_rows
        FROM stage_container_classified
    """).df()

    total_rows = int(summary_df.loc[0, "total_rows"])
    valid_rows = int(summary_df.loc[0, "valid_rows"])
    error_rows = int(summary_df.loc[0, "error_rows"])

    valid_df = con.execute("""
        SELECT
            TRY_CAST(container_id AS BIGINT) AS container_id,
            TRIM(container_no) AS container_no,
            TRY_CAST(shipping_line_id AS BIGINT) AS shipping_line_id,
            TRY_CAST(yard_area_id AS BIGINT) AS yard_area_id,
            TRY_CAST(container_size AS INTEGER) AS container_size,
            TRIM(container_type) AS container_type,
            UPPER(TRIM(full_empty)) AS full_empty,
            TRY_CAST(gate_in_ts AS TIMESTAMP) AS gate_in_ts,
            TRY_CAST(gate_out_ts AS TIMESTAMP) AS gate_out_ts,
            UPPER(TRIM(hist)) AS hist
        FROM stage_container_classified
        WHERE data_quality_status = 'VALID'
    """).df()

    rejected_df = con.execute("""
        SELECT
            container_id,
            container_no,
            shipping_line_id,
            yard_area_id,
            container_size,
            container_type,
            full_empty,
            gate_in_ts,
            gate_out_ts,
            hist,
            data_quality_status AS error_reason
        FROM stage_container_classified
        WHERE data_quality_status != 'VALID'
    """).df()

    return total_rows, valid_rows, error_rows, valid_df, rejected_df


def write_etl_outputs(valid_df, rejected_df):
    """Xuất file Parquet nén cho dòng hợp lệ và CSV cho dòng lỗi."""
    ETL_VALID_PARQUET_PATH.parent.mkdir(parents=True, exist_ok=True)
    ETL_REJECTED_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not valid_df.empty:
        valid_df.to_parquet(ETL_VALID_PARQUET_PATH, index=False, compression="snappy")
    if not rejected_df.empty:
        rejected_df.to_csv(ETL_REJECTED_CSV_PATH, index=False)

    return str(ETL_VALID_PARQUET_PATH), str(ETL_REJECTED_CSV_PATH)


def get_etl_error_breakdown():
    """Thống kê chi tiết cơ cấu lỗi vi phạm hợp đồng dữ liệu."""
    con = get_connection()
    try:
        return con.execute("""
            SELECT
                data_quality_status AS error_rule,
                COUNT(*) AS error_count
            FROM stage_container_classified
            WHERE data_quality_status != 'VALID'
            GROUP BY data_quality_status
            ORDER BY error_count DESC
        """).df()
    except Exception:
        return pd.DataFrame(columns=["error_rule", "error_count"])
