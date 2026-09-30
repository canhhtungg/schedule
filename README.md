# KMA Schedule by CanhTung

Ứng dụng full-stack React/Vite đọc thời khóa biểu ACTVN, hiển thị tháng/tuần hiện tại, lịch âm Việt Nam và cho phép thêm/sửa/xóa sự kiện. Lịch đang mở cùng các chỉnh sửa được lưu cục bộ để refresh không phải đăng nhập lại. Tab **Cài đặt** trong sidebar hỗ trợ giao diện, lịch âm và Web Push nhắc lịch ngay cả khi tab đã đóng.

- **Local:** Express ở cổng `3000`, được Vite proxy qua `/api`.
- **Vercel:** Node.js Functions trong `api/`, không khởi động Express runtime.
- Không dùng API crawl hoặc dịch vụ phân tích lịch bên thứ ba; Web Push nền dùng QStash làm bộ lập lịch, với payload đã mã hóa.

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
- Notification API giới hạn body/số sự kiện, kiểm tra origin, push endpoint HTTPS và định dạng subscription. Endpoint delivery xác minh chữ ký QStash trên **raw body trước khi giải mã**.
- Subscription, sự kiện và trạng thái chain được mã hóa AES-256-GCM bằng `NOTIFICATION_PAYLOAD_KEY` trước khi gửi QStash; backend không có database và không log payload/subscription/event.
- **QLĐT chỉ hỗ trợ HTTP.** HTTPS bảo vệ browser → app, nhưng chặng app server → `qldt.actvn.edu.vn` vẫn không được mã hóa. Chỉ nhập credentials trên deployment do bạn tin cậy và kiểm soát.
- Hồ sơ phiên gồm mã người dùng, nguồn dữ liệu và lịch đã chỉnh sửa được lưu trong `localStorage`; **không có mật khẩu hoặc cookie QLĐT**. Refresh sẽ khôi phục lịch, còn nút đăng xuất sẽ xóa toàn bộ phiên đã lưu.

## Chạy local

Yêu cầu Node.js 20+ và npm:

```bash
npm install
npm run dev
```

`npm run dev` chạy Express (`http://localhost:3000`) và Vite (thường là `http://localhost:5173`). Vite proxy `/api` tới Express.

Biến môi trường cơ bản (xem `.env.example`):

- `PORT`: cổng Express, mặc định `3000`.
- `QLDT_TIMEOUT_MS`: timeout cho mỗi request upstream, mặc định `12000` ms.
- `QLDT_MAX_BODY_BYTES`: response upstream tối đa, mặc định `8388608` byte.

Không đưa username/password QLĐT vào biến môi trường. Nếu các biến Web Push chưa đủ hoặc sai định dạng, ứng dụng lịch vẫn chạy nhưng UI thông báo hiển thị “máy chủ chưa cấu hình” và notification API trả `503 CONFIG_NOT_READY`.

## Thiết lập Web Push + Upstash QStash

Checklist production:

1. Tạo QStash trong [Upstash Console](https://console.upstash.com/qstash), lấy token cùng **Current Signing Key** và **Next Signing Key**.
2. Sinh một cặp VAPID trên máy cá nhân bằng `npx web-push generate-vapid-keys`. Không commit, dán hoặc gửi private key qua chat/log; nhập trực tiếp vào vùng Environment Variables được che của Vercel.
3. Sinh khóa payload 32 byte base64 trên máy cá nhân, ví dụ `umask 077; node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" > notification-payload-key.txt`. Nhập file này vào vùng secret được che rồi xóa file tạm an toàn.
4. Trong Vercel Project → Settings → Environment Variables, thêm cho Production/Preview phù hợp:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` dạng `mailto:admin@example.com`
   - `NOTIFICATION_PAYLOAD_KEY` là đúng 32 byte base64
   - `APP_ORIGIN` là origin public chính xác, ví dụ `https://planner.example.com` (không có path)
5. Deploy lại, kiểm tra `GET /api/notifications/config` chỉ trả `available` và **public** VAPID key, sau đó bật thông báo bằng click trong **Cài đặt**. Không có luồng nào tự động hỏi Notification permission.
6. Thêm/sửa/xóa một sự kiện hoặc đổi mốc 15/30/45/60 phút và xác nhận trạng thái “Đã lên lịch … lời nhắc”. Tắt thông báo hoặc logout sẽ hủy chain best-effort và unsubscribe.

QStash Free hiện có giới hạn **1.000 message/ngày, payload 1 MB và delay tối đa 7 ngày** (hãy kiểm tra lại trang pricing khi vận hành). Mỗi chain chỉ giữ một message đang chờ; nếu lời nhắc còn xa, delivery tự relay tối đa **6 ngày/lần**. Vì relay cũng dùng quota, một học kỳ dài tiêu tốn nhiều message hơn số lời nhắc. Payload mà QStash giữ luôn là envelope AES-256-GCM; dự án không dùng Vercel Cron hoặc database.

Local Web Push cần secure context (`localhost` được trình duyệt cho phép) và callback QStash truy cập được. Có thể dùng QStash local development hoặc một HTTPS tunnel an toàn; đặt `APP_ORIGIN` đúng origin mà browser và QStash cùng truy cập. Không commit `.env`.

## Test, build và audit

```bash
npm test
npm run build
npm audit --omit=dev
git diff --check
```

Test bao phủ parser HTML/workbook, import API, helper lịch âm, session/cài đặt, CRUD, tính thời gian Bangkok độc lập DST, reminder planning, AES-GCM, cấu hình thiếu, schedule QStash mock, delivery verify/decrypt/push mock và source service worker.

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

### Notification API

- `GET /api/notifications/config`: trả `{ available, publicKey }`; không bao giờ trả private key/token.
- `POST /api/notifications/schedule`: validation subscription/events, hủy chain cũ best-effort, mã hóa payload và publish message đầu tiên.
- `POST /api/notifications/cancel`: hủy QStash message ID và chain label trong giới hạn đầu vào.
- `POST /api/notifications/deliver`: chỉ nhận QStash đã ký; relay tối đa 6 ngày, gửi Web Push đến hạn rồi lên lịch reminder tiếp theo.

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

`vercel.json` cấu hình Vite build, thư mục `dist` và Functions `api/**/*.js` (tối đa 60 giây, trong khi QStash delivery đặt timeout 30 giây). Sau khi deploy, kiểm tra `GET /api/health` và `GET /api/notifications/config`, rồi thử import một fixture không nhạy cảm trước khi dùng tài khoản thật.

Một lần tải QLĐT thực hiện nhiều request HTTP tuần tự. Upstream có thể chậm, đổi form hoặc tạm ngừng; handler timeout và trả lỗi ổn định thay vì treo vô hạn.

## Luồng và cấu trúc chính

1. `server/qldt.js` tạo cookie jar, đọc hidden fields Web Forms, đăng nhập và tải export.
2. `server/parser.js` và `server/workbookParser.js` đọc HTML/workbook, chuẩn hóa và loại trùng sự kiện.
3. `server/apiHandlers.js` cung cấp handler dùng chung cho Express và Vercel, gồm validation/headers/giới hạn body.
4. `api/login/schedule.js` và `api/import/schedule.js` là Vercel Functions tương ứng.
5. `server/notifications.js` tính reminder theo UTC+7 và mã hóa AES-GCM; `server/notificationHandlers.js` cung cấp shared handlers cho Express/Vercel.
6. `src/useScheduleNotifications.js` quản lý permission/subscription/reschedule; `public/sw.js` nhận `push` và xử lý click an toàn về ngày liên quan.
7. `src/calendarUtils.js` bọc `lunar-javascript` (MIT); `src/scheduleUtils.js` chứa CRUD thuần; `src/settingsUtils.js` quản lý theme/lịch âm.

## Giới hạn trình duyệt và vận hành

- Web Push cần HTTPS (trừ `localhost`) và phụ thuộc push service của browser/OS; browser có thể trì hoãn hoặc gom notification để tiết kiệm pin.
- **iOS/iPadOS chỉ hỗ trợ Web Push cho web app đã được Add to Home Screen/cài như PWA**, không phải tab Safari thông thường.
- Permission bị chặn phải được người dùng mở lại trong cài đặt site/OS; ứng dụng không thể tự làm việc này.
- QStash/Web Push là at-least-once. Notification dùng `tag` ổn định để browser thay thế bản trùng khi một delivery phải retry; không thể bảo đảm exactly-once hoàn toàn nếu không có persistent database.
- Khi relay đã thay message ID, client không thể biết ID mới lúc đang đóng; chain ID ngẫu nhiên/label được giữ cục bộ cùng ID ban đầu để lần sửa/tắt tiếp theo vẫn hủy message đang pending best-effort.

## Hạn chế xác minh

Luồng parser/API được kiểm tra không cần credentials thật. Repository không có tài khoản QLĐT nên chưa thể xác minh end-to-end sau đăng nhập. Nếu upstream đổi cấu trúc, API trả lỗi ổn định thay vì trả dữ liệu đoán. Parser Excel giữ giảng viên khi export có cột/nhãn nhận diện được; các biến thể bố cục chưa có fixture có thể cần bổ sung alias.
