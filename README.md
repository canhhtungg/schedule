# KMA Schedule Rebuild

Ứng dụng full-stack React/Vite đọc thời khóa biểu ACTVN. Frontend vẫn là Vite; API chạy bằng:

- **Local:** Express ở cổng `3000`, được Vite proxy qua `/api`.
- **Vercel:** hai Node.js Functions độc lập trong `api/`, không khởi động Express runtime.

Người dùng có thể chọn QLĐT thật hoặc dữ liệu demo. Không sử dụng API crawl/dịch vụ trung gian bên thứ ba.

## Bảo mật và giới hạn

- Credentials chỉ được nhận qua `POST /api/login/schedule`, dùng trong request hiện tại rồi bị xóa khỏi object body. Ứng dụng không log hoặc lưu credentials vào file, database, cookie trình duyệt hay `localStorage`.
- Mỗi request tạo một cookie jar QLĐT riêng; cookie upstream không được trả về browser.
- Request JSON tối đa 8 KiB; username tối đa 100 ký tự; password tối đa 256 ký tự.
- Mỗi response upstream có timeout và giới hạn kích thước cấu hình được.
- API trả `Cache-Control: no-store` cùng `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` và `Permissions-Policy`.
- **QLĐT chỉ hỗ trợ HTTP.** Vercel bảo vệ browser → Function bằng HTTPS, nhưng chặng Function → `qldt.actvn.edu.vn` vẫn là HTTP, không được mã hóa. Không nhập credentials trên deployment không tin cậy.
- Function không tạo session lâu dài. Refresh hoặc đăng xuất sẽ yêu cầu đăng nhập lại.

## Yêu cầu

- Node.js 20 trở lên.
- npm.

## Chạy local

```bash
npm install
npm run dev
```

`npm run dev` chạy đồng thời:

- Express: `http://localhost:3000`
- Vite: thường là `http://localhost:5173`

Vite proxy `/api` tới Express nên frontend dùng cùng URL API như production. Có thể chạy riêng bằng `npm run dev:server` và `npm run dev:client`.

Các biến môi trường tùy chọn (xem `.env.example`):

- `PORT`: cổng Express, mặc định `3000`.
- `QLDT_TIMEOUT_MS`: timeout cho **mỗi** request upstream, mặc định `12000` ms.
- `QLDT_MAX_BODY_BYTES`: response upstream tối đa, mặc định `8388608` byte.

Dự án không tự đọc `.env`; hãy export biến qua shell/process manager hoặc khai báo trong Vercel Project Settings. Không đưa username/password QLĐT vào biến môi trường.

## Test, build và audit

```bash
npm test
npm run build
npm audit
```

Test parser dùng fixture ẩn danh/workbook trong bộ nhớ. Test API gọi trực tiếp handler với dependency QLĐT giả lập, kiểm tra demo, validation, giới hạn body, security headers và xác nhận các nhánh đó không gọi upstream.

## Deploy full-stack lên Vercel

Repository nguồn: [github.com/canhhtungg/schedule](https://github.com/canhhtungg/schedule)

1. Đăng nhập Vercel và chọn **Add New → Project**.
2. Chọn **Import Git Repository**, kết nối GitHub nếu cần, rồi import `canhhtungg/schedule`.
3. Giữ **Root Directory** là thư mục gốc repository.
4. Vercel sẽ đọc `vercel.json` với:
   - Framework: `vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Node Functions: `api/**/*.js`, thời lượng tối đa cấu hình `60` giây
5. Nếu cần đổi giới hạn upstream, thêm `QLDT_TIMEOUT_MS` và/hoặc `QLDT_MAX_BODY_BYTES` trong **Project Settings → Environment Variables**. Không lưu credentials sinh viên tại đây.
6. Chọn **Deploy**. Sau khi hoàn tất, kiểm tra `GET https://<deployment>/api/health`, mở frontend và thử chế độ demo trước.

Mỗi lần push vào nhánh production sẽ tạo deployment mới theo cấu hình Git của project. Preview deployment cũng có Functions/API tương ứng.

> Lưu ý: một lần tải lịch thực hiện nhiều request HTTP tuần tự tới QLĐT. Upstream có thể chậm, đổi form hoặc tạm ngừng; handler sẽ timeout và trả lỗi ổn định thay vì treo vô hạn. Vercel Function không làm cho chặng HTTP upstream trở thành HTTPS.

## API

### `GET /api/health`

Trả trạng thái Function/server; không gọi QLĐT:

```json
{ "ok": true, "service": "kma-schedule", "upstreamTransport": "http" }
```

### `POST /api/login/schedule`

Yêu cầu `Content-Type: application/json`.

QLĐT thật:

```json
{ "mode": "qldt", "username": "...", "password": "..." }
```

Demo (không gọi upstream):

```json
{ "mode": "demo", "username": "DEMO2026", "password": "" }
```

Kết quả thành công gồm `mode`, `user`, `events`, `warnings`. Mỗi event có `id`, `date` (`YYYY-MM-DD`), `title`, `code`, `time`, `room`, `teacher`, `color`.

## Luồng QLĐT

1. Tạo cookie jar mới, GET trang Web Forms login.
2. Parse hidden input và yêu cầu `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`.
3. POST `txtUserName`, `txtPassword`, `btnSubmit`. Backend không tự băm lại password.
4. Dùng cùng cookie jar để GET trang thời khóa biểu, rồi POST yêu cầu xuất Excel.
5. Parser đọc workbook; nếu upstream trả bảng HTML thì dùng parser Cheerio dự phòng. Kết quả được chuẩn hóa và loại trùng.

Logic này nằm trong `server/qldt.js` và được dùng trực tiếp bởi handler chung cho cả Express local lẫn Vercel Functions.

## Hạn chế xác minh

Luồng HTTP công khai và parser được kiểm tra không cần credentials thật. Repository không có tài khoản QLĐT nên chưa thể xác minh end-to-end sau đăng nhập. Nếu upstream đổi cấu trúc, API trả lỗi như `UPSTREAM_FORM_CHANGED` hoặc `TIMETABLE_PARSE_FAILED` thay vì trả dữ liệu đoán.

## Cấu trúc chính

- `api/health.js`: Vercel Function cho health check.
- `api/login/schedule.js`: Vercel Function cho login/lịch.
- `server/apiHandlers.js`: handler Node dùng chung, validation, headers và dependency injection cho test.
- `server/index.js`: Express local và static serving khi chạy Node production ngoài Vercel.
- `server/qldt.js`: Web Forms login, cookie jar, timeout/body limits.
- `server/parser.js`, `server/workbookParser.js`: chuẩn hóa dữ liệu lịch.
- `test/apiHandlers.test.js`: unit/integration test trực tiếp handler.
- `vercel.json`: cấu hình Vite build, output và Functions.
