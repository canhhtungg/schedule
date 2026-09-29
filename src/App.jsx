import { useEffect, useRef, useState } from 'react'
import { addDays, dateKey, isLunarHighlight, lunarLabel, pad, parseDateKey, sameDay, shiftMonth, startOfWeek, vietnameseLunarDate } from './calendarUtils.js'
import { deleteEvent, saveEvent } from './scheduleUtils.js'

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTH_NAMES = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const EMPTY_DRAFT = { date: '', title: '', code: '', time: '', room: '', teacher: '' }

const Icon = ({ name, size = 20 }) => {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>, chevronRight: <path d="m9 18 6 6-6 6" transform="translate(0 -12)"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>, trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  return btoa(binary)
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('qldt')
  const [importType, setImportType] = useState('excel')
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [html, setHtml] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const chooseMode = (next) => { setMode(next); setError('') }
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (mode === 'qldt' && (!studentId.trim() || !password)) return setError('Vui lòng nhập đủ tài khoản và mật khẩu.')
    if (mode === 'import' && importType === 'html' && !html.trim()) return setError('Vui lòng dán HTML của trang thời khóa biểu.')
    if (mode === 'import' && importType === 'excel' && !file) return setError('Vui lòng chọn file Excel .xls hoặc .xlsx.')
    if (mode === 'import' && importType === 'excel' && file.size > 3 * 1024 * 1024) return setError('File Excel không được vượt quá 3 MB.')
    if (mode === 'import' && importType === 'html' && new TextEncoder().encode(html).byteLength > 1024 * 1024) return setError('Nội dung HTML không được vượt quá 1 MB.')

    setLoading(true)
    try {
      if (mode === 'qldt') await onLogin('/api/login/schedule', { username: studentId.trim(), password })
      else if (importType === 'html') await onLogin('/api/import/schedule', { sourceType: 'html', content: html })
      else {
        const contentBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
        await onLogin('/api/import/schedule', { sourceType: 'excel', contentBase64, filename: file.name })
      }
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setPassword('')
      setLoading(false)
    }
  }

  return <main className="login-page">
    <section className="login-story" aria-label="Giới thiệu">
      <div className="brand brand-light"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span></div>
      <div className="story-copy"><p className="eyebrow">LỊCH HỌC, GỌN GÀNG HƠN</p><h1>Một tuần rõ ràng.<br/>Một ngày chủ động.</h1><p>Theo dõi môn học, phòng học và thời gian trong một không gian tập trung.</p><div className="mini-calendar" aria-hidden="true"><span className="mini-label">TUẦN NÀY</span>{[12, 13, 14, 15, 16].map((day, index) => <span className={index === 2 ? 'active' : ''} key={day}>{day}</span>)}</div></div>
      <p className="story-note">Dữ liệu của bạn chỉ được xử lý trong ứng dụng</p>
    </section>
    <section className="login-panel"><div className="login-box">
      <div className="brand brand-dark mobile-brand"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span></div>
      <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p><h2>Mở lịch học</h2>
      <p className="muted">Đăng nhập QLĐT hoặc tự nhập file/HTML thời khóa biểu, không qua API bên thứ ba.</p>
      <form onSubmit={submit}>
        <div className="mode-toggle" aria-label="Nguồn dữ liệu"><button type="button" className={mode === 'qldt' ? 'active' : ''} onClick={() => chooseMode('qldt')}>Dùng tài khoản QLĐT</button><button type="button" className={mode === 'import' ? 'active' : ''} onClick={() => chooseMode('import')}>Dùng file/HTML</button></div>
        {mode === 'qldt' ? <>
          <label htmlFor="student-id">Mã sinh viên</label><input id="student-id" autoComplete="username" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Mã sinh viên QLĐT" disabled={loading} />
          <label htmlFor="password">Mật khẩu</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu QLĐT" disabled={loading} />
        </> : <>
          <fieldset className="import-choice"><legend>Chọn một nguồn</legend><label><input type="radio" name="import-type" checked={importType === 'excel'} onChange={() => setImportType('excel')} /> File Excel</label><label><input type="radio" name="import-type" checked={importType === 'html'} onChange={() => setImportType('html')} /> Dán HTML</label></fieldset>
          {importType === 'excel' ? <><label htmlFor="schedule-file">File thời khóa biểu (.xls, .xlsx)</label><input className="file-input" id="schedule-file" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={loading} /><p className="field-help">Tối đa 3 MB.</p></> : <><label htmlFor="schedule-html">HTML trang StudentTimeTable.aspx</label><textarea id="schedule-html" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Dán mã HTML tại đây…" rows="8" disabled={loading} /><p className="field-help">Tối đa 1 MB.</p></>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={loading}>{loading ? (mode === 'qldt' ? 'Đang tải từ QLĐT…' : 'Đang phân tích dữ liệu…') : 'Mở lịch học'} {!loading && <Icon name="arrow" />}</button>
      </form>
      <p className="privacy-note">Mật khẩu không được lưu ở trình duyệt, file hay cơ sở dữ liệu. File và HTML chỉ được gửi tới backend cùng origin để phân tích.</p>
    </div></section>
  </main>
}

function LunarStamp({ day }) {
  const lunar = vietnameseLunarDate(day)
  return <span className="lunar-date" title={`Âm lịch: ${lunar.day}/${lunar.month}/${lunar.year}`}>ÂL {lunarLabel(day)}</span>
}

function MonthView({ cursor, events, selected, onSelect }) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = addDays(start, -((start.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  return <div className="calendar-wrap"><div className="weekday-row">{DAY_NAMES.map((day) => <div key={day}>{day}</div>)}</div><div className="month-grid">
    {days.map((day) => {
      const dayEvents = events.filter((event) => event.date === dateKey(day))
      const lunar = vietnameseLunarDate(day)
      return <button aria-label={`${dateKey(day)}, âm lịch ${lunar.day}/${lunar.month}`} className={`day-cell ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${isLunarHighlight(day) ? 'lunar-highlight' : ''} ${sameDay(day, selected) ? 'selected' : ''}`} key={dateKey(day)} onClick={() => onSelect(day)}>
        <span className="date-heading"><span className={`day-number ${sameDay(day, new Date()) ? 'today' : ''}`}>{day.getDate()}</span><LunarStamp day={day}/></span>
        <span className="events-stack">{dayEvents.slice(0, 2).map((event) => <span className={`event-pill ${event.color}`} key={event.id}><i />{event.time ? `${event.time.split(' ')[0]} ` : ''}{event.title}</span>)}{dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2} lịch khác</span>}</span>
        {dayEvents.length > 0 && <span className="mobile-dots">{dayEvents.map((event) => <i className={event.color} key={event.id} />)}</span>}
      </button>
    })}
  </div></div>
}

function WeekView({ cursor, events, selected, onSelect }) {
  const start = startOfWeek(cursor)
  return <div className="week-view">{Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day) => {
    const dayEvents = events.filter((event) => event.date === dateKey(day))
    return <button className={`week-day ${isLunarHighlight(day) ? 'lunar-highlight' : ''} ${sameDay(day, selected) ? 'selected' : ''}`} key={dateKey(day)} onClick={() => onSelect(day)}>
      <header><span>{DAY_NAMES[(day.getDay() + 6) % 7]}</span><strong className={sameDay(day, new Date()) ? 'today' : ''}>{day.getDate()}</strong><LunarStamp day={day}/></header>
      <div className="week-events">{dayEvents.length ? dayEvents.map((event) => <span className={`week-event ${event.color}`} key={event.id}>{event.time && <b>{event.time.split(' ')[0]}</b>}{event.title}{event.room && <small>{event.room}</small>}</span>) : <span className="empty-slot">Trống</span>}</div>
    </button>
  })}</div>
}

function EventModal({ event, selected, onClose, onSave }) {
  const [draft, setDraft] = useState(event ? { ...EMPTY_DRAFT, ...event } : { ...EMPTY_DRAFT, date: dateKey(selected) })
  const [error, setError] = useState('')
  const titleRef = useRef(null)
  useEffect(() => {
    titleRef.current?.focus()
    const closeOnEscape = (keyEvent) => { if (keyEvent.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const update = (name) => (e) => setDraft((value) => ({ ...value, [name]: e.target.value }))
  const submit = (e) => { e.preventDefault(); try { onSave(draft, event?.id); onClose() } catch (saveError) { setError(saveError.message) } }
  return <div className="modal-backdrop"><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
    <div className="modal-heading"><div><p className="eyebrow">SỰ KIỆN TRONG NGÀY</p><h2 id="event-modal-title">{event ? 'Sửa sự kiện' : 'Thêm sự kiện'}</h2></div><button className="icon-button" type="button" aria-label="Đóng" onClick={onClose}><Icon name="close"/></button></div>
    <form onSubmit={submit}><div className="form-grid"><label>Ngày *<input type="date" value={draft.date} onChange={update('date')} required /></label><label>Tên sự kiện *<input ref={titleRef} value={draft.title} onChange={update('title')} maxLength="200" required /></label><label>Mã môn<input value={draft.code} onChange={update('code')} maxLength="50" /></label><label>Thời gian<input value={draft.time} onChange={update('time')} maxLength="100" placeholder="07:30 – 09:20" /></label><label>Phòng<input value={draft.room} onChange={update('room')} maxLength="100" /></label><label>Giảng viên<input value={draft.teacher} onChange={update('teacher')} maxLength="150" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>Hủy</button><button className="save-button" type="submit">{event ? 'Lưu thay đổi' : 'Thêm sự kiện'}</button></div></form>
  </section></div>
}

function EventDetails({ selected, events, onAdd, onEdit, onDelete }) {
  const dayEvents = events.filter((event) => event.date === dateKey(selected))
  const formatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })
  return <aside className="details-panel"><div className="details-heading"><div><p className="eyebrow">LỊCH TRONG NGÀY</p><h3>{formatter.format(selected)}</h3></div><div className="details-heading-actions"><span className="count-badge">{dayEvents.length}</span><button className="add-event" onClick={onAdd}><Icon name="plus" size={16}/>Thêm</button></div></div>
    <div className="details-list">{dayEvents.length ? dayEvents.map((event) => <article className="lesson-card" key={event.id}><span className={`lesson-accent ${event.color}`} /><div className="lesson-content">{event.code && <span className="subject-code">{event.code}</span>}<h4>{event.title}</h4>{event.time && <p><Icon name="clock" size={16}/>{event.time}</p>}{event.room && <p><Icon name="pin" size={16}/>{event.room}</p>}{event.teacher && <p><Icon name="user" size={16}/>{event.teacher}</p>}</div><div className="lesson-actions"><button aria-label={`Sửa ${event.title}`} onClick={() => onEdit(event)}><Icon name="edit" size={15}/></button><button aria-label={`Xóa ${event.title}`} onClick={() => onDelete(event)}><Icon name="trash" size={15}/></button></div></article>) : <div className="empty-state"><span><Icon name="book" size={24}/></span><h4>Không có lịch học</h4><p>Bạn có thể thêm một sự kiện cho ngày này.</p></div>}</div>
  </aside>
}

function Schedule({ user, events: initialEvents, mode, onLogout }) {
  const today = new Date()
  const [cursor, setCursor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [events, setEvents] = useState(initialEvents)
  const [view, setView] = useState('month')
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalEvent, setModalEvent] = useState(undefined)

  const selectDate = (date) => { setSelected(date); setCursor(date) }
  const move = (direction) => selectDate(view === 'month' ? shiftMonth(selected, direction) : addDays(selected, direction * 7))
  const goToday = () => selectDate(new Date())
  const save = (draft, editingId) => { setEvents((current) => saveEvent(current, draft, editingId)); const date = parseDateKey(draft.date); if (date) selectDate(date) }
  const remove = (event) => { if (window.confirm(`Xóa “${event.title}”?`)) setEvents((current) => deleteEvent(current, event.id)) }
  const weekEnd = addDays(startOfWeek(cursor), 6)
  const periodLabel = view === 'month' ? `${MONTH_NAMES[cursor.getMonth()]} / ${cursor.getFullYear()}` : `${pad(startOfWeek(cursor).getDate())}/${pad(startOfWeek(cursor).getMonth()+1)} – ${pad(weekEnd.getDate())}/${pad(weekEnd.getMonth()+1)}`

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}><div className="brand brand-light"><span className="brand-mark"><Icon name="calendar" /></span><span>Campus Planner</span><button className="mobile-close" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div><nav><button className="nav-item active"><Icon name="calendar"/>Lịch học</button><button className="nav-item"><Icon name="grid"/>Tổng quan<span className="soon">Sắp có</span></button></nav><button className="profile" onClick={onLogout}><span className="avatar">{user.slice(0, 2)}</span><span><strong>{user}</strong><small>{mode === 'qldt' ? 'Dữ liệu QLĐT' : 'Dữ liệu đã nhập'}</small></span><Icon name="logout"/></button></aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main className="workspace"><header className="topbar"><button className="menu-button" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><div><p className="eyebrow">THỜI KHOÁ BIỂU</p><h1>Lịch học của bạn</h1></div><button className="logout-mobile" onClick={onLogout} aria-label="Đăng xuất"><Icon name="logout"/></button></header>
      <section className="toolbar"><div className="period-nav"><button className="today-button" onClick={goToday}>Hôm nay</button><button aria-label="Kỳ trước" onClick={() => move(-1)}><Icon name="chevronLeft"/></button><button aria-label="Kỳ sau" onClick={() => move(1)}><Icon name="chevronRight"/></button><h2>{periodLabel}</h2></div><div className="view-toggle" aria-label="Kiểu hiển thị"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Tháng</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Tuần</button></div></section>
      <div className="schedule-layout"><section className="calendar-panel">{view === 'month' ? <MonthView cursor={cursor} events={events} selected={selected} onSelect={selectDate}/> : <WeekView cursor={cursor} events={events} selected={selected} onSelect={selectDate}/>}</section><EventDetails selected={selected} events={events} onAdd={() => setModalEvent(null)} onEdit={setModalEvent} onDelete={remove}/></div>
    </main>
    {modalEvent !== undefined && <EventModal event={modalEvent} selected={selected} onClose={() => setModalEvent(undefined)} onSave={save}/>}
  </div>
}

export default function App() {
  const [session, setSession] = useState(null)
  const login = async (endpoint, body) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify(body) })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.message || 'Không thể tải lịch học. Vui lòng thử lại.')
    setSession(payload)
  }
  return session ? <Schedule {...session} onLogout={() => setSession(null)}/> : <Login onLogin={login}/>
}
