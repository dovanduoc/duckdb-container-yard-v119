# HỆ THỐNG PHÂN TÍCH VÀ GIÁM SÁT CONTAINER TỒN BÃI
## Đề án tốt nghiệp / Bài tập lớn Cảng Biển & Khoa học Dữ liệu

* **Phiên bản**: 119.0 - FASTAPI & MODERN WEB SPA
* **Công nghệ cốt lõi**: DuckDB Engine · Apache Parquet · FastAPI · Plotly.js
* **Bộ dữ liệu thực nghiệm**: 100.000 lượt container (Cục bộ)

---

### 🚀 Khởi chạy nhanh
Chỉ cần chạy file:
```cmd
run_app.bat
```
Truy cập: **http://localhost:8000** (Swagger API Docs: **http://localhost:8000/docs**)

---

### 🧪 Chạy kiểm thử tự động
```cmd
test_system.bat
```
Bộ test gồm kiểm thử nghiệp vụ hiện có và HTTP integration test qua FastAPI `TestClient`.

---

### 🎯 Phạm vi DEMO cần hiểu đúng

* **Benchmark** chỉ so sánh **DuckDB đọc CSV với DuckDB đọc Parquet** trên cùng dataset và cùng query; không dùng kết quả này để kết luận tổng quát DuckDB nhanh hơn PostgreSQL/MySQL/Oracle bao nhiêu lần.
* Benchmark thực hiện **1 lượt warm-up + 7 lượt đo**, đảo thứ tự CSV/Parquet xen kẽ và dùng **median + p95**.
* **Rule 02** chỉ kiểm tra **cấu trúc mã container theo ISO 6346** (`4 chữ cái + 7 chữ số`); demo chưa tính check digit ISO 6346.
* **Rule 09** yêu cầu `gate_out_ts > gate_in_ts` nếu Gate-Out tồn tại.
* Với lát cắt **As-of-Date**, Gate-Out hợp lệ là temporal truth; cờ `hist` được chuẩn hóa để tránh tính container còn tồn sau ngày Gate-Out.

Chi tiết các hiệu chỉnh kỹ thuật: `Document/V120_DEMO_HARDENING.md`.
