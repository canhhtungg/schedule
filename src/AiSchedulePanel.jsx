import { useEffect, useRef, useState } from 'react'
import { dateKey, parseDateKey } from './calendarUtils.js'
import { findEventConflicts } from './scheduleUtils.js'
import { formatTimeRange } from './timeUtils.js'

const WEEKDAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const COLOR_OPTIONS = [
  { value: 'violet', label: 'Tím' },
  { value: 'amber', label: 'Vàng cam' },
  { value: 'cyan', label: 'Xanh ngọc' },
  { value: 'green', label: 'Xanh lá' },
  { value: 'rose', label: 'Hồng' },
  { value: 'blue', label: 'Xanh dương' },
]

function formatDisplayDate(dateStr) {
  const parsed = parseDateKey(dateStr)
  if (!parsed) return dateStr
  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const weekday = WEEKDAY_NAMES[parsed.getDay()]
  return `${weekday}, ${day}/${month}/${parsed.getFullYear()}`
}

function enrichProposedEvents(rawEvents, existingEvents) {
  return (rawEvents || []).map((item, idx) => {
    const time = item.startTime ? (item.endTime && item.endTime > item.startTime ? `${item.startTime} – ${item.endTime}` : item.startTime) : (item.time || '')
    const draft = {
      ...item,
      id: item.id || `plan-item-${Date.now()}-${idx}`,
      selected: item.selected !== undefined ? item.selected : true,
      time,
    }
    const conflicts = findEventConflicts(existingEvents, draft)
    return {
      ...draft,
      conflicts: conflicts.map((c) => ({ id: c.id, title: c.title, time: c.time || '' })),
    }
  })
}

function PlanCard({
  messageId,
  planTitle,
  items,
  committedCount,
  firstDate,
  onToggleItem,
  onToggleAll,
  onUpdateItem,
  onDeleteItem,
  onCommit,
  onOpenCalendarDate,
  Icon,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [editError, setEditError] = useState('')

  const selectedItems = items.filter((item) => item.selected)
  const conflictCount = selectedItems.filter((item) => item.conflicts?.length > 0).length
  const allSelected = items.length > 0 && selectedItems.length === items.length

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditError('')
    setEditDraft({
      date: item.date || '',
      title: item.title || '',
      code: item.code || '',
      startTime: item.startTime || '',
      endTime: item.endTime || '',
      room: item.room || '',
      teacher: item.teacher || '',
      color: item.color || 'violet',
    })
  }

  const saveInlineEdit = (itemId) => {
    setEditError('')
    if (!parseDateKey(editDraft.date)) {
      setEditError('Ngày không hợp lệ.')
      return
    }
    if (!editDraft.title.trim()) {
      setEditError('Tên sự kiện không được để trống.')
      return
    }
    let formattedTime = ''
    try {
      formattedTime = formatTimeRange(editDraft.startTime, editDraft.endTime)
    } catch (err) {
      setEditError(err.message)
      return
    }

    onUpdateItem(messageId, itemId, {
      ...editDraft,
      title: editDraft.title.trim(),
      code: editDraft.code.trim(),
      room: editDraft.room.trim(),
      teacher: editDraft.teacher.trim(),
      time: formattedTime,
    })
    setEditingId(null)
    setEditDraft(null)
  }

  return (
    <div className={`ai-plan-card ${committedCount ? 'committed' : ''}`}>
      <div className="ai-plan-header">
        <div>
          <span className="ai-plan-badge">
            <Icon name="sparkles" size={13} />
            {committedCount ? 'ĐÃ CHỐT VÀO LỊCH' : 'KẾ HOẠCH ĐỀ XUẤT'}
          </span>
          <h4>{planTitle || `Danh sách ${items.length} lịch trình`}</h4>
        </div>
        {!committedCount && items.length > 0 && (
          <div className="ai-plan-bulk">
            <label className="ai-checkbox-label">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(messageId, e.target.checked)}
              />
              <span>Chọn tất cả ({selectedItems.length}/{items.length})</span>
            </label>
          </div>
        )}
      </div>

      {conflictCount > 0 && !committedCount && (
        <div className="ai-conflict-banner" role="status">
          <span>Có <strong>{conflictCount}</strong> lịch đang chọn trùng khung giờ với lịch hiện có của bạn. Bạn có thể sửa giờ, bỏ chọn hoặc yêu cầu AI đổi giờ khác.</span>
        </div>
      )}

      <div className="ai-plan-list">
        {items.map((item) => {
          const isEditing = editingId === item.id
          const hasConflict = item.conflicts?.length > 0

          if (isEditing && editDraft) {
            return (
              <div className="ai-plan-item editing" key={item.id}>
                <div className="ai-inline-grid">
                  <label>
                    Ngày *
                    <input
                      type="date"
                      value={editDraft.date}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </label>
                  <label>
                    Tên sự kiện *
                    <input
                      type="text"
                      value={editDraft.title}
                      maxLength="200"
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </label>
                  <label>
                    Bắt đầu
                    <input
                      type="time"
                      step="60"
                      value={editDraft.startTime}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, startTime: e.target.value }))}
                    />
                  </label>
                  <label>
                    Kết thúc
                    <input
                      type="time"
                      step="60"
                      value={editDraft.endTime}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                    />
                  </label>
                  <label>
                    Nhãn / Mã
                    <input
                      type="text"
                      value={editDraft.code}
                      maxLength="50"
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, code: e.target.value }))}
                    />
                  </label>
                  <label>
                    Phòng / Địa điểm
                    <input
                      type="text"
                      value={editDraft.room}
                      maxLength="100"
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, room: e.target.value }))}
                    />
                  </label>
                  <label>
                    Ghi chú
                    <input
                      type="text"
                      value={editDraft.teacher}
                      maxLength="150"
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, teacher: e.target.value }))}
                    />
                  </label>
                  <label>
                    Màu thẻ
                    <select
                      value={editDraft.color}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, color: e.target.value }))}
                    >
                      {COLOR_OPTIONS.map((opt) => (
                        <option value={opt.value} key={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {editError && <p className="form-error">{editError}</p>}
                <div className="ai-inline-actions">
                  <button type="button" className="ai-btn-secondary" onClick={() => setEditingId(null)}>Hủy</button>
                  <button type="button" className="ai-btn-primary" onClick={() => saveInlineEdit(item.id)}>Lưu mục này</button>
                </div>
              </div>
            )
          }

          return (
            <div className={`ai-plan-item ${!item.selected ? 'unselected' : ''} ${hasConflict ? 'has-conflict' : ''}`} key={item.id}>
              {!committedCount && (
                <input
                  type="checkbox"
                  className="ai-item-checkbox"
                  aria-label={`Chọn ${item.title} ngày ${item.date}`}
                  checked={item.selected}
                  onChange={(e) => onToggleItem(messageId, item.id, e.target.checked)}
                />
              )}
              <span className={`ai-item-color ${item.color || 'violet'}`} aria-hidden="true" />
              <div className="ai-item-main">
                <div className="ai-item-top">
                  <span className="ai-item-date">{formatDisplayDate(item.date)}</span>
                  {item.time && (
                    <span className="ai-item-time">
                      <Icon name="clock" size={13} />
                      {item.time}
                    </span>
                  )}
                  {item.code && <span className={`ai-item-tag ${item.color || 'violet'}`}>{item.code}</span>}
                </div>
                <strong className="ai-item-title">{item.title}</strong>
                {(item.room || item.teacher) && (
                  <div className="ai-item-meta">
                    {item.room && <span><Icon name="pin" size={12} />{item.room}</span>}
                    {item.teacher && <span><Icon name="user" size={12} />{item.teacher}</span>}
                  </div>
                )}
                {hasConflict && (
                  <p className="ai-item-conflict">
                    Trùng khung giờ với: {item.conflicts.map((c) => `${c.title}${c.time ? ` (${c.time})` : ''}`).join(', ')}
                  </p>
                )}
              </div>
              {!committedCount && (
                <div className="ai-item-actions">
                  <button
                    type="button"
                    aria-label={`Sửa ${item.title}`}
                    title="Sửa nhanh"
                    onClick={() => startEdit(item)}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa ${item.title} khỏi kế hoạch`}
                    title="Bỏ khỏi danh sách"
                    onClick={() => onDeleteItem(messageId, item.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="ai-plan-footer">
        {committedCount ? (
          <div className="ai-commit-success">
            <span>Đã thêm thành công <strong>{committedCount}</strong> sự kiện vào lịch học của bạn!</span>
            {firstDate && (
              <button
                type="button"
                className="ai-btn-primary"
                onClick={() => onOpenCalendarDate(firstDate)}
              >
                <Icon name="calendar" size={15} />
                Xem trên Lịch học
              </button>
            )}
          </div>
        ) : (
          <>
            <span className="ai-plan-hint">
              Bạn có thể sửa trực tiếp ở trên hoặc nhắn thêm bên dưới để AI điều chỉnh lại kế hoạch.
            </span>
            <button
              type="button"
              className="ai-commit-button"
              disabled={selectedItems.length === 0}
              onClick={() => onCommit(messageId, selectedItems)}
            >
              <Icon name="check" size={16} />
              Chốt & Thêm {selectedItems.length} lịch vào thời khóa biểu
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function AiSchedulePanel({ events, onCommitEvents, onOpenCalendarDate, Icon }) {
  const [serverStatus, setServerStatus] = useState({ loading: true, available: true, model: '', message: '' })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    let active = true
    fetch('/api/ai/config', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!active) return
        setServerStatus({
          loading: false,
          available: Boolean(res.ok && data?.available),
          model: data?.model || '',
          message: data?.message || '',
        })
      })
      .catch(() => {
        if (!active) return
        setServerStatus({ loading: false, available: false, model: '', message: 'Không thể kiểm tra cấu hình AI.' })
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.role !== 'assistant' || !msg.planItems?.length || msg.committedCount) return msg
        return {
          ...msg,
          planItems: enrichProposedEvents(msg.planItems, events),
        }
      })
    )
  }, [events])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  const sendPrompt = async (promptText) => {
    const trimmed = String(promptText ?? input).trim()
    if (!trimmed || sending) return

    setError('')
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }

    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    if (promptText === undefined) setInput('')
    setSending(true)

    try {
      const apiMessages = nextHistory.slice(-10).map((msg) => {
        if (msg.role === 'assistant' && msg.planItems?.length) {
          const summaryJson = JSON.stringify({
            reply: msg.content,
            planTitle: msg.planTitle,
            events: msg.planItems.map(({ date, startTime, endTime, title, code, room, teacher, color }) => ({
              date, startTime, endTime, title, code, room, teacher, color,
            })),
          })
          return { role: 'assistant', content: summaryJson.slice(0, 1950) }
        }
        return { role: msg.role, content: msg.content.slice(0, 1950) }
      })

      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          messages: apiMessages,
          referenceDate: dateKey(new Date()),
          existingEvents: events.slice(0, 300).map(({ id, date, title, time }) => ({ id, date, title, time })),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || 'Không thể phân tích lịch học với AI lúc này.')
      }

      const planItems = enrichProposedEvents(payload.events || [], events)
      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: payload.reply || 'Mình đã phân tích yêu cầu của bạn.',
        planTitle: payload.planTitle || '',
        planItems,
        committedCount: 0,
      }
      setMessages((current) => [...current, assistantMessage])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    sendPrompt()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendPrompt()
    }
  }

  const resetChat = () => {
    setMessages([])
    setError('')
    setInput('')
    inputRef.current?.focus()
  }

  const toggleItem = (messageId, itemId, checked) => {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.id !== messageId) return msg
        return {
          ...msg,
          planItems: msg.planItems.map((item) => (item.id === itemId ? { ...item, selected: checked } : item)),
        }
      })
    )
  }

  const toggleAll = (messageId, checked) => {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.id !== messageId) return msg
        return {
          ...msg,
          planItems: msg.planItems.map((item) => ({ ...item, selected: checked })),
        }
      })
    )
  }

  const updateItem = (messageId, itemId, updatedFields) => {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.id !== messageId) return msg
        const updatedList = msg.planItems.map((item) => (item.id === itemId ? { ...item, ...updatedFields } : item))
        return {
          ...msg,
          planItems: enrichProposedEvents(updatedList, events),
        }
      })
    )
  }

  const deleteItem = (messageId, itemId) => {
    setMessages((current) =>
      current.map((msg) => {
        if (msg.id !== messageId) return msg
        return {
          ...msg,
          planItems: msg.planItems.filter((item) => item.id !== itemId),
        }
      })
    )
  }

  const commitPlan = (messageId, selectedItems) => {
    if (!selectedItems.length) return
    onCommitEvents(selectedItems)
    const sortedDates = selectedItems.map((i) => i.date).sort()
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId
          ? { ...msg, committedCount: selectedItems.length, firstCommittedDate: sortedDates[0] }
          : msg
      )
    )
  }

  return (
    <section className="ai-panel" aria-label="Thêm lịch với AI">
      <div className="ai-panel-toolbar">
        <div className="ai-status-pill">
          <span className={`ai-status-dot ${serverStatus.available ? 'online' : 'offline'}`} />
          <span>
            {serverStatus.loading
              ? 'Đang kết nối Groq AI…'
              : serverStatus.available
                ? `Groq AI sẵn sàng (${serverStatus.model})`
                : 'Chưa cấu hình GROQ_API_KEY trên server'}
          </span>
        </div>
        {messages.length > 0 && (
          <button type="button" className="ai-reset-button" onClick={resetChat}>
            Cuộc trò chuyện mới
          </button>
        )}
      </div>

      {!serverStatus.loading && !serverStatus.available && (
        <div className="ai-config-warning" role="alert">
          <strong>Máy chủ chưa cấu hình GROQ_API_KEY.</strong>
          <p>Hãy thêm biến môi trường <code>GROQ_API_KEY</code> vào file <code>.env</code> (khi chạy local) hoặc phần Environment Variables trên Vercel để bắt đầu tạo lịch thông minh với Groq.</p>
        </div>
      )}

      <div className="ai-chat-viewport">
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">
              <Icon name="sparkles" size={26} />
            </div>
            <h2>Trợ lý lập kế hoạch học tập AI</h2>
            <p>
              Nhập lịch trình bạn mong muốn bên dưới. AI sẽ tự động phân tích, đối chiếu với lịch hiện có để né trùng giờ và tạo danh sách sự kiện để bạn chốt.
            </p>
          </div>
        ) : (
          <div className="ai-messages-list">
            {messages.map((msg) => (
              <article key={msg.id} className={`ai-message ${msg.role}`}>
                <div className="ai-message-avatar" aria-hidden="true">
                  {msg.role === 'assistant' ? <Icon name="sparkles" size={16} /> : 'BẠN'}
                </div>
                <div className="ai-message-body">
                  <div className="ai-message-bubble">
                    <p>{msg.content}</p>
                  </div>
                  {msg.role === 'assistant' && msg.planItems?.length > 0 && (
                    <PlanCard
                      messageId={msg.id}
                      planTitle={msg.planTitle}
                      items={msg.planItems}
                      committedCount={msg.committedCount}
                      firstDate={msg.firstCommittedDate || msg.planItems[0]?.date}
                      onToggleItem={toggleItem}
                      onToggleAll={toggleAll}
                      onUpdateItem={updateItem}
                      onDeleteItem={deleteItem}
                      onCommit={commitPlan}
                      onOpenCalendarDate={onOpenCalendarDate}
                      Icon={Icon}
                    />
                  )}
                </div>
              </article>
            ))}

            {sending && (
              <article className="ai-message assistant loading" aria-live="polite">
                <div className="ai-message-avatar" aria-hidden="true">
                  <Icon name="sparkles" size={16} />
                </div>
                <div className="ai-message-body">
                  <div className="ai-message-bubble ai-typing">
                    <span className="ai-dots"><i /><i /><i /></span>
                    <span>AI đang phân tích lịch học hiện tại và lập kế hoạch cho bạn…</span>
                  </div>
                </div>
              </article>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="ai-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <form className="ai-composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          rows="2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập lịch trình mong muốn của bạn…"
          disabled={sending}
        />
        <button
          type="submit"
          className="ai-send-button"
          disabled={sending || !input.trim()}
          aria-label="Gửi yêu cầu cho AI"
        >
          <span>{sending ? 'Đang xử lý…' : 'Phân tích'}</span>
          <Icon name="send" size={16} />
        </button>
      </form>
    </section>
  )
}
