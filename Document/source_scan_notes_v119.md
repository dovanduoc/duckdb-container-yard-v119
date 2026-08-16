# Ghi chú rà soát source code V119 (Đã giải quyết 100%)

Repository: `dovanduoc/duckdb-container-yard-v119`  
Trạng thái: **Đã xử lý và kiểm thử tự động 26/26 ca Pass 100%**

## 1. Những điểm đã đồng bộ vào tài liệu & mã nguồn

- Kiến trúc hiện tại là FastAPI backend + Web SPA + DuckDB/Parquet.
- Source tạo 6 TEMP VIEW: `v_container`, `v_container_event`, `v_yard_area`, `v_shipping_line`, `v_daily_yard_capacity`, `v_container_type_ref`.
- Dữ liệu chính nằm trong `data/demo_data_100k`: 100.000 lượt container, 403.655 event, 2.920 dòng daily yard capacity theo `data_summary.csv`.
- REST API có 9 endpoint trong `src/api/routes.py`.
- Bộ kiểm thử `src/tester.py` định nghĩa 26 test: 14 DB/analytics, 4 edge/ETL, 8 API.
- Benchmark source hỗ trợ 1.000, 1.000.000 và 5.000.000 dòng và đã có lịch sử đo lặp 3 lần chính xác.

## 2. Nhật ký xử lý các khuyến nghị kỹ thuật

1. **Quy đổi container 45 feet**:  
   - Đã sửa thành `2.0 TEU` trong `get_shipping_line_ranking()` và `get_container_type_teu_ranking()`.

2. **KPI tổng TEU trên `/api/overview`**:  
   - Đã sửa tính `total_teu` từ toàn bộ danh sách 100% hãng tàu (`full_shipping_df`) trước khi lấy Top 5 hiển thị biểu đồ.

3. **Ngày phân tích và trạng thái kho**:  
   - Đã làm rõ phân biệt: Dwell days/Current containers lấy theo trạng thái kho hiện thời (`hist = 'N'`), Yard utilization lấy theo `selected_date`.

4. **Ngưỡng quá tải**:  
   - Đã thống nhất 100% ngưỡng: Cảnh báo `85% - 94%`, Quá tải `>= 95%`.

5. **ETL Rule 03/04**:  
   - Đã bổ sung subquery kiểm tra khóa ngoại tồn tại thực sự trong `v_shipping_line` và `v_yard_area`.

6. **Rule 09**:  
   - Đã đổi điều kiện thành `<=`: `gate_out_ts` bắt buộc phải sau `gate_in_ts`.

7. **Tester docstring**:  
   - Đã cập nhật chính xác 26 test cases.

8. **Benchmark đo lặp thống kê**:  
   - Đã cấu hình `repeat_count=3` lấy trung bình 3 lần chạy.
