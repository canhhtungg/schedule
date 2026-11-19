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

export function deleteEventsBatch(events, targets) {
  if (!Array.isArray(events) || !Array.isArray(targets) || targets.length === 0) return Array.isArray(events) ? [...events] : []
  const idSet = new Set()
  const sigSet = new Set()

  targets.forEach((target) => {
    if (typeof target === 'string' && target.trim()) {
      idSet.add(target.trim())
    } else if (target && typeof target === 'object') {
      if (typeof target.id === 'string' && target.id.trim()) idSet.add(target.id.trim())
      if (typeof target.targetEventId === 'string' && target.targetEventId.trim()) idSet.add(target.targetEventId.trim())
      if (typeof target.date === 'string' && typeof target.title === 'string') {
        sigSet.add(`${clean(target.date)}|${clean(target.time)}|${clean(target.title).toLowerCase()}`)
        sigSet.add(`${clean(target.date)}||${clean(target.title).toLowerCase()}`)
      }
    }
  })

  return events.filter((event) => {
    if (!event) return false
    if (idSet.has(event.id)) return false
    const exactSig = `${clean(event.date)}|${clean(event.time)}|${clean(event.title).toLowerCase()}`
    const titleDateSig = `${clean(event.date)}||${clean(event.title).toLowerCase()}`
    if (sigSet.has(exactSig)) return false
    if (sigSet.has(titleDateSig) && targets.some((t) => typeof t === 'object' && !clean(t.time) && clean(t.date) === clean(event.date) && clean(t.title).toLowerCase() === clean(event.title).toLowerCase())) {
      return false
    }
    return true
  })
}

export function updateEventsBatch(events, updates) {
  if (!Array.isArray(events) || !Array.isArray(updates) || updates.length === 0) {
    return Array.isArray(events) ? sortEvents(events) : []
  }

  let next = [...events]

  updates.forEach((updateDraft, offset) => {
    if (!updateDraft || typeof updateDraft !== 'object') return
    const targetId = clean(updateDraft.targetEventId || updateDraft.id)
    let existingIndex = targetId ? next.findIndex((item) => item && item.id === targetId) : -1

    if (existingIndex === -1 && updateDraft.date && updateDraft.title) {
      const normalizedTitle = clean(updateDraft.title).toLowerCase()
      existingIndex = next.findIndex((item) => item && item.date === clean(updateDraft.date) && clean(item.title).toLowerCase() === normalizedTitle)
    }

    if (existingIndex !== -1) {
      const existing = next[existingIndex]
      const normalized = normalizeEventDraft(updateDraft, existing, existingIndex)
      next[existingIndex] = normalized
    } else {
      const normalized = normalizeEventDraft(updateDraft, null, next.length + offset)
      next.push(normalized)
    }
  })

  return sortEvents(next)
}

function escapeIcsText(value) {
  return clean(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function eventsToIcs(events) {
  const safeEvents = Array.isArray(events) ? sortEvents(events) : []
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KMA Planner//Schedule Export//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:KMA Planner',
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
  ]

  safeEvents.forEach((event, index) => {
    if (!event || !parseDateKey(event.date) || !clean(event.title)) return
    const dateCompact = clean(event.date).replace(/-/g, '')
    const { startTime, endTime } = parseTimeRange(event.time)
    const uid = `${clean(event.id) || `kma-${dateCompact}-${index}`}@kma.planner`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${escapeIcsText(uid)}`)
    lines.push(`DTSTAMP:${nowStamp}`)

    if (startTime) {
      const startCompact = `${startTime.replace(':', '')}00`
      const endMin = toMinutes(endTime)
      const startMin = toMinutes(startTime)
      let computedEnd = endTime
      if (endMin === null || (startMin !== null && endMin <= startMin)) {
        const fallbackMin = Math.min(23 * 60 + 59, (startMin || 0) + 60)
        const h = String(Math.floor(fallbackMin / 60)).padStart(2, '0')
        const m = String(fallbackMin % 60).padStart(2, '0')
        computedEnd = `${h}:${m}`
      }
      const endCompact = `${computedEnd.replace(':', '')}00`
      lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${dateCompact}T${startCompact}`)
      lines.push(`DTEND;TZID=Asia/Ho_Chi_Minh:${dateCompact}T${endCompact}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`)
      lines.push(`DTEND;VALUE=DATE:${dateCompact}`)
    }

    const summary = event.code ? `[${clean(event.code)}] ${clean(event.title)}` : clean(event.title)
    lines.push(`SUMMARY:${escapeIcsText(summary)}`)
    if (clean(event.room)) {
      lines.push(`LOCATION:${escapeIcsText(event.room)}`)
    }
    const details = [
      clean(event.code) ? `Mã môn: ${clean(event.code)}` : '',
      clean(event.teacher) ? `Giảng viên: ${clean(event.teacher)}` : '',
      clean(event.room) ? `Phòng: ${clean(event.room)}` : '',
    ].filter(Boolean).join('\n')
    if (details) {
      lines.push(`DESCRIPTION:${escapeIcsText(details)}`)
    }
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
