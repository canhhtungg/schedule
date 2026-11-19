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

const AI_CHAT_STORAGE_KEY = 'campus-planner.ai-chat.v1'

function readStoredAiMessages(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(AI_CHAT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-16) : []
  } catch {
    return []
  }
}

function writeStoredAiMessages(messages, storage = globalThis.sessionStorage) {
  try {
    if (!messages?.length) storage?.removeItem(AI_CHAT_STORAGE_KEY)
    else storage?.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-16)))
  } catch {
    // ignore unavailable sessionStorage
  }
}

function enrichProposedEvents(rawEvents, existingEvents, action = 'add') {
  return (rawEvents || []).map((item, idx) => {
    const time = item.startTime ? (item.endTime && item.endTime > item.startTime ? `${item.startTime} – ${item.endTime}` : item.startTime) : (item.time || '')
    const draft = {
      ...item,
      id: item.id || `plan-item-${Date.now()}-${idx}`,
      selected: item.selected !== undefined ? item.selected : true,
      time,
    }
    if (action === 'delete') {
      return {
        ...draft,
        conflicts: [],
      }
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
  action = 'add',
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

  const isDeleteAction = action === 'delete'
  const isUpdateAction = action === 'update'
  const selectedItems = items.filter((item) => item.selected)
  const conflictCount = isDeleteAction ? 0 : selectedItems.filter((item) => item.conflicts?.length > 0).length
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
    <div className={`ai-plan-card ${committedCount ? 'committed' : ''} ${isDeleteAction ? 'delete-mode' : ''}`}>
      <div className="ai-plan-header">
        <div>
          <span className="ai-plan-badge">
            <Icon name={isDeleteAction ? 'trash' : (isUpdateAction ? 'edit' : 'sparkles')} size={13} />
            {committedCount
              ? (isDeleteAction ? 'ĐÃ XÓA KHỎI LỊCH & HỦY THÔNG BÁO' : (isUpdateAction ? 'ĐÃ CẬP NHẬT LỊCH HỌC' : 'ĐÃ CHỐT VÀO LỊCH'))
              : (isDeleteAction ? 'DANH SÁCH LỊCH CẦN XÓA' : (isUpdateAction ? 'DANH SÁCH LỊCH CẬP NHẬT' : 'KẾ HOẠCH ĐỀ XUẤT'))}
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

      {items.length > 0 && (
        <div className="ai-plan-list">
          {items.map((item) => {
            const isEditing = editingId === item.id
            const hasConflict = !isDeleteAction && item.conflicts?.length > 0

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
                    {!isDeleteAction && (
                      <button
                        type="button"
                        aria-label={`Sửa ${item.title}`}
                        title="Sửa nhanh"
                        onClick={() => startEdit(item)}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Bỏ ${item.title} khỏi danh sách`}
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
      )}

      <div className="ai-plan-footer">
        {committedCount ? (
          <div className="ai-commit-success">
            <div className="ai-commit-summary">
              <span>
                {isDeleteAction
                  ? <>Đã xóa thành công <strong>{committedCount}</strong> sự kiện khỏi lịch học và cập nhật hủy lịch thông báo!</>
                  : isUpdateAction
                    ? <>Đã cập nhật thành công <strong>{committedCount}</strong> sự kiện trong lịch học và đồng bộ thông báo!</>
                    : <>Đã thêm thành công <strong>{committedCount}</strong> sự kiện vào lịch học của bạn!</>}
              </span>
              {!isDeleteAction && (
                <div className="ai-committed-dates">
                  {[...new Set(items.filter((i) => i.selected).map((i) => i.date))].sort().map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="ai-date-jump-chip"
                      onClick={() => onOpenCalendarDate(d)}
                    >
                      <Icon name="calendar" size={13} />
                      {formatDisplayDate(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              {isDeleteAction
                ? 'Kiểm tra các lịch cần xóa ở trên rồi bấm xác nhận để xóa khỏi lịch và hủy thông báo.'
                : 'Bạn có thể sửa trực tiếp ở trên hoặc nhắn thêm bên dưới để AI điều chỉnh lại kế hoạch.'}
            </span>
            <button
              type="button"
              className={`ai-commit-button ${isDeleteAction ? 'danger' : ''}`}
              disabled={selectedItems.length === 0}
              onClick={() => onCommit(messageId, selectedItems, action)}
            >
              <Icon name={isDeleteAction ? 'trash' : 'check'} size={16} />
              {isDeleteAction
                ? `Xác nhận xóa ${selectedItems.length} lịch & hủy thông báo`
                : isUpdateAction
                  ? `Xác nhận cập nhật ${selectedItems.length} lịch`
                  : `Chốt & Thêm ${selectedItems.length} lịch vào thời khóa biểu`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function AiSchedulePanel({ events, onCommitEvents, onUpdateEvents, onDeleteEvents, onOpenCalendarDate, Icon }) {
  const [serverStatus, setServerStatus] = useState({ loading: true, available: true, model: '', message: '' })
  const [messages, setMessages] = useState(() => readStoredAiMessages())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    writeStoredAiMessages(messages)
  }, [messages])

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
          planItems: enrichProposedEvents(msg.planItems, events, msg.action),
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
      const recentSlice = nextHistory.slice(-8)
      let lastAssistantWithPlanIndex = -1
      for (let i = recentSlice.length - 1; i >= 0; i -= 1) {
        if (recentSlice[i].role === 'assistant' && recentSlice[i].planItems?.length) {
          lastAssistantWithPlanIndex = i
          break
        }
      }

      const apiMessages = recentSlice.map((msg, idx) => {
        if (idx === lastAssistantWithPlanIndex) {
          const summaryJson = JSON.stringify({
            action: msg.action || 'add',
            reply: msg.content,
            planTitle: msg.planTitle,
            events: msg.planItems.map(({ id, date, startTime, endTime, title, code, room, teacher, color }) => ({
              id, date, startTime, endTime, title, code, room, teacher, color,
            })),
          })
          return { role: 'assistant', content: summaryJson.slice(0, 1800) }
        }
        return { role: msg.role, content: msg.content.slice(0, 600) }
      })

      const now = new Date()
      const referenceTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          messages: apiMessages,
          referenceDate: dateKey(now),
          referenceTime,
          existingEvents: events.slice(0, 200).map(({ id, date, title, time, room, code, color }) => ({ id, date, title, time, room, code, color })),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || 'Không thể phân tích lịch học với AI lúc này.')
      }

      const action = payload.action === 'delete' ? 'delete' : (payload.action === 'update' ? 'update' : 'add')
      const planItems = enrichProposedEvents(payload.events || [], events, action)
      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        action,
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
    writeStoredAiMessages([])
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
          planItems: enrichProposedEvents(updatedList, events, msg.action),
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

  const commitPlan = (messageId, selectedItems, action = 'add') => {
    if (!selectedItems.length) return
    const sortedDates = selectedItems.map((i) => i.date).sort()
    if (action === 'delete') {
      onDeleteEvents?.(selectedItems)
      const removedIds = new Set(selectedItems.map((i) => i.id))
      setMessages((current) =>
        current.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                planItems: msg.planItems.filter((item) => !removedIds.has(item.id)),
                committedCount: selectedItems.length,
                firstCommittedDate: sortedDates[0],
              }
            : msg
        )
      )
      return
    }
    if (action === 'update') {
      onUpdateEvents?.(selectedItems)
      setMessages((current) =>
        current.map((msg) =>
          msg.id === messageId
            ? { ...msg, committedCount: selectedItems.length, firstCommittedDate: sortedDates[0] }
            : msg
        )
      )
      return
    }
    onCommitEvents(selectedItems)
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
              Nhập lịch trình bạn muốn thêm, chỉnh sửa hoặc xóa bên dưới. AI sẽ tự động phân tích, đối chiếu với lịch hiện có để tạo danh sách sự kiện hoặc chọn đúng các lịch cần sửa/xóa cho bạn.
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
                  {msg.role === 'assistant' && (msg.planItems?.length > 0 || msg.committedCount > 0) && (
                    <PlanCard
                      messageId={msg.id}
                      action={msg.action || 'add'}
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
          placeholder="Nhập lịch trình muốn thêm, sửa hoặc yêu cầu xóa lịch…"
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
