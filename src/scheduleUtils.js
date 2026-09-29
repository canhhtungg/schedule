import { parseDateKey } from './calendarUtils.js'

const COLORS = ['violet', 'amber', 'cyan', 'green', 'rose', 'blue']
const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

export function normalizeEventDraft(draft, existing = null, index = 0) {
  const date = clean(draft?.date)
  const title = clean(draft?.title)
  if (!parseDateKey(date)) throw new TypeError('Ngày không hợp lệ.')
  if (!title) throw new TypeError('Tên sự kiện là bắt buộc.')

  return {
    id: existing?.id || globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${index}`,
    date,
    title,
    code: clean(draft.code),
    time: clean(draft.time),
    room: clean(draft.room),
    teacher: clean(draft.teacher),
    color: existing?.color || COLORS[index % COLORS.length],
  }
}

export function saveEvent(events, draft, editingId = null) {
  const existing = editingId ? events.find((event) => event.id === editingId) : null
  if (editingId && !existing) throw new TypeError('Không tìm thấy sự kiện cần sửa.')
  const normalized = normalizeEventDraft(draft, existing, events.length)
  const next = existing ? events.map((event) => event.id === editingId ? normalized : event) : [...events, normalized]
  return next.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title))
}

export function deleteEvent(events, id) {
  return events.filter((event) => event.id !== id)
}
