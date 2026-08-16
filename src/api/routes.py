"""
FastAPI RESTful API Routes cho Hệ Thống Giám Sát Container Tồn Bãi - DuckDB.
"""

from typing import Optional
from pathlib import Path
import tempfile
import pandas as pd
from fastapi import APIRouter, Query, UploadFile, File, Form, HTTPException

from src.config import APP_CODE_VERSION, DATA_SOURCE_NAME
from src.core.duckdb_engine import get_connection
from src.services.analytics_service import (
    get_available_analysis_dates,
    get_yard_list,
    get_current_containers,
    get_overdue_containers,
    get_upcoming_overdue_containers,
    get_yard_utilization_by_date,
    get_latest_yard_utilization,
    get_overloaded_yards,
    get_yard_utilization_trend,
    get_shipping_line_ranking,
    get_container_type_teu_ranking,
    get_container_history,
    get_overview_kpis
)
from src.services.etl_service import (
    resolve_etl_csv_path,
    classify_container_csv,
    write_etl_outputs,
    get_etl_error_breakdown
)
from src.services.benchmark_service import run_duckdb_benchmark

api_router = APIRouter(prefix="/api", tags=["Container Yard Analytics API"])


def df_to_clean_json(df: pd.DataFrame):
    """Chuyển DataFrame thành JSON sạch với định dạng chuẩn."""
    if df is None or df.empty:
        return []
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].dt.strftime("%d/%m/%Y %H:%M:%S").fillna("-")
        elif pd.api.types.is_float_dtype(out[col]):
            out[col] = out[col].round(2)
    return out.to_dict(orient="records")


@api_router.get("/meta")
def get_system_metadata():
    """Lấy thông tin cấu hình, dải ngày và danh mục bãi cảng."""
    dates_df = get_available_analysis_dates()
    yards_df = get_yard_list()
    min_date = str(dates_df.loc[0, "min_date"]) if not dates_df.empty else "2025-08-15"
    max_date = str(dates_df.loc[0, "max_date"]) if not dates_df.empty else "2026-08-14"

    return {
        "app_version": APP_CODE_VERSION,
        "data_source": DATA_SOURCE_NAME,
        "min_date": min_date,
        "max_date": max_date,
        "yards": df_to_clean_json(yards_df)
    }


@api_router.get("/overview")
def get_dashboard_overview(date: Optional[str] = None):
    """Lấy số liệu tổng quan Dashboard: 4 KPIs, Bảng xếp hạng, Cảnh báo quá tải."""
    dates_df = get_available_analysis_dates()
    max_date = str(dates_df.loc[0, "max_date"]) if not dates_df.empty else "2026-08-14"
    selected_date = date if date else max_date

    try:
        kpi_df, highest_yard_df = get_overview_kpis(selected_date)
        yard_util_df = get_yard_utilization_by_date(selected_date)
        full_shipping_df = get_shipping_line_ranking(selected_date=selected_date)
        shipping_df = full_shipping_df.head(5)
        cont_type_df = get_container_type_teu_ranking(selected_date=selected_date).head(5)
        overloaded_df = get_overloaded_yards(selected_date, threshold=95)
        upcoming_df = get_upcoming_overdue_containers(overdue_threshold_days=30, warning_days=5, selected_date=selected_date).head(5)

        # Tính tổng TEU chính xác của toàn bộ container tồn bãi tại ngày được chọn
        total_teu = float(full_shipping_df["total_teu"].sum()) if not full_shipping_df.empty else 0.0

        # Lấy giá trị KPI
        kpi_dict = dict(zip(kpi_df["chi_so"], kpi_df["gia_tri"])) if not kpi_df.empty else {}

        return {
            "selected_date": str(selected_date),
            "kpi_cards": {
                "current_containers": kpi_dict.get("Số container đang tồn", 0),
                "total_teu": total_teu,
                "overdue_containers": kpi_dict.get("Số container tồn từ 30 ngày", 0),
                "overloaded_yards_count": kpi_dict.get("Số bãi quá tải", 0),
                "avg_dwell_days": kpi_dict.get("Số ngày tồn trung bình", 0.0),
                "highest_yard_name": kpi_dict.get("Bãi có tỷ lệ sử dụng cao nhất", "-"),
                "highest_utilization": kpi_dict.get("Tỷ lệ sử dụng cao nhất (%)", 0.0)
            },
            "shipping_ranking": df_to_clean_json(shipping_df),
            "container_type_ranking": df_to_clean_json(cont_type_df),
            "overloaded_yards": df_to_clean_json(overloaded_df),
            "upcoming_overdue": df_to_clean_json(upcoming_df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/yard-matrix")
def get_yard_heatmap_matrix(date: Optional[str] = None):
    """Lấy danh sách 8 khu vực bãi phục vụ hiển thị Sơ đồ Mặt Bằng Bãi Cảng 2D."""
    dates_df = get_available_analysis_dates()
    max_date = str(dates_df.loc[0, "max_date"]) if not dates_df.empty else "2026-08-14"
    selected_date = date if date else max_date

    try:
        yard_df = get_yard_utilization_by_date(selected_date)
        return {
            "selected_date": str(selected_date),
            "blocks": df_to_clean_json(yard_df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/containers")
def search_containers(
    date: Optional[str] = None,
    filter_type: str = Query("current", enum=["current", "overdue", "upcoming"]),
    min_days: int = 30,
    warning_days: int = 5,
    limit: int = 50
):
    """Tra cứu danh sách container: đang tồn, quá hạn hoặc sắp quá hạn theo ngày phân tích As-of-Date."""
    try:
        if filter_type == "current":
            df = get_current_containers(limit=limit, selected_date=date)
        elif filter_type == "overdue":
            df = get_overdue_containers(min_days=min_days, limit=limit, selected_date=date)
        elif filter_type == "upcoming":
            df = get_upcoming_overdue_containers(overdue_threshold_days=min_days, warning_days=warning_days, selected_date=date).head(limit)
        else:
            df = get_current_containers(limit=limit, selected_date=date)

        return {
            "filter_type": filter_type,
            "selected_date": date,
            "total_records": len(df),
            "data": df_to_clean_json(df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/containers/history")
def get_single_container_history(container_no: str = Query("PILU0017000")):
    """Truy vết toàn bộ lịch sử và sự kiện của 1 container (Timeline Stepper)."""
    try:
        history_df = get_container_history(container_no)
        if history_df.empty:
            return {
                "container_no": container_no,
                "found": False,
                "events": []
            }

        # Nhóm theo từng lượt vào bãi (container_id / visit)
        visits = []
        all_events = []
        unique_container_ids = history_df["container_id"].drop_duplicates().tolist()

        for c_id in unique_container_ids:
            visit_df = history_df[history_df["container_id"] == c_id]
            first_row = visit_df.iloc[0]
            gate_in = first_row.get("gate_in_ts")
            gate_out = first_row.get("gate_out_ts")
            hist = first_row.get("hist")
            yard_code = first_row.get("container_yard_code")

            visit_events = []
            if pd.notna(gate_in):
                evt = {
                    "title": f"Cổng vào cảng (Gate-In) - Bãi {yard_code or 'A'}",
                    "timestamp": str(gate_in),
                    "type": "in",
                    "badge": "CỔNG VÀO",
                    "description": f"[Lượt #{c_id}] Container hạ bãi tại khu vực {yard_code or 'A'} ghi nhận vào hệ thống."
                }
                visit_events.append(evt)
                all_events.append(evt)

            for _, row in visit_df.iterrows():
                evt_type = row.get("event_type")
                evt_ts = row.get("event_ts")
                evt_yard = row.get("event_yard_code")
                if pd.notna(evt_type) and pd.notna(evt_ts):
                    evt = {
                        "title": f"Tác nghiệp: {evt_type}",
                        "timestamp": str(evt_ts),
                        "type": "move",
                        "badge": "ĐẢO CHUYỂN",
                        "description": f"[Lượt #{c_id}] Thao tác xếp dỡ/đảo bãi tại khu vực {evt_yard or 'N/A'}."
                    }
                    visit_events.append(evt)
                    all_events.append(evt)

            if str(hist).upper() == "Y" and pd.notna(gate_out):
                evt = {
                    "title": "Cổng ra cảng (Gate-Out) - Hoàn thành giao nhận",
                    "timestamp": str(gate_out),
                    "type": "out",
                    "badge": "XUẤT BÃI",
                    "description": f"[Lượt #{c_id}] Container đã được bốc lên phương tiện vận chuyển và rời khỏi bãi cảng."
                }
                visit_events.append(evt)
                all_events.append(evt)
            else:
                evt = {
                    "title": f"Hiện đang lưu bãi tại {yard_code or 'Bãi'}",
                    "timestamp": "Hiện tại",
                    "type": "current",
                    "badge": "ĐANG TỒN BÃI",
                    "description": f"[Lượt #{c_id}] Container đang lưu trú trong bãi cảng, sẵn sàng cho kế hoạch giao nhận."
                }
                visit_events.append(evt)
                all_events.append(evt)

            visits.append({
                "container_id": int(c_id),
                "gate_in_ts": str(gate_in) if pd.notna(gate_in) else None,
                "gate_out_ts": str(gate_out) if pd.notna(gate_out) else None,
                "hist": str(hist),
                "yard_code": str(yard_code),
                "status": "Đã xuất bãi" if str(hist).upper() == "Y" else "Đang tồn bãi",
                "events": visit_events
            })

        latest_row = history_df.iloc[-1]
        latest_yard = latest_row.get("container_yard_code")
        latest_hist = latest_row.get("hist")

        return {
            "container_no": container_no,
            "found": True,
            "total_visits": len(visits),
            "yard_code": str(latest_yard),
            "status": "Đã xuất bãi" if str(latest_hist).upper() == "Y" else "Đang tồn bãi",
            "events": all_events,
            "visits": visits,
            "raw_data": df_to_clean_json(history_df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/trend")
def get_yard_trend_data(
    yard_id: int = Query(1),
    start_date: str = Query("2025-08-15"),
    end_date: str = Query("2026-08-14")
):
    """Lấy dữ liệu chuỗi thời gian xu hướng sử dụng bãi."""
    try:
        trend_df = get_yard_utilization_trend(yard_id, start_date, end_date)
        return {
            "yard_id": yard_id,
            "start_date": start_date,
            "end_date": end_date,
            "data": df_to_clean_json(trend_df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/rankings")
def get_full_rankings(date: Optional[str] = None):
    """Lấy đầy đủ bảng xếp hạng Hãng tàu và Loại Container theo sản lượng TEU tại ngày phân tích."""
    try:
        shipping_df = get_shipping_line_ranking(selected_date=date)
        type_df = get_container_type_teu_ranking(selected_date=date)
        return {
            "selected_date": date,
            "shipping_lines": df_to_clean_json(shipping_df),
            "container_types": df_to_clean_json(type_df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/etl/run")
async def run_etl_pipeline(
    source_type: str = Form("demo"),
    file: Optional[UploadFile] = File(None)
):
    """Chạy quy trình ETL phân loại 10 quy tắc hợp đồng dữ liệu bằng DuckDB."""
    try:
        if source_type == "upload" and file:
            temp_dir = tempfile.mkdtemp()
            temp_path = Path(temp_dir) / file.filename
            with open(temp_path, "wb") as f:
                content = await file.read()
                f.write(content)
            csv_path = temp_path
        else:
            csv_path = resolve_etl_csv_path(source_type, None)

        total, valid, error, valid_df, rejected_df = classify_container_csv(csv_path)
        valid_file, rejected_file = write_etl_outputs(valid_df, rejected_df)
        breakdown_df = get_etl_error_breakdown()

        return {
            "total_rows": total,
            "valid_rows": valid,
            "error_rows": error,
            "valid_file": valid_file,
            "rejected_file": rejected_file,
            "error_breakdown": df_to_clean_json(breakdown_df),
            "valid_sample": df_to_clean_json(valid_df.head(20)),
            "rejected_sample": df_to_clean_json(rejected_df.head(20))
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/benchmark/run")
def execute_benchmark(rows: int = Query(1000, enum=[1000, 1000000, 5000000])):
    """Chạy đo hiệu năng DuckDB so sánh CSV và Parquet (1.000 đến 5.000.000 dòng)."""
    try:
        metrics, current_df, history_df = run_duckdb_benchmark(rows)
        return {
            "metrics": metrics,
            "current_run": df_to_clean_json(current_df),
            "history": df_to_clean_json(history_df.tail(10))
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
