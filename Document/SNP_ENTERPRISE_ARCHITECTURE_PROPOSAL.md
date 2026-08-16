# 📑 ĐỀ XUẤT GIẢI PHÁP KIẾN TRÚC CÔNG NGHỆ DỮ LIỆU THỜI GIAN THỰC CHO TỔNG CÔNG TY TÂN CẢNG SÀI GÒN (SNP)
## ĐỀ TÀI: NỀN TẢNG GIÁM SÁT & ĐIỀU HÀNH CONTAINER TỒN BÃI GẦN THỜI GIAN THỰC (NEAR REAL-TIME 5 PHÚT)
**Đơn vị đề xuất**: Nhóm Nghiên cứu & Phát triển Giải pháp Công nghệ Dữ liệu Cảng biển  
**Mục tiêu**: Xây dựng kiến trúc dữ liệu thế hệ mới kết nối từ `Oracle TOS` ➔ `CDC` ➔ `Data Lake` ➔ `ClickHouse/FastAPI` ➔ `Màn hình Điều hành OCC`

---

## 🎯 1. BỐI CẢNH VẬN HÀNH & CÁC BÀI TOÁN ĐIỀU HÀNH CỐT TỬ TẠI SNP

Hệ thống cảng và ICD của SNP (Cát Lái, Cái Mép TCIT/TCTT, Hải Phòng, các ICD Tân Cảng) đang đối mặt với các thách thức lớn trong công tác điều hành bãi container:
1. **Giám sát Sức chứa Bãi cảng (Heatmap)**: Theo dõi tỷ lệ lấp đầy theo từng Block (A1-D2) chu kỳ 5 phút. Cảnh báo ngay khi bãi chạm ngưỡng nguy hiểm (≥85% và ≥95%).
2. **Xử lý Container Lưu Bãi Quá Hạn**: Phát hiện sớm các lô hàng tồn >30 ngày để kích hoạt quy trình thông báo khách hàng, giảm áp lực chiếm dụng bãi.
3. **Phân bổ Hãng tàu & Chủng loại Container**: Phân tích sản lượng TEU theo từng Hãng tàu và chủng loại container (20/40/45ft, Cont Lạnh Reefer) theo thời gian thực.
4. **Bảo toàn Hiệu năng Hệ thống TOS Oracle**: Tuyệt đối không để các báo cáo phân tích làm chậm hoặc treo hệ thống TOS cốt lõi (TOPX/CATOS) đang điều hành cẩu và cổng.

---

## 🏗️ 2. KIẾN TRÚC NGĂN XẾP CÔNG NGHỆ TỔNG THỂ (TARGET ARCHITECTURE)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. TẦNG NGUỒN VẬN HÀNH (OPERATIONAL TOS TIER)                                          │
│    - Hệ thống: TOPX / CATOS / VTOS                                                     │
│    - CSDL: Oracle RAC / Exadata (Ghi nhận giao dịch Cổng, Cẩu bờ, Cẩu bãi RTG)        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 1. CDC Streaming (Đọc ngầm Oracle Redo Logs)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. TẦNG THU THẬP & HÀNG ĐỢI SỰ KIỆN (INGESTION & STREAMING TIER)                       │
│    - CDC Engine: Debezium Connector hoặc Oracle GoldenGate                             │
│    - Message Broker: Apache Kafka Cluster (Lưu đệm sự kiện thay đổi container)        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 2. Micro-batch / Native Ingestion (5 phút)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. TẦNG HỒ DỮ LIỆU & LƯU TRỮ LÂU DÀI (LAKEHOUSE STORAGE TIER)                          │
│    - Object Storage: MinIO Cluster On-Premise (Tương thích chuẩn S3)                   │
│    - Định dạng tệp: Apache Iceberg / Apache Parquet (Snappy Columnar Compression)      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 3. Real-time In-Memory Vectorized Query
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. TẦNG CSDL PHÂN TÍCH HIỆU NĂNG CAO (REAL-TIME DISTRIBUTED OLAP ENGINE)               │
│    - Công nghệ cốt lõi: CLICKHOUSE CLUSTER (hoặc STARROCKS)                            │
│    - Tốc độ: Xử lý 100.000.000 dòng trong < 0.05 giây                                  │
│    - Cơ chế: Nạp trực tiếp từ Kafka Topic qua ClickHouse Kafka Engine Table            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 4. RESTful API / WebSocket / SSE
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 5. TẦNG DỊCH VỤ & MÀN HÌNH ĐIỀU HÀNH (SERVING & OCC DASHBOARD TIER)                    │
│    - API Gateway: FastAPI Asynchronous Microservices                                  │
│    - Giao diện: Modern Web SPA Dashboard (Sơ đồ nhiệt 2D 8 Blocks, Cảnh báo tức thì)  │
│    - Người dùng: Trung tâm Điều hành Cảng (OCC), Đội Điều độ, Phòng Khai thác, Lãnh đạo │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 3. DANH MỤC CÔNG NGHỆ CHI TIẾT (TECHNOLOGY STACK MATRIX)

| Thành Phần | Công Nghệ Đề Xuất | Vai Trò Trong Hệ Thống | Lý Do Lựa Chọn & Ưu Thế Vượt Trội |
| :--- | :--- | :--- | :--- |
| **Nguồn TOS** | **Oracle Database** | CSDL Vận hành | Giữ nguyên hiện trạng hệ sinh thái TOPX/CATOS sẵn có của SNP. |
| **CDC Engine** | **Debezium / GoldenGate** | Bắt sự kiện thay đổi | Đọc trực tiếp từ Redo Log, **tải 0% CPU lên CSDL Oracle TOS**. |
| **Message Broker** | **Apache Kafka** | Đệm luồng dữ liệu | Khả năng chịu tải hàng trăm nghìn sự kiện/giây, không bao giờ mất dữ liệu. |
| **Data Lake** | **MinIO S3 + Parquet** | Lưu trữ lịch sử | Giảm 85% dung lượng đĩa, chi phí lưu trữ rẻ gấp 10 lần so với SAN Storage. |
| **CSDL Phân tích** | **ClickHouse Cluster** | Động cơ OLAP 5 phút | **Nhanh nhất thế giới**, hỗ trợ nạp tự động từ Kafka, bản quyền mã nguồn mở 0đ. |
| **Backend API** | **FastAPI (Python)** | Cổng dữ liệu bất đồng bộ | Xử lý hàng nghìn kết nối đồng thời, tự động sinh tài liệu Swagger/OpenAPI. |
| **Frontend UI** | **Modern Web SPA** | Giao diện OCC Cảng | Tải trang < 0.08s, tương tác mượt mà, hỗ trợ Dark/Light Mode cho phòng trực ban. |
