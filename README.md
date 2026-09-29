# KMA Schedule Rebuild

Ứng dụng React/Vite + Node/Express hiển thị thời khóa biểu. Người dùng có thể chọn:

- **QLĐT thật (mặc định):** backend đăng nhập trực tiếp vào Web Forms của `qldt.actvn.edu.vn`, giữ cookie trong một cookie jar riêng của request, yêu cầu file Excel thời khóa biểu và trả sự kiện đã chuẩn hóa.
- **Demo:** dữ liệu minh họa rõ ràng, không cần tài khoản hay mật khẩu.

Không sử dụng API crawl hoặc dịch vụ trung gian bên thứ ba.

## Bảo mật và giới hạn

- Mật khẩu chỉ được truyền trong `POST /api/login/schedule`, dùng trong thời gian xử lý request rồi bị xóa khỏi `request.body`; ứng dụng không ghi log, file, database, cookie trình duyệt hoặc `localStorage` chứa credentials.
- Cookie đăng nhập QLĐT chỉ nằm trong cookie jar phía server được tạo mới cho từng request và không được trả về browser.
- JSON đầu vào giới hạn 8 KiB; username tối đa 100 ký tự, password tối đa 256 ký tự; từng upstream request có timeout và giới hạn body cấu hình được.
- Response API đặt `Cache-Control: no-store`.
- **Cảnh báo transport:** QLĐT hiện chỉ cung cấp HTTP. Production của ứng dụng này phải được phục vụ qua **HTTPS** để bảo vệ browser → app, nhưng đoạn **server → QLĐT vẫn không được mã hóa**. Không triển khai backend này trên mạng/host không đáng tin cậy.
- Server không tạo session lâu dài. Refresh trang hoặc đăng xuất yêu cầu đăng nhập lại.

## Yêu cầu

- Node.js 20 trở lên (khuyến nghị bản LTS mới).

## Chạy development

```bash
npm install
npm run dev
```

`npm run dev` chạy Express ở `http://localhost:3000` và Vite ở URL thường là `http://localhost:5173`. Vite proxy `/api` tới Express. Có thể chạy riêng bằng `npm run dev:server` và `npm run dev:client`.

Nếu cần thay cấu hình mặc định, export các biến trong `.env.example` qua shell/process manager trước khi chạy. Dự án không tự đọc file `.env` để tránh tạo kỳ vọng sai về nơi lưu credentials.

## Test và build

```bash
npm test
npm run build
```

Unit test dùng fixture HTML đã ẩn danh và workbook tạo trong bộ nhớ; không cần credentials thật và không truy cập QLĐT.

## Production

```bash
npm run build
NODE_ENV=production PORT=3000 npm start
```

Express phục vụ `dist/` và API trên cùng origin. Đặt reverse proxy HTTPS (Caddy/Nginx/load balancer) trước Express; không expose HTTP app trực tiếp ra Internet.

Biến môi trường:

- `PORT`: cổng Express, mặc định `3000`.
- `QLDT_TIMEOUT_MS`: timeout mỗi request upstream, mặc định `12000` ms.
- `QLDT_MAX_BODY_BYTES`: body tối đa mỗi response upstream, mặc định `8388608` byte.

## API

### `GET /api/health`

Trả trạng thái backend; không thử đăng nhập QLĐT.

### `POST /api/login/schedule`

QLĐT thật:

```json
{ "mode": "qldt", "username": "...", "password": "..." }
```

Demo:

```json
{ "mode": "demo", "username": "DEMO2026", "password": "" }
```

Kết quả thành công gồm `mode`, `user`, `events`, `warnings`. Mỗi event có `id`, `date` (`YYYY-MM-DD`), `title`, `code`, `time`, `room`, `teacher`, `color`.

## Luồng QLĐT

1. Tạo cookie jar mới, GET `/CMCSoft.IU.Web.Info/Login.aspx`.
2. Parse toàn bộ hidden input, bắt buộc có `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`.
3. Băm mật khẩu bằng MD5 đúng theo giao thức của cổng trường rồi POST form cùng `txtUserName`, `txtPassword`, `btnSubmit` tới QLĐT. MD5 ở đây chỉ là định dạng mà hệ thống cũ yêu cầu, **không thay thế mã hóa đường truyền**.
4. Dùng cùng cookie jar để GET `/CMCSoft.IU.Web.Info/Reports/Form/StudentTimeTable.aspx`, lấy Web Forms state và POST yêu cầu `Xuất file Excel` cho học kỳ đang chọn.
5. Parser đọc workbook, mở rộng khoảng ngày + thứ + tiết thành từng ngày học; nếu upstream trả bảng HTML thì dùng parser Cheerio dự phòng. Sự kiện được chuẩn hóa và loại trùng.

## Hạn chế xác minh

Luồng HTTP công khai và cấu trúc form login đã được kiểm tra không cần credentials. Fixture/unit test kiểm chứng parser cho cấu trúc bảng đại diện. Tuy nhiên repository không có tài khoản QLĐT thật, nên **chưa thể xác minh end-to-end sau đăng nhập** hoặc bảo đảm HTML timetable thực tế hiện tại khớp hoàn toàn. Nếu QLĐT render bảng theo cấu trúc khác, backend sẽ trả `TIMETABLE_PARSE_FAILED` thay vì trả dữ liệu sai; cần lấy một bản HTML đã ẩn danh từ phiên hợp lệ để bổ sung fixture/parser.

## Cấu trúc chính

- `server/index.js`: Express API và static serving production.
- `server/qldt.js`: Web Forms login, cookie jar, timeout/body limits.
- `server/parser.js`: parser HTML dự phòng và normalized event model.
- `server/workbookParser.js`: parser file Excel xuất từ QLĐT, mở rộng lịch theo tuần.
- `src/App.jsx`: login QLĐT/demo, loading/error và lịch tháng/tuần.
- `test/fixtures/`: HTML fixture đã ẩn danh.
- `test/parser.test.js`: unit test parser.
