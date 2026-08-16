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
