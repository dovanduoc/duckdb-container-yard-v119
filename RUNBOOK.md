# 📖 RUNBOOK & HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG
## HỆ THỐNG PHÂN TÍCH VÀ GIÁM SÁT CONTAINER TỒN BÃI (DUCKDB & FASTAPI)
**Phiên bản Release**: `119.0 - PRODUCTION & DEMO READY`  
**Bộ dữ liệu thực nghiệm**: 100.000 lượt container (Cục bộ)  
**Công nghệ chính**: DuckDB OLAP Engine · Apache Parquet · FastAPI · Modern Web SPA · Plotly.js  

---

## 🎯 1. TỔNG QUAN VỀ ĐỀ ÁN

Đề án xây dựng một nền tảng phân tích và giám sát container tồn bãi hiệu năng cao, giải quyết bài toán xử lý dữ liệu lớn trong vận hành cảng biển hiện đại. Hệ thống được tổ chức theo **Kiến trúc 3 Tầng chuẩn Doanh nghiệp (Enterprise 3-Tier Architecture)**:

1. **Tầng Lưu trữ & Xử lý Dữ liệu (OLAP Database Layer)**:
   - Sử dụng **DuckDB** kết hợp định dạng nén cột **Apache Parquet**.
   - Tối ưu hóa truy vấn trên 100.000 records với thời gian phản hồi **dưới 20 mili-giây** (Zero-Copy in-memory execution).
   - Module kiểm soát chất lượng dữ liệu (**ETL Data Contract Quality**) tự động áp dụng 10 quy tắc nghiệp vụ.
2. **Tầng Dịch vụ & Cổng API (API Gateway Layer)**:
   - Xây dựng trên nền tảng **FastAPI (Python)** bất đồng bộ hiệu năng cao.
   - Cung cấp các RESTful API chuẩn quốc tế kèm hệ thống tài liệu tương tác **Swagger OpenAPI Documentation (`/docs`)**.
3. **Tầng Giao diện Người dùng (Modern Web SPA Layer)**:
   - Giao diện Single Page Application thuần (HTML5, CSS3, JavaScript ES6+, Plotly.js).
   - Tải trang tức thì **dưới 0.1 giây**, không phụ thuộc các framework demo cồng kềnh, hoạt động mượt mà trên mọi độ phân giải màn hình.

---

## 🚀 2. HƯỚNG DẪN KHỞI CHẠY 1-CLICK DÀNH CHO GIẢNG VIÊN

### A. Khởi chạy trên hệ điều hành Windows:
1. Giải nén tệp tin `DEMO_DUCKDB_FASTAPI_V119.zip`.
2. Mở thư mục dự án và **CLICK ĐÚP** vào tệp:
   👉 **`run_app.bat`**
3. Hệ thống sẽ tự động:
   - Kiểm tra môi trường Python (nếu thiếu thư viện sẽ tự động cài đặt siêu nhẹ trong vài giây).
   - Khởi động DuckDB Engine in-memory và nạp 6 Views nghiệp vụ.
   - Khởi chạy máy chủ FastAPI trên cổng khả dụng (mặc định `8000`).
   - **Tự động mở trình duyệt Web** hiển thị giao diện hệ thống.

🌐 **Đường dẫn truy cập trực tiếp**:
* Giao diện người dùng Dashboard: **`http://localhost:8000`**
* Tài liệu tương tác API Swagger UI: **`http://localhost:8000/docs`**
* Tài liệu Redoc API: **`http://localhost:8000/redoc`**

---

### B. Khởi chạy trên hệ điều hành Linux / macOS:
Mở Terminal tại thư mục dự án và thực thi lệnh:
```bash
chmod +x run_app.sh
./run_app.sh
```

---

## 🧪 3. HƯỚNG DẪN CHẠY KIỂM THỬ TỰ ĐỘNG (TEST SUITE)

Để kiểm chứng tính toàn vẹn của mã nguồn và độ chính xác của các truy vấn DuckDB:

1. **Trên Windows**: Click đúp vào tệp:
   👉 **`test_system.bat`**
2. **Hoặc chạy bằng dòng lệnh**:
   ```cmd
   python src/tester.py
   ```
3. **Kết quả kiểm thử**: Toàn bộ **26/26 ca kiểm thử tự động** đạt tỷ lệ **100% PASS**:
   - **14 ca kiểm thử DuckDB**: Dải ngày, danh sách bãi, container đang tồn, container quá hạn, mức sử dụng theo ngày, bãi quá tải, xu hướng chuỗi thời gian, xếp hạng hãng tàu, tỷ trọng TEU, truy vết container, chỉ số KPI.
   - **4 ca kiểm thử Data Quality & ETL**: Phân loại 10 quy tắc, xuất file Parquet/CSV, cơ cấu lỗi.
   - **8 ca kiểm thử REST API**: Toàn bộ các endpoints `/api/meta`, `/api/overview`, `/api/yard-matrix`, `/api/containers`, `/api/trend`, `/api/rankings`, `/api/benchmark/run`.

---

## 📊 4. HƯỚNG DẪN SỬ DỤNG 7 PHÂN HỆ NGHIỆP VỤ

| STT | Phân hệ (Menu) | Mục tiêu & Thao tác của Giảng viên |
| :---: | :--- | :--- |
| **1** | **▦ Tổng quan** | Xem 4 Thẻ KPI vận hành bãi (Tổng cont, Tổng TEU, Quá hạn &ge;30 ngày, Khu bãi quá tải), Biểu đồ sản lượng Top Hãng tàu, Biểu đồ cơ cấu Loại container, Bảng xếp hạng và danh sách cảnh báo thời gian thực. Bấm nút *Làm mới số liệu* để cập nhật lại. |
| **2** | **⌂ Sơ đồ Bãi 2D** | Trực quan hóa mặt bằng bãi cảng gồm **8 Block (A1 - D2)** với thanh % tiến độ sức chứa tô màu theo 4 cấp độ: *An toàn (<70%), Mức cao (70-84%), Cảnh báo (85-94%), Quá tải (&ge;95%)*. |
| **3** | **📦 Container & Lịch sử** | • Lọc danh sách container theo: *Đang tồn bãi, Tồn quá hạn &ge;30 ngày, Sắp quá hạn*.<br>• Nhập mã container (VD: `PILU0017000`) bấm *Truy vết* để xem **Milestone Timeline Stepper** (Cổng vào, Đảo bãi, Cổng ra). |
| **4** | **⌁ Xu hướng** | Chọn từng khu bãi cảng (Bãi A đến Bãi H) để xem biểu đồ diện tích **Plotly Area Chart** biểu diễn biến động sức chứa theo chuỗi thời gian qua 365 ngày. |
| **5** | **♜ Xếp hạng** | Xem bảng xếp hạng và biểu đồ tỷ trọng phân bổ TEU của toàn bộ các Hãng tàu quốc tế và các loại Container (20'DC, 40'DC, 40'HC, 40'RF,...). |
| **6** | **🔄 ETL Dữ liệu** | Chọn file demo có 4 dòng sai quy tắc hoặc dữ liệu gốc ➔ Bấm *Chạy ETL & Phân loại dữ liệu* ➔ DuckDB kiểm tra 10 quy tắc hợp đồng dữ liệu, tách tự động dòng hợp lệ (xuất Parquet) và dòng lỗi (xuất CSV kèm lý do lỗi). |
| **7** | **⏱️ Benchmark** | Chọn quy mô đo lường (*1.000, 1.000.000 hoặc 5.000.000 dòng*) ➔ Bấm *Bắt đầu đo hiệu năng* ➔ DuckDB đo thực nghiệm so sánh tốc độ quét, tốc độ truy vấn tổng hợp và tỷ lệ tiết kiệm dung lượng đĩa của Parquet so với CSV. |

---

## 🗂️ 5. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
DEMO_DUCKDB_FASTAPI_V119/
├── app_server.py                 # Máy chủ chính FastAPI + Khởi tạo DuckDB In-Memory
├── requirements.txt              # Danh sách 4 thư viện siêu nhẹ (~15MB)
├── run_app.bat                   # File khởi chạy 1-Click trên Windows
├── run_app.sh                    # File khởi chạy trên Linux/macOS
├── test_system.bat               # File chạy kiểm thử tự động 26 test cases
├── RUNBOOK.md                    # Hướng dẫn chi tiết cho Giảng viên
├── README.md                     # Tổng quan đề án
├── src/
│   ├── config.py                 # Cấu hình đường dẫn, hằng số toàn cục
│   ├── core/
│   │   └── duckdb_engine.py      # Quản lý kết nối DuckDB & 6 TEMP Views nghiệp vụ
│   ├── services/
│   │   ├── analytics_service.py  # 13 hàm phân tích nghiệp vụ cảng bãi
│   │   ├── etl_service.py        # 10 quy tắc Data Contract Quality & Phân loại
│   │   └── benchmark_service.py  # Module đo thực nghiệm hiệu năng triệu dòng
│   ├── api/
│   │   └── routes.py             # RESTful API Endpoints phục vụ Web SPA
│   └── tester.py                 # Bộ kiểm thử tự động 26 ca kiểm thử
├── static/
│   ├── index.html                # Giao diện SPA (Sidebar Navy, Topbar, 7 Phân hệ)
│   ├── css/
│   │   └── style.css             # Thiết kế hiện đại, Dark/Light Mode, responsive
│   └── js/
│       ├── app.js                # Quản lý State, AJAX API, Toast Notifications
│       └── charts.js             # Render biểu đồ Plotly.js tương tác cao
└── data/
    ├── raw/                      # Dữ liệu CSV gốc (container.csv)
    ├── demo_data_100k/           # Các file Parquet nghiệp vụ (100.000 records)
    ├── etl_input/                # Dữ liệu đầu vào demo ETL
    ├── etl_output/               # Dữ liệu xuất sau khi phân loại ETL
    └── benchmark/                # Dữ liệu phục vụ đo hiệu năng
```

---

## 🛠️ 6. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

| Tình huống | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| **Máy chưa cài đặt Python** | Máy Giảng viên chưa có môi trường Python. | Cài đặt Python 3.10+ từ trang chủ [python.org](https://www.python.org/) và nhớ tích chọn `Add Python to PATH`. |
| **Cổng 8000 bị chiếm dụng** | Một phần mềm khác đang chạy trên cổng 8000. | Hệ thống có cơ chế tự động tìm cổng trống tiếp theo (8001, 8002...) và thông báo đường dẫn cụ thể trên màn hình. |
| **Cần xem lại tài liệu API** | Muốn kiểm tra schema và thử nghiệm gọi API trực tiếp. | Mở trình duyệt truy cập `http://localhost:8000/docs` để sử dụng giao diện Swagger UI tương tác. |

---

*Chúc Quý Thầy/Cô có trải nghiệm đánh giá và nghiệm thu đề án thuận lợi!*
