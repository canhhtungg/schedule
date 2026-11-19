import { parseDateKey } from './calendarUtils.js'
import { parseTimeRange } from './timeUtils.js'

const COLORS = ['violet', 'amber', 'cyan', 'green', 'rose', 'blue']
const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

function toMinutes(timeValue) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeValue || '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function eventIntervalMinutes(eventOrDraft) {
  const startRaw = eventOrDraft?.startTime || parseTimeRange(eventOrDraft?.time).startTime
  const endRaw = eventOrDraft?.endTime || parseTimeRange(eventOrDraft?.time).endTime
  const start = toMinutes(startRaw)
  if (start === null) return null
  const parsedEnd = toMinutes(endRaw)
  const end = parsedEnd !== null && parsedEnd > start ? parsedEnd : start + 60
  return { start, end }
}

export function findEventConflicts(existingEvents, draft) {
  const date = clean(draft?.date)
  if (!date || !Array.isArray(existingEvents)) return []
  const targetInterval = eventIntervalMinutes(draft)
  if (!targetInterval) return []

  return existingEvents.filter((event) => {
    if (!event || event.date !== date || (draft?.id && event.id === draft.id)) return false
    const interval = eventIntervalMinutes(event)
    if (!interval) return false
    return targetInterval.start < interval.end && interval.start < targetInterval.end
  })
}

export function normalizeEventDraft(draft, existing = null, index = 0) {
  const date = clean(draft?.date)
  const title = clean(draft?.title)
  if (!parseDateKey(date)) throw new TypeError('Ngày không hợp lệ.')
  if (!title) throw new TypeError('Tên sự kiện là bắt buộc.')
  const requestedColor = clean(draft?.color)

  return {
    id: existing?.id || globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${index}`,
    date,
    title,
    code: clean(draft.code),
    time: clean(draft.time),
    room: clean(draft.room),
    teacher: clean(draft.teacher),
    color: COLORS.includes(requestedColor) ? requestedColor : (existing?.color || COLORS[index % COLORS.length]),
  }
}

export function sortEvents(events) {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title))
}

export function saveEvent(events, draft, editingId = null) {
  const existing = editingId ? events.find((event) => event.id === editingId) : null
  if (editingId && !existing) throw new TypeError('Không tìm thấy sự kiện cần sửa.')
  const normalized = normalizeEventDraft(draft, existing, events.length)
  const next = existing ? events.map((event) => event.id === editingId ? normalized : event) : [...events, normalized]
  return sortEvents(next)
}

export function saveEventsBatch(events, drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) return sortEvents(events)
  const current = Array.isArray(events) ? [...events] : []
  const signature = (item) => `${item.date}|${item.time || ''}|${item.title.toLowerCase()}`
  const existingSignatures = new Set(current.map(signature))

  drafts.forEach((draft, offset) => {
    const normalized = normalizeEventDraft(draft, null, current.length + offset)
    const key = signature(normalized)
    if (!existingSignatures.has(key)) {
      existingSignatures.add(key)
      current.push(normalized)
    }
  })

  return sortEvents(current)
}

export function deleteEvent(events, id) {
  return events.filter((event) => event.id !== id)
}
