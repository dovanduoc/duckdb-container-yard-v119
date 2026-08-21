# V120 Demo Hardening Notes

Tài liệu này ghi nhận 5 hiệu chỉnh kỹ thuật cho DEMO_DUCKDB_FASTAPI_V119. Các thay đổi giữ nguyên mục tiêu demo và không mở rộng phạm vi sản phẩm.

## 1. DuckDB connection / concurrency

FastAPI có thể thực thi endpoint đồng bộ trên nhiều thread. Bản sửa chuyển từ một global DuckDB connection sang **thread-local connection**. TEMP VIEW/TEMP TABLE vì vậy không còn dùng chung state giữa các thread. Bước bootstrap file/view được khóa ngắn bằng `threading.Lock` để tránh race ở lần khởi tạo đầu tiên.

## 2. Canonical As-of-Date

Temporal truth ưu tiên Gate-In/Gate-Out. Khi `gate_out_ts` hợp lệ và không trước `gate_in_ts`, view `v_container` chuẩn hóa `hist='Y'`. Điều này ngăn trường hợp dữ liệu nguồn còn `hist='N'` nhưng đã có Gate-Out hợp lệ làm container bị tính tồn sau ngày ra bãi.

Quy tắc phân tích vẫn là khoảng đóng theo ngày:

`GateInDate <= AnalysisDate <= GateOutDate`

Nếu không có Gate-Out hợp lệ thì container có thể được xem là còn tồn theo trạng thái nguồn.

## 3. Benchmark

Phạm vi benchmark được khóa thành:

**DuckDB CSV vs DuckDB Parquet, cùng dataset, cùng query.**

Phương pháp đo:

- 1 warm-up;
- 7 lượt đo;
- đảo thứ tự hai định dạng xen kẽ để giảm order bias;
- báo median và p95;
- giữ các metric cũ để frontend không bị phá vỡ.

Không diễn giải benchmark này thành so sánh tổng quát DuckDB với PostgreSQL/MySQL/Oracle.

## 4. HTTP integration tests

Bổ sung `src/test_api_http.py` dùng FastAPI `TestClient` để kiểm tra request/route/status/JSON thực sự cho:

- `/api/meta`
- `/api/overview`
- `/api/containers`
- `/api/benchmark/run`
- `/api/etl/run`

`test_system.bat` chạy cả bộ test nghiệp vụ cũ và HTTP integration tests.

## 5. Data Contract wording

- Rule 02 được mô tả chính xác là **kiểm tra cấu trúc mã theo ISO 6346 (4 chữ + 7 số)**; chưa kiểm thuật toán check digit.
- Rule 09 thống nhất với code: nếu có Gate-Out thì `gate_out_ts` phải **sau** `gate_in_ts`.

Các correction này là baseline diễn giải cho bản demo V119/V120.
