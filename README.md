# Campus Planner Demo

Frontend lịch học viết mới bằng React + Vite, lấy cảm hứng ở mức **luồng sử dụng** từ một ứng dụng lịch học công khai. Dự án không dùng tên, logo, hình ảnh hay mã nguồn của đơn vị gốc. Toàn bộ giao diện, nội dung, dữ liệu mẫu và biểu tượng được dựng độc lập.

## Tính năng

- Đăng nhập demo, không cần backend; phiên đăng nhập chỉ lưu trong `localStorage`.
- Lịch tháng và lịch tuần, chuyển kỳ, quay về hôm nay, chọn ngày để xem chi tiết.
- Dữ liệu môn học mẫu tự tạo theo tháng đang xem.
- Responsive cho desktop/mobile, menu trượt trên màn hình nhỏ.
- PWA cơ bản: manifest, icon SVG và service worker cache-first fallback (đăng ký ở production).

## Chạy dự án

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Mở URL Vite in ra, thường là `http://localhost:5173`.

### Tài khoản demo

- Mã sinh viên: `DEMO2026`
- Mật khẩu: `demo`

Trong bản demo, mọi cặp tài khoản/mật khẩu không rỗng đều được chấp nhận để thuận tiện trình diễn.

## Build production

```bash
npm run build
npm run preview
```

Bundle được xuất vào `dist/`. Service worker chỉ được đăng ký khi chạy bản production.

## Ghi chú khảo sát

Trang tham chiếu công khai dùng một SPA React/Create React App với route đăng nhập và route lịch được bảo vệ bằng trạng thái phía trình duyệt. Source map công khai liệt kê các phần như `Login`, `Home`, `CalendarHeader`, `Month`/`Day`, `ShowToolTip`, `SmallCalendar` và `PrivateRoute`. Qua đó có thể nhận diện hai cách trình bày: lưới tháng trên desktop và lịch tháng rút gọn kèm danh sách bài học trên mobile; có điều hướng tháng, nút về hiện tại và thông tin môn/thời gian/địa điểm. Stylesheet dùng utility CSS và nhiều màu để phân biệt sự kiện; manifest và service worker cũng được công bố.

Ứng dụng tham chiếu có gọi `https://api-crawl-tkb.vercel.app`; bản dựng này **không kết nối API đó hoặc bất kỳ backend nào**, và không gửi thông tin đăng nhập ra khỏi trình duyệt. Toàn bộ lịch học là dữ liệu demo/local.

Bản dựng này chỉ kế thừa các mẫu UX phổ biến nói trên. Mã và giao diện được viết lại độc lập; kiến trúc được đơn giản hoá thành state React cục bộ, không dùng Redux/router/dayjs, đồng thời áp dụng một hệ thống thiết kế mới (sidebar tối, typography editorial, panel chi tiết ngày) và responsive riêng cho mobile.

## File chính

- `src/App.jsx`: login demo, dữ liệu mẫu, lịch tháng/tuần và chi tiết ngày.
- `src/styles.css`: toàn bộ design system và responsive layout.
- `src/main.jsx`: entry React và đăng ký service worker production.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`: lớp PWA.
- `vite.config.js`: cấu hình Vite tối giản.
