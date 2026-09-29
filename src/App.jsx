import { useMemo, useState } from 'react'

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTH_NAMES = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

const pad = (value) => String(value).padStart(2, '0')
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const sameDay = (a, b) => dateKey(a) === dateKey(b)
const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7))

const Icon = ({ name, size = 20 }) => {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Login({ onLogin }) {
  const [studentId, setStudentId] = useState('DEMO2026')
  const [password, setPassword] = useState('demo')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (!studentId.trim() || !password.trim()) {
      setError('Vui lòng nhập đủ tài khoản và mật khẩu.')
      return
    }
    onLogin(studentId.trim().toUpperCase())
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Giới thiệu">
        <div className="brand brand-light"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span></div>
        <div className="story-copy">
          <p className="eyebrow">LỊCH HỌC, GỌN GÀNG HƠN</p>
          <h1>Một tuần rõ ràng.<br/>Một ngày chủ động.</h1>
          <p>Theo dõi môn học, phòng học và thời gian trong một không gian tập trung.</p>
          <div className="mini-calendar" aria-hidden="true">
            <span className="mini-label">TUẦN NÀY</span>
            {[12, 13, 14, 15, 16].map((day, index) => <span className={index === 2 ? 'active' : ''} key={day}>{day}</span>)}
          </div>
        </div>
        <p className="story-note">Bản dựng độc lập · Dữ liệu minh hoạ</p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="brand brand-dark mobile-brand"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span></div>
          <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
          <h2>Đăng nhập</h2>
          <p className="muted">Dùng thông tin điền sẵn để khám phá chế độ demo.</p>
          <form onSubmit={submit}>
            <label htmlFor="student-id">Mã sinh viên</label>
            <input id="student-id" autoComplete="username" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Ví dụ: DEMO2026" />
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit">Vào lịch học <Icon name="arrow" /></button>
          </form>
          <div className="demo-hint"><span>Demo</span><p><strong>Tài khoản:</strong> DEMO2026 &nbsp;·&nbsp; <strong>Mật khẩu:</strong> demo</p></div>
          <p className="privacy-note">Thông tin chỉ được lưu trên thiết bị này.</p>
        </div>
      </section>
    </main>
  )
}

function createSampleEvents(anchor) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const day = (n) => dateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), n))
  return [
    { id: 1, date: day(3), title: 'Cấu trúc dữ liệu', code: 'CS204', time: '07:30 – 09:20', room: 'A-302', teacher: 'GV. Minh Anh', color: 'violet' },
    { id: 2, date: day(3), title: 'Tiếng Anh chuyên ngành', code: 'EN310', time: '13:00 – 14:50', room: 'B-205', teacher: 'GV. Thu Hà', color: 'amber' },
    { id: 3, date: day(7), title: 'Mạng máy tính', code: 'NT220', time: '09:30 – 11:20', room: 'Lab 4', teacher: 'GV. Hải Nam', color: 'cyan' },
    { id: 4, date: day(12), title: 'An toàn hệ thống', code: 'SE301', time: '07:30 – 10:20', room: 'A-405', teacher: 'GV. Đức Long', color: 'green' },
    { id: 5, date: day(15), title: 'Cơ sở dữ liệu', code: 'DB201', time: '13:00 – 15:50', room: 'B-101', teacher: 'GV. Mai Lan', color: 'rose' },
    { id: 6, date: day(19), title: 'Phát triển Web', code: 'WEB302', time: '07:30 – 10:20', room: 'Lab 2', teacher: 'GV. Quang Huy', color: 'blue' },
    { id: 7, date: day(23), title: 'Trí tuệ nhân tạo', code: 'AI401', time: '09:30 – 11:20', room: 'A-201', teacher: 'GV. Hoàng Linh', color: 'violet' },
    { id: 8, date: day(27), title: 'Seminar học kỳ', code: 'SEM01', time: '14:00 – 16:00', room: 'Hội trường', teacher: 'Khoa CNTT', color: 'amber' },
  ]
}

function MonthView({ cursor, events, selected, onSelect }) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (start.getDay() + 6) % 7
  const gridStart = addDays(start, -offset)
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  return (
    <div className="calendar-wrap">
      <div className="weekday-row">{DAY_NAMES.map((day) => <div key={day}>{day}</div>)}</div>
      <div className="month-grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => event.date === dateKey(day))
          const outside = day.getMonth() !== cursor.getMonth()
          return (
            <button className={`day-cell ${outside ? 'outside' : ''} ${sameDay(day, selected) ? 'selected' : ''}`} key={dateKey(day)} onClick={() => onSelect(day)}>
              <span className={`day-number ${sameDay(day, new Date()) ? 'today' : ''}`}>{day.getDate()}</span>
              <span className="events-stack">
                {dayEvents.slice(0, 2).map((event) => <span className={`event-pill ${event.color}`} key={event.id}><i />{event.time.split(' ')[0]} {event.title}</span>)}
                {dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2} lịch khác</span>}
              </span>
              {dayEvents.length > 0 && <span className="mobile-dots">{dayEvents.map((event) => <i className={event.color} key={event.id} />)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ cursor, events, selected, onSelect }) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
  return (
    <div className="week-view">
      {days.map((day) => {
        const dayEvents = events.filter((event) => event.date === dateKey(day))
        return <button className={`week-day ${sameDay(day, selected) ? 'selected' : ''}`} key={dateKey(day)} onClick={() => onSelect(day)}>
          <header><span>{DAY_NAMES[(day.getDay() + 6) % 7]}</span><strong className={sameDay(day, new Date()) ? 'today' : ''}>{day.getDate()}</strong></header>
          <div className="week-events">{dayEvents.length ? dayEvents.map((event) => <span className={`week-event ${event.color}`} key={event.id}><b>{event.time.split(' ')[0]}</b>{event.title}<small>{event.room}</small></span>) : <span className="empty-slot">Trống</span>}</div>
        </button>
      })}
    </div>
  )
}

function EventDetails({ selected, events }) {
  const dayEvents = events.filter((event) => event.date === dateKey(selected))
  const formatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })
  return <aside className="details-panel">
    <div className="details-heading"><div><p className="eyebrow">LỊCH TRONG NGÀY</p><h3>{formatter.format(selected)}</h3></div><span className="count-badge">{dayEvents.length}</span></div>
    <div className="details-list">
      {dayEvents.length ? dayEvents.map((event) => <article className="lesson-card" key={event.id}>
        <span className={`lesson-accent ${event.color}`} />
        <div><span className="subject-code">{event.code}</span><h4>{event.title}</h4><p><Icon name="clock" size={16}/>{event.time}</p><p><Icon name="pin" size={16}/>{event.room} · {event.teacher}</p></div>
      </article>) : <div className="empty-state"><span><Icon name="book" size={24}/></span><h4>Không có lịch học</h4><p>Một khoảng trống để nghỉ ngơi hoặc tự học.</p></div>}
    </div>
  </aside>
}

function Schedule({ user, onLogout }) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [view, setView] = useState('month')
  const [menuOpen, setMenuOpen] = useState(false)
  const events = useMemo(() => createSampleEvents(cursor), [cursor])

  const move = (direction) => {
    if (view === 'month') setCursor((value) => new Date(value.getFullYear(), value.getMonth() + direction, 1))
    else setCursor((value) => addDays(value, direction * 7))
  }
  const goToday = () => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today) }
  const weekEnd = addDays(startOfWeek(cursor), 6)
  const periodLabel = view === 'month' ? `${MONTH_NAMES[cursor.getMonth()]} / ${cursor.getFullYear()}` : `${pad(startOfWeek(cursor).getDate())}/${pad(startOfWeek(cursor).getMonth()+1)} – ${pad(weekEnd.getDate())}/${pad(weekEnd.getMonth()+1)}`

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand brand-light"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span><button className="mobile-close" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <nav><button className="nav-item active"><Icon name="calendar"/>Lịch học</button><button className="nav-item"><Icon name="grid"/>Tổng quan<span className="soon">Sắp có</span></button></nav>
      <div className="sidebar-tip"><p>Gợi ý</p><strong>Chạm vào một ngày</strong><span>để xem chi tiết các môn học.</span></div>
      <button className="profile" onClick={onLogout}><span className="avatar">{user.slice(0, 2)}</span><span><strong>{user}</strong><small>Chế độ demo</small></span><Icon name="logout"/></button>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main className="workspace">
      <header className="topbar">
        <button className="menu-button" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button>
        <div><p className="eyebrow">THỜI KHOÁ BIỂU</p><h1>Lịch học của bạn</h1></div>
        <button className="logout-mobile" onClick={onLogout} aria-label="Đăng xuất"><Icon name="logout"/></button>
      </header>
      <section className="toolbar">
        <div className="period-nav"><button className="today-button" onClick={goToday}>Hôm nay</button><button aria-label="Kỳ trước" onClick={() => move(-1)}><Icon name="chevronLeft"/></button><button aria-label="Kỳ sau" onClick={() => move(1)}><Icon name="chevronRight"/></button><h2>{periodLabel}</h2></div>
        <div className="view-toggle" aria-label="Kiểu hiển thị"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Tháng</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Tuần</button></div>
      </section>
      <div className="schedule-layout">
        <section className="calendar-panel">{view === 'month' ? <MonthView cursor={cursor} events={events} selected={selected} onSelect={setSelected}/> : <WeekView cursor={cursor} events={events} selected={selected} onSelect={setSelected}/>}</section>
        <EventDetails selected={selected} events={events}/>
      </div>
    </main>
  </div>
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('campus-demo-user') || '')
  const login = (id) => { localStorage.setItem('campus-demo-user', id); setUser(id) }
  const logout = () => { localStorage.removeItem('campus-demo-user'); setUser('') }
  return user ? <Schedule user={user} onLogout={logout}/> : <Login onLogin={login}/>
}
