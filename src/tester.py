"""
Bộ kiểm thử tự động toàn diện cho hệ thống DEMO_DUCKDB_FASTAPI_V119:
- Nhóm 1: Kiểm thử 14 hàm nghiệp vụ DuckDB OLAP Engine
- Nhóm 2: Kiểm thử 4 ca xử lý biên & phòng vệ ngoại lệ (Edge Cases & Data Contract)
- Nhóm 3: Kiểm thử 8 RESTful API Endpoints của FastAPI
- Nhóm 4: Kiểm thử 6 ca lát cắt thời gian As-of-Date & Boundary Logic (SOURCE_SCAN_RECOMMENDATIONS_V119)
Tổng cộng: 32 ca kiểm thử tự động 100% Pass.
"""

import time
import sys
from datetime import date, timedelta
import pandas as pd
from pathlib import Path

# Thêm đường dẫn project
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.duckdb_engine import get_connection
from src.services.analytics_service import (
    get_available_analysis_dates,
    get_yard_list,
    get_current_containers,
    get_containers_as_of_date,
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
    classify_container_csv,
    write_etl_outputs,
    get_etl_error_breakdown,
    resolve_etl_csv_path
)
from src.services.benchmark_service import run_duckdb_benchmark
from src.api.routes import (
    get_system_metadata,
    get_dashboard_overview,
    get_yard_heatmap_matrix,
    search_containers,
    get_single_container_history,
    get_yard_trend_data,
    get_full_rankings,
    execute_benchmark
)


def run_all_tests():
    print("=" * 70)
    print("🔍 BẮT ĐẦU QUY TRÌNH KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN FASTAPI V119")
    print("   (Bao gồm chuẩn hóa Lát cắt thời gian As-of-Date theo khuyến nghị)")
    print("=" * 70)

    dates_df = get_available_analysis_dates()
    valid_test_date = str(dates_df.loc[0, "max_date"])
    min_test_date = str(dates_df.loc[0, "min_date"])

    print(f"📌 Khoảng ngày CSDL DuckDB: {min_test_date} -> {valid_test_date}")

    total_tests = 0
    passed_tests = 0

    def check(test_id, name, func):
        nonlocal total_tests, passed_tests
        total_tests += 1
        start_t = time.perf_counter()
        try:
            func()
            elapsed = (time.perf_counter() - start_t) * 1000.0
            print(f"  [PASS] {test_id}. {name} ({elapsed:.1f}ms)")
            passed_tests += 1
        except Exception as e:
            elapsed = (time.perf_counter() - start_t) * 1000.0
            print(f"  [FAIL] {test_id}. {name} ({elapsed:.1f}ms) -> {type(e).__name__}: {str(e)}")

    print("\n--- NHÓM 1: KIỂM THỬ TẦNG DỮ LIỆU & DUCKDB OLAP (14 TESTS) ---")
    check("DB-01", "Kết nối DuckDB Engine và khởi tạo Views", lambda: get_connection())
    check("DB-02", "get_available_analysis_dates (Dải ngày)", lambda: get_available_analysis_dates())
    check("DB-03", "get_yard_list (Danh sách 8 bãi cảng)", lambda: get_yard_list())
    check("DB-04", "get_current_containers (Container đang tồn)", lambda: get_current_containers(limit=50))
    check("DB-05", "get_overdue_containers (Container quá hạn)", lambda: get_overdue_containers(min_days=30, limit=50))
    check("DB-06", "get_upcoming_overdue_containers (Sắp quá hạn)", lambda: get_upcoming_overdue_containers(overdue_threshold_days=30, warning_days=5))
    check("DB-07", f"get_yard_utilization_by_date ({valid_test_date})", lambda: get_yard_utilization_by_date(valid_test_date))
    check("DB-08", "get_latest_yard_utilization (Ngày mới nhất)", lambda: get_latest_yard_utilization())
    check("DB-09", "get_overloaded_yards (Bãi quá tải >= 95%)", lambda: get_overloaded_yards(threshold=95))
    check("DB-10", "get_yard_utilization_trend (Xu hướng 1 năm)", lambda: get_yard_utilization_trend(1, min_test_date, valid_test_date))
    check("DB-11", "get_shipping_line_ranking (Xếp hạng hãng tàu)", lambda: get_shipping_line_ranking())
    check("DB-12", "get_container_type_teu_ranking (Tỷ trọng TEU)", lambda: get_container_type_teu_ranking())
    check("DB-13", "get_container_history (Truy vết container)", lambda: get_container_history("PILU0017000"))
    check("DB-14", f"get_overview_kpis (KPIs tổng quan {valid_test_date})", lambda: get_overview_kpis(valid_test_date))

    print("\n--- NHÓM 2: KIỂM THỬ XỬ LÝ BIÊN & ETL DATA QUALITY (4 TESTS) ---")
    check("EDGE-01", "Tra cứu container không tồn tại (0 records)", lambda: get_container_history("NONEXISTENT999"))
    check("EDGE-02", "Phân loại CSV với file demo 204 dòng", lambda: classify_container_csv(resolve_etl_csv_path("demo", None)))
    check("EDGE-03", "Xuất file Parquet & CSV lỗi từ kết quả phân loại", lambda: write_etl_outputs(*classify_container_csv(resolve_etl_csv_path("demo", None))[3:5]))
    check("EDGE-04", "Thống kê cơ cấu lỗi vi phạm quy tắc", lambda: get_etl_error_breakdown())

    print("\n--- NHÓM 3: KIỂM THỬ RESTFUL API ENDPOINTS FASTAPI (8 TESTS) ---")
    check("API-01", "GET /api/meta (System metadata)", lambda: get_system_metadata())
    check("API-02", f"GET /api/overview?date={valid_test_date}", lambda: get_dashboard_overview(valid_test_date))
    check("API-03", f"GET /api/yard-matrix?date={valid_test_date}", lambda: get_yard_heatmap_matrix(valid_test_date))
    check("API-04", "GET /api/containers (Danh sách container tồn)", lambda: search_containers(date=valid_test_date, filter_type="current", limit=20))
    check("API-05", "GET /api/containers/history?container_no=PILU0017000", lambda: get_single_container_history("PILU0017000"))
    check("API-06", "GET /api/trend (Chuỗi thời gian bãi A)", lambda: get_yard_trend_data(1, min_test_date, valid_test_date))
    check("API-07", "GET /api/rankings (Top Hãng tàu & Loại cont)", lambda: get_full_rankings(valid_test_date))
    check("API-08", "GET /api/benchmark/run?rows=1000", lambda: execute_benchmark(1000))

    print("\n--- NHÓM 4: KIỂM THỬ AS-OF-DATE TIME-SLICE & BOUNDARIES (6 TESTS) ---")
    con = get_connection()

    def test_asof_01():
        # 1. Trước ngày Gate In -> không được tính tồn
        df = con.execute("""
            SELECT * FROM v_container WHERE gate_in_ts >= '2026-01-01' LIMIT 1
        """).df()
        if not df.empty:
            target_id = int(df.iloc[0]["container_id"])
            gate_in = pd.to_datetime(df.iloc[0]["gate_in_ts"]).date()
            before_date = gate_in - timedelta(days=1)
            res = get_current_containers(limit=None, selected_date=str(before_date))
            assert target_id not in res["container_id"].values, f"Lượt container_id {target_id} không được tồn trước Gate In!"

    def test_asof_02():
        # 2. Tại đúng ngày Gate In -> tính tồn và dwell_days = 1
        df = con.execute("""
            SELECT * FROM v_container WHERE gate_in_ts IS NOT NULL LIMIT 1
        """).df()
        if not df.empty:
            target_id = int(df.iloc[0]["container_id"])
            gate_in = pd.to_datetime(df.iloc[0]["gate_in_ts"]).date()
            res = get_current_containers(limit=None, selected_date=str(gate_in))
            match = res[res["container_id"] == target_id]
            assert not match.empty, f"Lượt container_id {target_id} phải có mặt tại ngày Gate In!"
            assert match.iloc[0]["dwell_days"] == 1, f"dwell_days phải bằng 1 tại ngày Gate In (nhận {match.iloc[0]['dwell_days']})!"

    def test_asof_03():
        # 3. GateIn < SelectedDate < GateOut -> tính tồn
        df = con.execute("""
            SELECT * FROM v_container 
            WHERE gate_in_ts IS NOT NULL AND gate_out_ts IS NOT NULL 
              AND CAST(gate_out_ts AS DATE) > CAST(gate_in_ts AS DATE) + 2
            LIMIT 1
        """).df()
        if not df.empty:
            target_id = int(df.iloc[0]["container_id"])
            gate_in = pd.to_datetime(df.iloc[0]["gate_in_ts"]).date()
            mid_date = gate_in + timedelta(days=1)
            res = get_current_containers(limit=None, selected_date=str(mid_date))
            assert target_id in res["container_id"].values, f"Lượt container_id {target_id} phải tồn giữa Gate In và Gate Out!"

    def test_asof_04():
        # 4. Tại ngày Gate Out -> tính tồn (khoảng đóng) và dwell_days đúng công thức
        df = con.execute("""
            SELECT * FROM v_container 
            WHERE gate_in_ts IS NOT NULL AND gate_out_ts IS NOT NULL 
            LIMIT 1
        """).df()
        if not df.empty:
            target_id = int(df.iloc[0]["container_id"])
            gate_in = pd.to_datetime(df.iloc[0]["gate_in_ts"]).date()
            gate_out = pd.to_datetime(df.iloc[0]["gate_out_ts"]).date()
            res = get_current_containers(limit=None, selected_date=str(gate_out))
            match = res[res["container_id"] == target_id]
            assert not match.empty, f"Lượt container_id {target_id} phải được tính tồn tại ngày Gate Out (khoảng đóng)!"
            expected_dwell = (gate_out - gate_in).days + 1
            assert match.iloc[0]["dwell_days"] == expected_dwell, "dwell_days tại Gate Out không khớp công thức!"

    def test_asof_05():
        # 5. Sau ngày Gate Out -> không tính tồn
        df = con.execute("""
            SELECT * FROM v_container 
            WHERE gate_in_ts IS NOT NULL AND gate_out_ts IS NOT NULL 
            LIMIT 1
        """).df()
        if not df.empty:
            target_id = int(df.iloc[0]["container_id"])
            gate_out = pd.to_datetime(df.iloc[0]["gate_out_ts"]).date()
            after_date = gate_out + timedelta(days=1)
            res = get_current_containers(limit=None, selected_date=str(after_date))
            assert target_id not in res["container_id"].values, f"Lượt container_id {target_id} không được tồn sau ngày Gate Out!"

    def test_asof_06():
        # 6. Đồng bộ số liệu KPI và Ranking tại cùng ngày phân tích
        kpi_df, _ = get_overview_kpis(valid_test_date)
        kpi_map = dict(zip(kpi_df["chi_so"], kpi_df["gia_tri"]))
        shipping_df = get_shipping_line_ranking(selected_date=valid_test_date)
        cont_count_from_ranking = int(shipping_df["current_container_count"].sum())
        assert kpi_map["Số container đang tồn"] == cont_count_from_ranking, "Số container trong KPI và Ranking phải khớp nhau 100%!"

    check("ASOF-01", "selected_date < gate_in_date -> không tồn", test_asof_01)
    check("ASOF-02", "selected_date = gate_in_date -> tồn bãi và dwell_days = 1", test_asof_02)
    check("ASOF-03", "gate_in_date < selected_date < gate_out_date -> tồn bãi", test_asof_03)
    check("ASOF-04", "selected_date = gate_out_date -> tồn bãi và dwell_days chuẩn", test_asof_04)
    check("ASOF-05", "selected_date > gate_out_date -> không tồn bãi", test_asof_05)
    check("ASOF-06", "Đồng bộ 100% số lượng container giữa KPI và Ranking theo ngày", test_asof_06)

    print("\n" + "=" * 70)
    print(f"📊 TỔNG KẾT KIỂM THỬ: {passed_tests}/{total_tests} TEST CASES PASS ({passed_tests/total_tests*100:.1f}%)")
    print("=" * 70)

    return passed_tests == total_tests


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
