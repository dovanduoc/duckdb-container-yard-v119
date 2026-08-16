"""
Dịch vụ phân tích dữ liệu và nghiệp vụ container/bãi cảng.
Bảo toàn 100% logic và hợp đồng dữ liệu của 13 hàm nghiệp vụ DuckDB.
"""

from numbers import Integral
from datetime import datetime
import pandas as pd

from src.core.duckdb_engine import get_connection


def validate_selected_date(selected_date):
    """Kiểm tra và chuẩn hóa ngày phân tích."""
    con = get_connection()
    try:
        parsed_date = con.execute("""
            SELECT CAST(? AS DATE)
        """, [selected_date]).fetchone()[0]
    except Exception:
        raise ValueError(
            "Ngày không hợp lệ. Vui lòng nhập theo định dạng YYYY-MM-DD."
        )

    date_exists = con.execute("""
        SELECT COUNT(*)
        FROM v_daily_yard_capacity
        WHERE ngay = ?
    """, [parsed_date]).fetchone()[0]

    if date_exists == 0:
        date_range = con.execute("""
            SELECT
                MIN(ngay) AS min_date,
                MAX(ngay) AS max_date
            FROM v_daily_yard_capacity
        """).fetchone()

        raise ValueError(
            f"Ngày {parsed_date} không có trong dữ liệu. "
            f"Khoảng ngày hiện có là {date_range[0]} đến {date_range[1]}."
        )

    return parsed_date


def validate_warning_threshold(warning_threshold):
    """Kiểm tra ngưỡng cảnh báo sử dụng bãi."""
    if not isinstance(warning_threshold, (int, float)) or isinstance(warning_threshold, bool):
        raise TypeError("warning_threshold phải là một số.")
    if not 0 <= warning_threshold <= 100:
        raise ValueError("Ngưỡng cảnh báo phải nằm trong khoảng 0–100%.")
    return float(warning_threshold)


def validate_yard_area_id(yard_area_id):
    """Kiểm tra yard_area_id có hợp lệ và tồn tại hay không."""
    con = get_connection()
    if not isinstance(yard_area_id, Integral) or isinstance(yard_area_id, bool):
        raise TypeError("yard_area_id phải là số nguyên.")

    yard_area_id = int(yard_area_id)
    if yard_area_id <= 0:
        raise ValueError("yard_area_id phải lớn hơn 0.")

    yard_exists = con.execute("""
        SELECT COUNT(*)
        FROM v_yard_area
        WHERE yard_area_id = ?
    """, [yard_area_id]).fetchone()[0]

    if yard_exists == 0:
        raise ValueError(f"Khu vực bãi có mã {yard_area_id} không tồn tại.")

    return yard_area_id


def validate_date_range(start_date, end_date):
    """Kiểm tra và chuẩn hóa khoảng thời gian."""
    try:
        start_date = pd.to_datetime(start_date).date()
        end_date = pd.to_datetime(end_date).date()
    except Exception as error:
        raise ValueError("Ngày phải có định dạng hợp lệ.") from error

    if start_date > end_date:
        raise ValueError("Ngày bắt đầu không được lớn hơn ngày kết thúc.")

    return start_date, end_date


def get_current_containers(limit=None):
    """Lấy danh sách container hiện đang tồn trong bãi (hist = 'N')."""
    con = get_connection()
    if limit is not None:
        if not isinstance(limit, Integral) or isinstance(limit, bool):
            raise TypeError("limit phải là số nguyên hoặc None.")
        limit = int(limit)
        if limit <= 0:
            raise ValueError("limit phải lớn hơn 0.")
        limit_clause = f"LIMIT {limit}"
    else:
        limit_clause = ""

    query = f"""
        SELECT
            c.container_id,
            c.container_no,
            s.shipping_line_code,
            s.shipping_line_name,
            y.yard_code,
            y.yard_name,
            c.container_size,
            c.container_type,
            c.full_empty,
            c.gate_in_ts,
            c.hist,
            ROUND(
                DATE_DIFF(
                    'second',
                    CAST(c.gate_in_ts AS TIMESTAMP),
                    CAST(CURRENT_TIMESTAMP AS TIMESTAMP)
                ) / 86400.0,
                2
            ) AS dwell_days
        FROM v_container AS c
        LEFT JOIN v_shipping_line AS s
            ON c.shipping_line_id = s.shipping_line_id
        LEFT JOIN v_yard_area AS y
            ON c.yard_area_id = y.yard_area_id
        WHERE UPPER(TRIM(c.hist)) = 'N'
          AND c.gate_in_ts IS NOT NULL
        ORDER BY
            dwell_days DESC,
            c.container_no ASC
        {limit_clause}
    """
    return con.execute(query).df()


def get_overdue_containers(min_days=30, limit=None):
    """Lấy danh sách container lưu bãi vượt ngưỡng số ngày quy định."""
    con = get_connection()
    if not isinstance(min_days, Integral) or isinstance(min_days, bool):
        raise TypeError("min_days phải là số nguyên.")
    min_days = int(min_days)
    if min_days < 0:
        raise ValueError("min_days không được âm.")

    if limit is not None:
        if not isinstance(limit, Integral) or isinstance(limit, bool):
            raise TypeError("limit phải là số nguyên hoặc None.")
        limit = int(limit)
        if limit <= 0:
            raise ValueError("limit phải lớn hơn 0.")
        limit_clause = f"LIMIT {limit}"
    else:
        limit_clause = ""

    query = f"""
        SELECT
            c.container_id,
            c.container_no,
            s.shipping_line_code,
            s.shipping_line_name,
            y.yard_code,
            y.yard_name,
            c.container_size,
            c.container_type,
            c.full_empty,
            c.gate_in_ts,
            ROUND(
                DATE_DIFF(
                    'second',
                    CAST(c.gate_in_ts AS TIMESTAMP),
                    CAST(CURRENT_TIMESTAMP AS TIMESTAMP)
                ) / 86400.0,
                2
            ) AS dwell_days,
            'QUA_HAN' AS trang_thai_canh_bao
        FROM v_container AS c
        LEFT JOIN v_shipping_line AS s
            ON c.shipping_line_id = s.shipping_line_id
        LEFT JOIN v_yard_area AS y
            ON c.yard_area_id = y.yard_area_id
        WHERE UPPER(TRIM(c.hist)) = 'N'
          AND c.gate_in_ts IS NOT NULL
          AND DATE_DIFF(
                'second',
                CAST(c.gate_in_ts AS TIMESTAMP),
                CAST(CURRENT_TIMESTAMP AS TIMESTAMP)
              ) / 86400.0 >= ?
        ORDER BY
            dwell_days DESC,
            c.container_no ASC
        {limit_clause}
    """
    return con.execute(query, [min_days]).df()


def get_yard_utilization_by_date(selected_date):
    """Tính tỷ lệ sử dụng của từng khu vực bãi tại một ngày cụ thể."""
    con = get_connection()
    selected_date = validate_selected_date(selected_date)

    result_df = con.execute("""
        SELECT
            d.yard_area_id,
            y.yard_code,
            y.yard_name,
            d.suc_chua_toi_da,
            d.suc_chua_da_su_dung,
            d.ty_le_su_dung,
            CASE
                WHEN d.ty_le_su_dung >= 95 THEN 'QUA TAI'
                WHEN d.ty_le_su_dung >= 85 THEN 'CANH BAO'
                WHEN d.ty_le_su_dung >= 70 THEN 'MUC CAO'
                ELSE 'BINH THUONG'
            END AS trang_thai_su_dung
        FROM v_daily_yard_capacity AS d
        INNER JOIN v_yard_area AS y
            ON d.yard_area_id = y.yard_area_id
        WHERE d.ngay = ?
        ORDER BY
            d.ty_le_su_dung DESC,
            d.yard_area_id
    """, [selected_date]).fetchdf()

    return result_df


def get_yard_utilization_trend(yard_area_id, start_date, end_date):
    """Truy vấn xu hướng sử dụng bãi theo dải thời gian."""
    con = get_connection()
    yard_area_id = validate_yard_area_id(yard_area_id)
    start_date, end_date = validate_date_range(start_date, end_date)

    result_df = con.execute("""
        SELECT
            d.ngay,
            y.yard_code,
            y.yard_name,
            d.suc_chua_toi_da,
            d.suc_chua_da_su_dung,
            d.ty_le_su_dung
        FROM v_daily_yard_capacity AS d
        INNER JOIN v_yard_area AS y
            ON d.yard_area_id = y.yard_area_id
        WHERE d.yard_area_id = ?
          AND d.ngay >= ?
          AND d.ngay <= ?
        ORDER BY
            d.ngay ASC
    """, [yard_area_id, start_date, end_date]).fetchdf()

    return result_df


def get_available_analysis_dates():
    """Lấy danh sách các ngày phân tích khả dụng."""
    con = get_connection()
    return con.execute("""
        SELECT
            MIN(ngay) AS min_date,
            MAX(ngay) AS max_date,
            COUNT(DISTINCT ngay) AS total_available_days
        FROM v_daily_yard_capacity
    """).fetchdf()


def get_yard_list():
    """Lấy danh mục các khu vực bãi đang có trong hệ thống."""
    con = get_connection()
    return con.execute("""
        SELECT
            yard_area_id,
            yard_code,
            yard_name,
            max_capacity_teu,
            is_active
        FROM v_yard_area
        ORDER BY
            yard_code ASC
    """).fetchdf()


def get_shipping_line_ranking():
    """Xếp hạng hãng tàu theo số lượt container và sản lượng TEU."""
    con = get_connection()
    query = """
        WITH normalized_container AS (
            SELECT
                shipping_line_id,
                container_size,
                CASE
                    WHEN TRY_CAST(container_size AS INTEGER) = 20 THEN 20
                    WHEN TRY_CAST(container_size AS INTEGER) = 40 THEN 40
                    WHEN TRY_CAST(container_size AS INTEGER) = 45 THEN 45
                    ELSE 20
                END AS container_size_feet
            FROM v_container
            WHERE UPPER(TRIM(hist)) = 'N'
        ),
        shipping_line_summary AS (
            SELECT
                s.shipping_line_id,
                s.shipping_line_code,
                s.shipping_line_name,
                COUNT(c.shipping_line_id) AS current_container_count,
                SUM(
                    CASE
                        WHEN c.container_size_feet = 20 THEN 1.0
                        WHEN c.container_size_feet = 40 THEN 2.0
                        WHEN c.container_size_feet = 45 THEN 2.0
                        ELSE 1.0
                    END
                ) AS total_teu
            FROM normalized_container AS c
            INNER JOIN v_shipping_line AS s
                ON c.shipping_line_id = s.shipping_line_id
            GROUP BY
                s.shipping_line_id,
                s.shipping_line_code,
                s.shipping_line_name
        ),
        total_yard_teu AS (
            SELECT SUM(total_teu) AS all_shipping_lines_teu
            FROM shipping_line_summary
        )
        SELECT
            DENSE_RANK() OVER (ORDER BY s.total_teu DESC) AS ranking,
            s.shipping_line_code,
            s.shipping_line_name,
            s.current_container_count,
            s.total_teu,
            ROUND(
                100.0 * s.total_teu / NULLIF(t.all_shipping_lines_teu, 0),
                2
            ) AS market_share_percentage
        FROM shipping_line_summary AS s
        CROSS JOIN total_yard_teu AS t
        ORDER BY
            ranking,
            s.shipping_line_code
    """
    return con.execute(query).df()


def get_container_type_teu_ranking():
    """Xếp hạng các loại container theo tổng sản lượng TEU."""
    con = get_connection()
    query = """
        WITH normalized_container AS (
            SELECT
                container_type,
                CASE
                    WHEN TRY_CAST(container_size AS INTEGER) = 20 THEN 20
                    WHEN TRY_CAST(container_size AS INTEGER) = 40 THEN 40
                    WHEN TRY_CAST(container_size AS INTEGER) = 45 THEN 45
                    ELSE 20
                END AS container_size_feet
            FROM v_container
            WHERE UPPER(TRIM(hist)) = 'N'
        ),
        container_type_summary AS (
            SELECT
                container_type,
                COUNT(*) AS current_container_count,
                SUM(
                    CASE
                        WHEN container_size_feet = 20 THEN 1.0
                        WHEN container_size_feet = 40 THEN 2.0
                        WHEN container_size_feet = 45 THEN 2.0
                        ELSE 1.0
                    END
                ) AS total_teu
            FROM normalized_container
            GROUP BY container_type
        ),
        total_yard_teu AS (
            SELECT SUM(total_teu) AS all_type_teu
            FROM container_type_summary
        )
        SELECT
            DENSE_RANK() OVER (ORDER BY s.total_teu DESC) AS ranking,
            s.container_type,
            s.current_container_count,
            s.total_teu,
            ROUND(
                100.0 * s.total_teu / NULLIF(t.all_type_teu, 0),
                2
            ) AS teu_percentage
        FROM container_type_summary AS s
        CROSS JOIN total_yard_teu AS t
        ORDER BY
            ranking,
            s.container_type
    """
    return con.execute(query).df()


def get_upcoming_overdue_containers(overdue_threshold_days=30, warning_days=5):
    """Tìm container đang tồn sắp đạt ngưỡng quá hạn."""
    con = get_connection()
    if not isinstance(overdue_threshold_days, int) or isinstance(overdue_threshold_days, bool):
        raise TypeError("overdue_threshold_days phải là số nguyên.")
    if not isinstance(warning_days, int) or isinstance(warning_days, bool):
        raise TypeError("warning_days phải là số nguyên.")
    if overdue_threshold_days <= 0:
        raise ValueError("Ngưỡng quá hạn phải lớn hơn 0.")
    if warning_days <= 0:
        raise ValueError("Số ngày cảnh báo phải lớn hơn 0.")
    if warning_days >= overdue_threshold_days:
        raise ValueError("Số ngày cảnh báo phải nhỏ hơn ngưỡng quá hạn.")

    query = """
        WITH current_container AS (
            SELECT
                c.container_no,
                c.gate_in_ts,
                c.yard_area_id,
                c.shipping_line_id,
                ROUND(
                    DATE_DIFF(
                        'second',
                        CAST(c.gate_in_ts AS TIMESTAMP),
                        CAST(CURRENT_TIMESTAMP AS TIMESTAMP)
                    ) / 86400.0,
                    2
                ) AS dwell_days
            FROM v_container AS c
            WHERE UPPER(TRIM(c.hist)) = 'N'
              AND c.gate_in_ts IS NOT NULL
        )
        SELECT
            c.container_no,
            c.gate_in_ts,
            y.yard_code,
            y.yard_name,
            s.shipping_line_code,
            s.shipping_line_name,
            c.dwell_days,
            CAST(CAST(? AS INTEGER) - c.dwell_days AS INTEGER) AS remaining_days,
            'SAP_QUA_HAN' AS warning_status
        FROM current_container AS c
        LEFT JOIN v_yard_area AS y
            ON c.yard_area_id = y.yard_area_id
        LEFT JOIN v_shipping_line AS s
            ON c.shipping_line_id = s.shipping_line_id
        WHERE c.dwell_days >= (CAST(? AS INTEGER) - CAST(? AS INTEGER))
          AND c.dwell_days < CAST(? AS INTEGER)
        ORDER BY
            remaining_days ASC,
            c.gate_in_ts ASC,
            c.container_no ASC
    """
    parameters = [
        overdue_threshold_days,
        overdue_threshold_days,
        warning_days,
        overdue_threshold_days
    ]
    return con.execute(query, parameters).df()


def get_latest_yard_utilization():
    """Tự động tìm ngày mới nhất và trả về tình hình sử dụng bãi."""
    date_range_df = get_available_analysis_dates()
    if date_range_df.empty:
        raise ValueError("Không có dữ liệu ngày để phân tích.")
    latest_date = date_range_df.loc[0, "max_date"]
    latest_date = pd.to_datetime(latest_date).date()
    return get_yard_utilization_by_date(selected_date=latest_date)


def get_overloaded_yards(selected_date=None, utilization_threshold=80.0, **kwargs):
    """Tìm các khu vực bãi có tỷ lệ sử dụng từ ngưỡng cảnh báo trở lên."""
    if "threshold" in kwargs:
        utilization_threshold = kwargs["threshold"]
    elif "threshold_percent" in kwargs:
        utilization_threshold = kwargs["threshold_percent"]

    if not isinstance(utilization_threshold, (int, float)) or isinstance(utilization_threshold, bool):
        raise TypeError("utilization_threshold phải là một số.")
    if not 0 <= utilization_threshold <= 100:
        raise ValueError("Ngưỡng sử dụng phải nằm trong khoảng 0–100%.")

    if selected_date is None:
        utilization_df = get_latest_yard_utilization()
    else:
        selected_date = pd.to_datetime(selected_date).date()
        utilization_df = get_yard_utilization_by_date(selected_date=selected_date)

    if "ty_le_su_dung" not in utilization_df.columns:
        raise ValueError("Kết quả phân tích thiếu cột ty_le_su_dung.")

    overloaded_df = utilization_df[
        utilization_df["ty_le_su_dung"] >= float(utilization_threshold)
    ].copy()

    if not overloaded_df.empty:
        overloaded_df = (
            overloaded_df
            .sort_values(by=["ty_le_su_dung", "yard_code"], ascending=[False, True])
            .reset_index(drop=True)
        )
    return overloaded_df


def get_container_history(container_no):
    """Tra cứu toàn bộ các lượt vào bãi và các sự kiện của 1 container."""
    con = get_connection()
    if not isinstance(container_no, str):
        raise TypeError("container_no phải là chuỗi ký tự.")
    container_no = container_no.strip().upper()
    if container_no == "":
        raise ValueError("container_no không được để trống.")

    query = """
        SELECT
            c.container_id,
            c.container_no,
            c.gate_in_ts,
            c.gate_out_ts,
            c.hist,
            cy.yard_code AS container_yard_code,
            cy.yard_name AS container_yard_name,
            e.event_id,
            e.event_type,
            e.event_ts,
            ey.yard_code AS event_yard_code,
            ey.yard_name AS event_yard_name
        FROM v_container AS c
        LEFT JOIN v_yard_area AS cy
            ON c.yard_area_id = cy.yard_area_id
        LEFT JOIN v_container_event AS e
            ON c.container_id = e.container_id
        LEFT JOIN v_yard_area AS ey
            ON e.yard_area_id = ey.yard_area_id
        WHERE UPPER(TRIM(c.container_no)) = ?
        ORDER BY
            c.gate_in_ts ASC,
            e.event_ts ASC NULLS LAST,
            e.event_id ASC NULLS LAST
    """
    return con.execute(query, [container_no]).df()


def get_overview_kpis(selected_date):
    """Tổng hợp KPI tại ngày được chọn."""
    selected_date = pd.to_datetime(selected_date).date()
    current_containers_df = get_current_containers(limit=None)
    current_container_count = len(current_containers_df)

    if current_containers_df.empty:
        overdue_container_count = 0
        average_dwell_days = 0.0
    else:
        overdue_container_count = int((current_containers_df["dwell_days"] >= 30).sum())
        average_dwell_days = round(float(current_containers_df["dwell_days"].mean()), 2)

    yard_utilization_df = get_yard_utilization_by_date(selected_date=selected_date)

    if yard_utilization_df.empty:
        highest_yard_df = yard_utilization_df.copy()
        highest_yard_name = "Không có dữ liệu"
        highest_utilization = 0.0
        warning_yard_count = 0
        overloaded_yard_count = 0
    else:
        sorted_yard_df = yard_utilization_df.sort_values(
            by=["ty_le_su_dung", "yard_code"], ascending=[False, True]
        ).reset_index(drop=True)
        highest_yard_df = sorted_yard_df.head(1).copy()
        highest_yard_code = str(highest_yard_df.iloc[0]["yard_code"])
        highest_yard_full_name = str(highest_yard_df.iloc[0]["yard_name"])
        highest_yard_name = f"{highest_yard_code} - {highest_yard_full_name}"
        highest_utilization = round(float(highest_yard_df.iloc[0]["ty_le_su_dung"]), 2)

        warning_yard_count = int(
            ((yard_utilization_df["ty_le_su_dung"] >= 85) & (yard_utilization_df["ty_le_su_dung"] < 95)).sum()
        )
        overloaded_yard_count = int((yard_utilization_df["ty_le_su_dung"] >= 95).sum())

    kpi_df = pd.DataFrame({
        "chi_so": [
            "Số container đang tồn",
            "Số container tồn từ 30 ngày",
            "Số ngày tồn trung bình",
            "Bãi có tỷ lệ sử dụng cao nhất",
            "Tỷ lệ sử dụng cao nhất (%)",
            "Số bãi cảnh báo",
            "Số bãi quá tải"
        ],
        "gia_tri": [
            current_container_count,
            overdue_container_count,
            average_dwell_days,
            highest_yard_name,
            highest_utilization,
            warning_yard_count,
            overloaded_yard_count
        ]
    })

    return kpi_df, highest_yard_df
