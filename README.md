# KMA Schedule by CanhTung

Ứng dụng full-stack React/Vite đọc thời khóa biểu ACTVN, hiển thị tháng/tuần hiện tại, lịch âm Việt Nam và cho phép thêm/sửa/xóa sự kiện trong phiên hiện tại.

- **Local:** Express ở cổng `3000`, được Vite proxy qua `/api`.
- **Vercel:** Node.js Functions trong `api/`, không khởi động Express runtime.
- Không dùng API crawl hoặc dịch vụ phân tích bên thứ ba.

## Hai cách mở lịch

### 1. Dùng tài khoản QLĐT

Chọn **Dùng tài khoản QLĐT**, nhập mã sinh viên và mật khẩu. Backend đăng nhập trực tiếp vào QLĐT, tải thời khóa biểu và chỉ dùng credentials trong request hiện tại.

### 2. Dùng file/HTML

Chọn **Dùng file/HTML**, sau đó chọn đúng một nguồn:

- Upload file Excel `.xls`/`.xlsx` xuất từ QLĐT, tối đa **3 MB sau giải mã**; hoặc
- Dán HTML của trang `StudentTimeTable.aspx`, tối đa **1 MB UTF-8**.

Dữ liệu được gửi bằng JSON tới backend cùng origin và phân tích tại đó. Nếu trang chỉ là trang cấu hình hoặc không có sự kiện, API trả lỗi rõ thay vì mở lịch trống.

## Bảo mật và giới hạn

- Credentials chỉ được nhận qua `POST /api/login/schedule`, dùng trong request hiện tại rồi bị xóa khỏi object body. Ứng dụng không log hoặc lưu credentials vào file, database, cookie trình duyệt hay `localStorage`.
- Mỗi lần đăng nhập tạo một cookie jar QLĐT riêng; cookie upstream không được trả về browser.
- Request đăng nhập tối đa 8 KiB; username tối đa 100 ký tự; password tối đa 256 ký tự.
- API import kiểm tra nghiêm ngặt source type, extension và base64; HTML tối đa 1 MB, workbook giải mã tối đa 3 MB.
- Mỗi response upstream có timeout và giới hạn kích thước cấu hình được.
- API trả `Cache-Control: no-store` cùng `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` và `Permissions-Policy`. Service worker bỏ qua toàn bộ `/api/`.
- **QLĐT chỉ hỗ trợ HTTP.** HTTPS bảo vệ browser → app, nhưng chặng app server → `qldt.actvn.edu.vn` vẫn không được mã hóa. Chỉ nhập credentials trên deployment do bạn tin cậy và kiểm soát.
- Không có session lâu dài. Refresh/đăng xuất sẽ xóa lịch đang mở và mọi chỉnh sửa CRUD cục bộ.

## Chạy local

Yêu cầu Node.js 20+ và npm:

```bash
npm install
npm run dev
```

`npm run dev` chạy Express (`http://localhost:3000`) và Vite (thường là `http://localhost:5173`). Vite proxy `/api` tới Express.

Biến môi trường tùy chọn (xem `.env.example`):

- `PORT`: cổng Express, mặc định `3000`.
- `QLDT_TIMEOUT_MS`: timeout cho mỗi request upstream, mặc định `12000` ms.
- `QLDT_MAX_BODY_BYTES`: response upstream tối đa, mặc định `8388608` byte.

Không đưa username/password QLĐT vào biến môi trường.

## Test, build và audit

```bash
npm test
npm run build
npm audit --omit=dev
git diff --check
```

Test bao phủ parser HTML/workbook, giữ giảng viên khi nguồn có, import API (HTML, base64 workbook, input sai/quá cỡ), helper lịch âm, điều hướng ngày và CRUD thuần.

## API

### `GET /api/health`

```json
{ "ok": true, "service": "kma-schedule", "upstreamTransport": "http" }
```

### `POST /api/login/schedule`

`Content-Type: application/json`:

```json
{ "username": "...", "password": "..." }
```

### `POST /api/import/schedule`

Nhập HTML:

```json
{ "sourceType": "html", "content": "<html>...</html>" }
```

Nhập Excel:

```json
{ "sourceType": "excel", "contentBase64": "...", "filename": "tkb.xlsx" }
```

Kết quả thành công gồm `mode`, `user`, `events`. Mỗi event có `id`, `date` (`YYYY-MM-DD`), `title` và các trường tùy chọn `code`, `time`, `room`, `teacher`, `color`.

## Deploy lên Vercel

`vercel.json` cấu hình Vite build, thư mục `dist` và Functions `api/**/*.js` (tối đa 60 giây). Sau khi deploy, kiểm tra `GET /api/health`, rồi thử import một fixture không nhạy cảm trước khi dùng tài khoản thật.

Một lần tải QLĐT thực hiện nhiều request HTTP tuần tự. Upstream có thể chậm, đổi form hoặc tạm ngừng; handler timeout và trả lỗi ổn định thay vì treo vô hạn.

## Luồng và cấu trúc chính

1. `server/qldt.js` tạo cookie jar, đọc hidden fields Web Forms, đăng nhập và tải export.
2. `server/parser.js` và `server/workbookParser.js` đọc HTML/workbook, chuẩn hóa và loại trùng sự kiện.
3. `server/apiHandlers.js` cung cấp handler dùng chung cho Express và Vercel, gồm validation/headers/giới hạn body.
4. `api/login/schedule.js` và `api/import/schedule.js` là Vercel Functions tương ứng.
5. `src/calendarUtils.js` bọc `lunar-javascript` (MIT) cho lịch âm; `src/scheduleUtils.js` chứa CRUD thuần.

## Hạn chế xác minh

Luồng parser/API được kiểm tra không cần credentials thật. Repository không có tài khoản QLĐT nên chưa thể xác minh end-to-end sau đăng nhập. Nếu upstream đổi cấu trúc, API trả lỗi ổn định thay vì trả dữ liệu đoán. Parser Excel giữ giảng viên khi export có cột/nhãn nhận diện được; các biến thể bố cục chưa có fixture có thể cần bổ sung alias.
