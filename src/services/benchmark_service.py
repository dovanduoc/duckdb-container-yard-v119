"""
Dịch vụ đo hiệu năng (Benchmark) DuckDB so sánh CSV và Parquet.
"""

import time
from pathlib import Path
import duckdb
import pandas as pd

from src.config import BENCHMARK_PATH, BENCHMARK_HISTORY_PATH
from src.core.duckdb_engine import escape_duckdb_path

# Bảng lưu kết quả tích lũy
benchmark_history_df = pd.DataFrame()


def validate_benchmark_row_count(row_count):
    """Kiểm tra số dòng benchmark hợp lệ."""
    try:
        count = int(row_count)
    except Exception:
        raise ValueError("Số dòng benchmark phải là số nguyên.")
    if count not in {1000, 1000000, 5000000}:
        raise ValueError("Chỉ được chọn 1.000, 1.000.000 hoặc 5.000.000 dòng.")
    return count


def run_timed_query(con, query_text, repeat_count=1):
    """Chạy truy vấn, buộc lấy kết quả và trả thời gian trung bình."""
    elapsed_times = []
    for _ in range(repeat_count):
        start_time = time.perf_counter()
        con.execute(query_text).fetchall()
        elapsed_times.append(time.perf_counter() - start_time)
    return sum(elapsed_times) / len(elapsed_times)


def run_duckdb_benchmark(row_count):
    """
    Tạo dữ liệu mô phỏng và đo hiệu năng so sánh DuckDB xử lý CSV và Parquet.
    """
    global benchmark_history_df
    row_count = validate_benchmark_row_count(row_count)
    BENCHMARK_PATH.mkdir(parents=True, exist_ok=True)

    csv_path = BENCHMARK_PATH / f"container_{row_count}.csv"
    parquet_path = BENCHMARK_PATH / f"container_{row_count}.parquet"
    db_file_path = BENCHMARK_PATH / "container_benchmark.duckdb"

    con = duckdb.connect()

    # 1. Tạo dữ liệu mô phỏng
    start_time = time.perf_counter()
    con.execute(f"""
        CREATE OR REPLACE TABLE synthetic_container AS
        SELECT
            range AS container_id,
            'CONT' || LPAD(CAST(range AS VARCHAR), 7, '0') AS container_no,
            1 + (range % 8) AS yard_area_id,
            1 + (range % 10) AS shipping_line_id,
            CASE (range % 3)
                WHEN 0 THEN 20
                WHEN 1 THEN 40
                ELSE 45
            END AS container_size,
            CASE (range % 5)
                WHEN 0 THEN '20DC'
                WHEN 1 THEN '40DC'
                WHEN 2 THEN '40HC'
                WHEN 3 THEN '20RF'
                ELSE '40RF'
            END AS container_type,
            CASE (range % 2)
                WHEN 0 THEN 'F'
                ELSE 'E'
            END AS full_empty,
            TIMESTAMP '2025-01-01 00:00:00' + INTERVAL (range % 365) DAY AS gate_in_ts,
            CASE (range % 4)
                WHEN 0 THEN TIMESTAMP '2025-01-01 00:00:00' + INTERVAL ((range % 365) + 3) DAY
                ELSE NULL
            END AS gate_out_ts,
            CASE (range % 4)
                WHEN 0 THEN 'Y'
                ELSE 'N'
            END AS hist
        FROM range({row_count})
    """)
    gen_time_s = time.perf_counter() - start_time

    # 2. Xuất CSV
    start_time = time.perf_counter()
    con.execute(f"""
        COPY synthetic_container
        TO '{escape_duckdb_path(csv_path)}'
        (FORMAT CSV, HEADER TRUE)
    """)
    csv_write_time_s = time.perf_counter() - start_time

    # 3. Xuất Parquet
    start_time = time.perf_counter()
    con.execute(f"""
        COPY synthetic_container
        TO '{escape_duckdb_path(parquet_path)}'
        (FORMAT PARQUET, COMPRESSION 'SNAPPY')
    """)
    parquet_write_time_s = time.perf_counter() - start_time

    # 4. Đo dung lượng file
    csv_size_mb = csv_path.stat().st_size / (1024 * 1024)
    parquet_size_mb = parquet_path.stat().st_size / (1024 * 1024)
    size_ratio = csv_size_mb / parquet_size_mb if parquet_size_mb > 0 else 0

    # 5. Đo thời gian truy vấn
    csv_scan_time_s = run_timed_query(
        con,
        f"SELECT COUNT(*) FROM read_csv_auto('{escape_duckdb_path(csv_path)}')"
    )
    parquet_scan_time_s = run_timed_query(
        con,
        f"SELECT COUNT(*) FROM read_parquet('{escape_duckdb_path(parquet_path)}')"
    )
    speedup_ratio = csv_scan_time_s / parquet_scan_time_s if parquet_scan_time_s > 0 else 0

    # 6. Đo truy vấn phân tích tổng hợp (Filter + Group By)
    csv_agg_time_s = run_timed_query(
        con,
        f"""
        SELECT yard_area_id, container_type, COUNT(*), SUM(container_size)
        FROM read_csv_auto('{escape_duckdb_path(csv_path)}')
        WHERE hist = 'N' AND container_size >= 40
        GROUP BY yard_area_id, container_type
        """
    )
    parquet_agg_time_s = run_timed_query(
        con,
        f"""
        SELECT yard_area_id, container_type, COUNT(*), SUM(container_size)
        FROM read_parquet('{escape_duckdb_path(parquet_path)}')
        WHERE hist = 'N' AND container_size >= 40
        GROUP BY yard_area_id, container_type
        """
    )
    agg_speedup_ratio = csv_agg_time_s / parquet_agg_time_s if parquet_agg_time_s > 0 else 0

    # Lưu kết quả
    current_run_df = pd.DataFrame([{
        "thoi_diem": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "so_dong": row_count,
        "csv_size_mb": round(csv_size_mb, 2),
        "parquet_size_mb": round(parquet_size_mb, 2),
        "ty_le_tiet_kiem_dung_luong": f"{size_ratio:.1f}x",
        "csv_scan_sec": round(csv_scan_time_s, 4),
        "parquet_scan_sec": round(parquet_scan_time_s, 4),
        "toc_do_quet_nhanh_hon": f"{speedup_ratio:.1f}x",
        "csv_agg_sec": round(csv_agg_time_s, 4),
        "parquet_agg_sec": round(parquet_agg_time_s, 4),
        "toc_do_tong_hop_nhanh_hon": f"{agg_speedup_ratio:.1f}x"
    }])

    benchmark_history_df = pd.concat([benchmark_history_df, current_run_df], ignore_index=True)
    try:
        benchmark_history_df.to_csv(BENCHMARK_HISTORY_PATH, index=False)
    except Exception:
        pass

    metrics = {
        "row_count": row_count,
        "csv_size_mb": round(csv_size_mb, 2),
        "parquet_size_mb": round(parquet_size_mb, 2),
        "size_ratio": round(size_ratio, 1),
        "csv_scan_s": round(csv_scan_time_s, 4),
        "parquet_scan_s": round(parquet_scan_time_s, 4),
        "speedup_ratio": round(speedup_ratio, 1),
        "csv_agg_s": round(csv_agg_time_s, 4),
        "parquet_agg_s": round(parquet_agg_time_s, 4),
        "agg_speedup_ratio": round(agg_speedup_ratio, 1)
    }

    return metrics, current_run_df, benchmark_history_df
