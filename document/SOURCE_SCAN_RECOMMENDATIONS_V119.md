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

Với container tồn tại ngày A, thời gian lưu bãi tại lát cắt ngày A phải được tính theo `selected_date`, không dùng `CURRENT_TIMESTAMP`:

```sql
DATE_DIFF(
    'day',
    CAST(gate_in_ts AS DATE),
    selected_date
) AS dwell_days
```

Cần phân biệt hai khái niệm:

- **số ngày chênh lệch**: Gate In đúng ngày A cho kết quả `0`;
- **số ngày lịch có mặt trong bãi**: nếu nghiệp vụ cần đếm cả ngày Gate In là ngày thứ nhất thì có thể dùng `DATE_DIFF(...) + 1`.

Trong bài tiểu luận và giao diện phải chọn một cách diễn giải và sử dụng thống nhất. Quy tắc xác định container có tồn tại ngày A vẫn là `GateInDate <= A <= GateOutDate` hoặc Gate Out chưa phát sinh.

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
2. `selected_date = gate_in_date` -> được tính là tồn.
3. `gate_in_date < selected_date < gate_out_date` -> được tính là tồn.
4. `selected_date = gate_out_date` -> được tính là tồn.
5. `selected_date > gate_out_date` -> không được tính là tồn.
6. `gate_out_ts IS NULL` và `selected_date >= gate_in_date` -> được tính là tồn.
7. KPI số container, TEU, dwell và ranking cùng một `selected_date` phải dùng chung tập container as-of-date.
8. Nếu có `YARD_MOVE`, vị trí bãi tại ngày A phải lấy theo sự kiện gần nhất trước hoặc trong ngày phân tích.

### 7. Mức ưu tiên

**P1 - cần xử lý trước khi khóa source dùng để bảo vệ**, vì đây là vấn đề ngữ nghĩa dữ liệu và ảnh hưởng trực tiếp đến tính đúng đắn của Dashboard khi người dùng chọn ngày lịch sử.
