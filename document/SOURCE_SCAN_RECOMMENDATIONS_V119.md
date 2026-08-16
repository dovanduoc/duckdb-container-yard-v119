# Khuyến nghị đồng bộ logic phân tích theo ngày - V119

Tài liệu này ghi nhận khuyến nghị sau khi rà soát source V119. Đây là khuyến nghị thiết kế/logic, chưa phải thay đổi source code.

## R2. Chuẩn hóa khái niệm "container tồn tại ngày A" theo lát cắt thời gian

### 1. Quy tắc nghiệp vụ

Một lượt container được xem là đang tồn tại tại ngày A khi đồng thời thỏa mãn:

- `ngày A >= ngày Gate In`; và
- `ngày A <= ngày Gate Out`, hoặc `Gate Out IS NULL`.

Nói cách khác, khoảng thời gian tồn bãi được xét theo **khoảng đóng** ở mức ngày: từ ngày Gate In đến ngày Gate Out đều được tính là ngày container có mặt trong bãi. Với lượt chưa Gate Out, khoảng thời gian kéo dài từ ngày Gate In đến ngày phân tích.

Biểu diễn ở mức ngày:

```sql
CAST(gate_in_ts AS DATE) <= selected_date
AND (
    gate_out_ts IS NULL
    OR selected_date <= CAST(gate_out_ts AS DATE)
)
```

Tương đương:

```text
GateInDate <= A <= GateOutDate
```

hoặc, nếu chưa có Gate Out:

```text
GateInDate <= A AND GateOut IS NULL
```

Quy tắc này là baseline nghiệp vụ đã chốt cho bài demo và phải được dùng nhất quán trong toàn bộ phân tích theo ngày.

### 2. Phạm vi áp dụng

Logic as-of date phải được áp dụng thống nhất cho mọi chỉ số và bảng phân tích theo ngày, gồm:

- số container đang tồn tại ngày A;
- tổng TEU tồn tại ngày A;
- số container quá hạn tại ngày A;
- số ngày lưu bãi tại ngày A;
- xếp hạng hãng tàu theo lượng container/TEU tồn tại ngày A;
- cơ cấu loại container tại ngày A;
- các cảnh báo liên quan đến container tồn tại ngày A.

Không nên trộn dữ liệu của ngày A với trạng thái hiện tại (`hist = 'N'` hoặc `CURRENT_TIMESTAMP`) trong cùng một Dashboard lịch sử.

### 3. Tính số ngày lưu bãi theo ngày phân tích

Với container tồn tại ngày A, `dwell_days` được định nghĩa là **số ngày lịch container có mặt trong bãi, tính cả ngày Gate In là ngày thứ nhất**. Vì vậy công thức baseline bắt buộc là:

```sql
DATE_DIFF(
    'day',
    CAST(gate_in_ts AS DATE),
    selected_date
) + 1 AS dwell_days
```

Ví dụ:

- Gate In ngày 10/08, phân tích ngày 10/08 -> `dwell_days = 1`.
- Gate In ngày 10/08, phân tích ngày 11/08 -> `dwell_days = 2`.
- Gate In ngày 10/08, Gate Out ngày 12/08 -> container được tính tồn trong cả ba ngày 10, 11, 12; tại ngày 12/08, `dwell_days = 3`.

Không sử dụng `CURRENT_TIMESTAMP` khi tính `dwell_days` cho Dashboard lịch sử. Nếu cần trạng thái hiện tại thì ngày tham chiếu phải được xác định riêng, nhưng vẫn áp dụng cùng quy tắc đếm ngày bao gồm ngày Gate In.

Quy tắc `DATE_DIFF(...) + 1` là baseline nghiệp vụ đã chốt và phải được sử dụng thống nhất trong source code, API, KPI, kiểm thử, tài liệu tiểu luận và slide trình bày.

### 4. Tách rõ hai ngữ nghĩa trong service/API

Khuyến nghị tách rõ:

- `current`: trạng thái hiện tại của hệ thống;
- `as_of_date`: trạng thái tại một ngày lịch sử được chọn.

Ví dụ có thể bổ sung các hàm hoặc tham số:

```text
get_containers_as_of_date(selected_date)
get_overview_kpis(selected_date)
get_shipping_line_ranking(selected_date)
get_container_type_teu_ranking(selected_date)
```

Nếu một hàm nhận `selected_date`, toàn bộ dữ liệu trả về từ hàm đó phải cùng tham chiếu đến ngày này.

### 5. Vị trí bãi tại ngày A

Nếu cần xác định container nằm ở bãi nào tại ngày A, không nên luôn lấy `container.yard_area_id` hiện tại/cuối cùng. Cần xác định sự kiện gần nhất có `event_ts` thuộc ngày A hoặc trước ngày A, sau đó suy ra `yard_area_id` có hiệu lực tại lát cắt phân tích.

Ở mức timestamp, có thể hiểu mốc cuối ngày A là thời điểm tham chiếu để tìm sự kiện gần nhất. Điều này đặc biệt quan trọng khi container đã phát sinh nhiều lần `YARD_MOVE`.

### 6. Kiểm thử bắt buộc

Nên bổ sung các ca kiểm thử tối thiểu:

1. `selected_date < gate_in_date` -> không được tính là tồn.
2. `selected_date = gate_in_date` -> được tính là tồn và `dwell_days = 1`.
3. `selected_date = gate_in_date + 1 ngày` -> được tính là tồn và `dwell_days = 2` nếu chưa Gate Out.
4. `gate_in_date < selected_date < gate_out_date` -> được tính là tồn.
5. `selected_date = gate_out_date` -> được tính là tồn; `dwell_days = DATE_DIFF('day', gate_in_date, gate_out_date) + 1`.
6. `selected_date > gate_out_date` -> không được tính là tồn.
7. `gate_out_ts IS NULL` và `selected_date >= gate_in_date` -> được tính là tồn.
8. KPI số container, TEU, dwell và ranking cùng một `selected_date` phải dùng chung tập container as-of-date.
9. Nếu có `YARD_MOVE`, vị trí bãi tại ngày A phải lấy theo sự kiện gần nhất trước hoặc trong ngày phân tích.

### 7. Mức ưu tiên

**P1 - cần xử lý trước khi khóa source dùng để bảo vệ**, vì đây là vấn đề ngữ nghĩa dữ liệu và ảnh hưởng trực tiếp đến tính đúng đắn của Dashboard khi người dùng chọn ngày lịch sử.

---

## R3. Đồng bộ ngày phân tích từ giao diện xuống toàn bộ API

### 1. Vấn đề rà soát

Backend hiện đã hỗ trợ `selected_date` cho các API phân tích theo ngày, nhưng giao diện phải bảo đảm truyền cùng `AppState.analysisDate` cho mọi phân hệ có dữ liệu phụ thuộc ngày.

Đặc biệt cần kiểm tra hai lời gọi:

```javascript
/api/containers
/api/rankings
```

Nếu không truyền `date`, backend có thể tự lấy ngày dữ liệu mới nhất trong khi người dùng đang chọn một ngày lịch sử trên giao diện. Khi đó các phân hệ sẽ không còn cùng một lát cắt thời gian.

### 2. Khuyến nghị

Các lời gọi frontend phải truyền ngày đang chọn:

```javascript
fetch(`/api/containers?date=${AppState.analysisDate}&filter_type=${filterType}&limit=40`)
```

```javascript
fetch(`/api/rankings?date=${AppState.analysisDate}`)
```

Nguyên tắc bắt buộc:

> Khi người dùng chọn ngày A, mọi KPI, danh sách container, cảnh báo, xếp hạng và cơ cấu dữ liệu phụ thuộc ngày phải cùng tham chiếu đến ngày A.

### 3. Kiểm thử

- Chọn ngày A khác `max_date`.
- So sánh số container trên Overview với tổng container ở Ranking.
- Mở phân hệ Container và kiểm tra cùng ngày A.
- Đổi sang ngày B và xác nhận cả ba phân hệ cùng thay đổi theo B.

### 4. Mức ưu tiên

**P1 - bắt buộc trước khi khóa bản demo**, vì đây là lỗi đồng bộ trạng thái giữa frontend và backend.

---

## R4. Kiểm thử lát cắt thời gian phải định danh theo `container_id`

### 1. Nguyên tắc grain

Trong mô hình của đề tài, `container_no` định danh container vật lý, còn `container_id` định danh **một lượt container vào bãi**.

Một `container_no` có thể xuất hiện ở nhiều lượt khác nhau. Vì vậy test boundary cho một lượt cụ thể không nên xác nhận bằng `container_no`, vì một lượt khác của cùng container có thể làm test PASS hoặc FAIL sai ngữ nghĩa.

### 2. Khuyến nghị

Các test As-of-Date cần đối chiếu bằng:

```python
container_id
```

thay vì chỉ dùng:

```python
container_no
```

Ví dụ:

```python
assert target_container_id in res["container_id"].values
```

hoặc:

```python
assert target_container_id not in res["container_id"].values
```

### 3. Kiểm thử bổ sung

Tạo trường hợp cùng một `container_no` có ít nhất hai lượt:

- Visit 1 đã Gate Out;
- Visit 2 Gate In ở thời điểm khác.

Sau đó xác nhận lát cắt thời gian chỉ chọn đúng `container_id` có hiệu lực tại ngày A.

### 4. Mức ưu tiên

**P1 - nên sửa trước khi dùng kết quả test làm bằng chứng học thuật**, vì nó liên quan trực tiếp đến grain của mô hình dữ liệu.

---

## R5. Chuẩn hóa lịch sử container theo từng lượt vào bãi

### 1. Vấn đề rà soát

`get_container_history(container_no)` có thể trả về dữ liệu của nhiều lượt container. Nếu API sau đó lấy một dòng đầu tiên để xác định Gate In, Gate Out, trạng thái và đồng thời gộp toàn bộ sự kiện của các lượt vào một timeline, kết quả sẽ sai khi cùng `container_no` quay lại cảng nhiều lần.

### 2. Mô hình mong muốn

Lịch sử phải được tổ chức theo cấu trúc:

```text
container_no
 ├─ Visit 1 / container_id 101
 │   └─ Gate In → Yard Move → Gate Out
 ├─ Visit 2 / container_id 502
 │   └─ Gate In → Yard Move → Gate Out
 └─ Visit 3 / container_id 901
     └─ Gate In → hiện tại
```

### 3. Khuyến nghị API

Có thể chọn một trong hai hướng:

**Hướng A - trả toàn bộ các visit theo nhóm**

```json
{
  "container_no": "...",
  "visits": [
    {
      "container_id": 101,
      "gate_in_ts": "...",
      "gate_out_ts": "...",
      "status": "...",
      "events": []
    }
  ]
}
```

**Hướng B - tách endpoint theo lượt**

```text
GET /api/containers/history?container_no=...
GET /api/containers/visit?container_id=...
```

Trong mọi trường hợp, trạng thái của một visit phải được xác định từ chính `container_id` đó, không lấy `first_row` của toàn bộ lịch sử container.

### 4. Tránh nhân đôi mốc sự kiện

Nếu `v_container_event` đã chứa `GATE_IN` hoặc `GATE_OUT`, API không nên vừa tự sinh thêm mốc Gate In/Gate Out vừa lặp lại cùng sự kiện từ bảng event. Cần quy định nguồn sự thật cho timeline:

- hoặc lấy toàn bộ milestone từ `container_event`;
- hoặc dựng Gate In/Gate Out từ bảng visit và chỉ lấy `YARD_MOVE`/sự kiện trung gian từ `container_event`.

### 5. Mức ưu tiên

**P1 - cần xử lý trước demo bảo vệ**, vì đây là câu hỏi phản biện rất dễ phát sinh khi giảng viên kiểm tra khả năng mô hình hóa nhiều lượt của cùng một container.

---

## R6. Tăng cường Rule 06 cho `container_type`

### 1. Vấn đề rà soát

Rule 06 hiện mới kiểm tra `container_type` không rỗng/NULL, trong khi hệ thống đã có `v_container_type_ref` làm danh mục tham chiếu.

Do đó một giá trị không hợp lệ nhưng khác rỗng vẫn có thể vượt qua bước phân loại ETL.

### 2. Khuyến nghị tối thiểu

Rule 06 nên kiểm tra `container_type` thuộc tập giá trị tham chiếu:

```sql
TRIM(container_type) IN (
    SELECT container_type
    FROM v_container_type_ref
)
```

### 3. Khuyến nghị nâng cao

Bổ sung kiểm tra chéo giữa loại và kích thước container, ví dụ:

```text
20DC / 20RF -> container_size = 20
40DC / 40HC / 40RF -> container_size = 40
45HC -> container_size = 45
```

Đây là **quy tắc nhất quán liên trường (cross-field consistency rule)**, có giá trị tốt khi trình bày phần chất lượng dữ liệu trong bài tiểu luận.

### 4. Kiểm thử

Bổ sung tối thiểu:

1. `container_type = NULL` -> reject.
2. `container_type = 'ABCXYZ'` -> reject.
3. `container_type = '40HC', container_size = 20` -> reject nếu áp dụng kiểm tra chéo.
4. `container_type = '45HC', container_size = 45` -> pass.

### 5. Mức ưu tiên

**P2 - nên hoàn thiện trước khi khóa ETL**, không phải blocker của logic As-of-Date nhưng giúp bộ quy tắc dữ liệu chặt chẽ hơn.

---

## R7. Đồng bộ tài liệu kỹ thuật với source hiện tại

### 1. Công thức `dwell_days`

Tài liệu kỹ thuật phải thay công thức dùng `CURRENT_TIMESTAMP` bằng baseline đã chốt:

```sql
DATE_DIFF('day', GateInDate, selected_date) + 1
```

Đồng thời nêu rõ ngày Gate In là ngày thứ nhất và ngày Gate Out vẫn được tính là ngày tồn bãi.

### 2. Rule 09

Source hiện reject trường hợp:

```text
gate_out_ts <= gate_in_ts
```

vì vậy điều kiện hợp lệ trong tài liệu phải là:

```text
gate_out_ts > gate_in_ts
```

không ghi `>=`.

### 3. API documentation

Cập nhật tham số `date` cho các endpoint đã hỗ trợ phân tích theo lát cắt thời gian, tối thiểu:

```text
GET /api/containers?date=YYYY-MM-DD
GET /api/rankings?date=YYYY-MM-DD
```

Đồng thời mô tả rằng `date` phải cùng ngữ nghĩa với ngày đang chọn ở Dashboard.

### 4. Ngôn ngữ học thuật

Trong tài liệu phục vụ tiểu luận/bảo vệ, tránh các claim chưa có phép đo hoặc bằng chứng trực tiếp như:

- "Production Ready";
- thời gian phản hồi cố định dưới một ngưỡng nếu chưa benchmark đúng điều kiện;
- "10-100 lần nhanh hơn" như một kết luận tổng quát;
- "Enterprise Architecture" nếu phạm vi mới là ứng dụng minh họa.

Ưu tiên cách diễn đạt:

> Trong phạm vi dữ liệu mô phỏng và cấu hình thực nghiệm hiện tại...

### 5. Mức ưu tiên

**P1 đối với các sai khác công thức/ngữ nghĩa; P2 đối với wording và claim kỹ thuật.**

---

## R8. Chuẩn hóa cấu trúc thư mục tài liệu

### 1. Vấn đề

Repository hiện tồn tại đồng thời hai thư mục khác tên theo hoa/thường:

```text
Document/
document/
```

Trên Linux đây là hai thư mục độc lập. Điều này dễ gây nhầm lẫn khi đóng gói, review hoặc triển khai.

### 2. Khuyến nghị

Gộp về một thư mục duy nhất. Có thể chọn:

```text
document/
```

hoặc chuẩn phổ biến hơn:

```text
docs/
```

Sau khi gộp, cập nhật mọi đường dẫn tham chiếu trong README, runbook và tài liệu liên quan.

### 3. Mức ưu tiên

**P2 - vệ sinh repository trước khi khóa bản nộp/bảo vệ.**

---

## Thứ tự xử lý đề xuất

1. **R3 - truyền `selected_date` từ frontend cho Container và Ranking.**
2. **R5 - tách lịch sử theo từng `container_id` / visit.**
3. **R4 - sửa boundary test dùng `container_id`.**
4. **R6 - tăng cường kiểm tra `container_type`.**
5. **R7 - đồng bộ tài liệu kỹ thuật với source.**
6. **R8 - gộp thư mục tài liệu.**

Sau khi hoàn tất các mục trên, nên chạy lại toàn bộ test suite và chỉ cập nhật con số PASS trong tiểu luận khi có kết quả chạy thực tế trên source cuối cùng.
