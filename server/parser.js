import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'

const COLORS = ['violet', 'amber', 'cyan', 'green', 'rose', 'blue']
const HEADER_ALIASES = {
  date: ['ngay', 'ngay hoc', 'date'],
  title: ['mon hoc', 'ten mon hoc', 'hoc phan', 'ten hoc phan', 'subject'],
  code: ['ma mon', 'ma hoc phan', 'ma hp', 'subject code'],
  time: ['thoi gian', 'gio hoc', 'ca hoc', 'tiet hoc', 'tiet', 'time'],
  room: ['phong', 'phong hoc', 'dia diem', 'room'],
  teacher: ['giang vien', 'giao vien', 'gv', 'teacher'],
}

const clean = (value = '') => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
const key = (value = '') => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[:：]/g, '')

function parseDate(value) {
  const text = clean(value)
  let match = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return null
}

function normalizeTime(value) {
  const text = clean(value)
  const times = [...text.matchAll(/\b(\d{1,2})[:h](\d{2})\b/gi)].map((match) => `${match[1].padStart(2, '0')}:${match[2]}`)
  if (times.length >= 2) return `${times[0]} – ${times[1]}`
  if (times.length === 1) return times[0]
  return text
}

function headerType(value) {
  const normalized = key(value)
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0]
}

function labeledValue(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`(?:^|[;|\\n])\\s*${escaped}\\s*[:：-]\\s*([^;|\\n]+)`, 'i'))
    if (match) return clean(match[1])
  }
  return ''
}

function eventId(event, index) {
  return createHash('sha256').update(`${event.date}|${event.code}|${event.title}|${event.time}|${event.room}|${index}`).digest('hex').slice(0, 16)
}

function finishEvent(raw, index) {
  const date = parseDate(raw.date)
  const title = clean(raw.title)
  if (!date || !title) return null
  const code = clean(raw.code)
  const event = {
    date,
    title,
    code,
    time: normalizeTime(raw.time),
    room: clean(raw.room),
    teacher: clean(raw.teacher),
  }
  return { id: eventId(event, index), ...event, color: COLORS[index % COLORS.length] }
}

function cellsOf($, row) {
  return $(row).find('th, td').map((_, cell) => clean($(cell).text())).get()
}

function parseStructuredTable($, table, offset) {
  const rows = $(table).find('tr').toArray()
  let headerIndex = -1
  let columns = {}

  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const candidate = {}
    cellsOf($, rows[index]).forEach((text, column) => {
      const type = headerType(text)
      if (type && candidate[type] === undefined) candidate[type] = column
    })
    if (candidate.date !== undefined && candidate.title !== undefined) {
      headerIndex = index
      columns = candidate
      break
    }
  }
  if (headerIndex < 0) return []

  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    const cells = cellsOf($, row)
    const read = (name) => columns[name] === undefined ? '' : cells[columns[name]]
    const event = finishEvent({ date: read('date'), title: read('title'), code: read('code'), time: read('time'), room: read('room'), teacher: read('teacher') }, offset + index)
    return event ? [event] : []
  })
}

function parseLabeledCells($, table, offset) {
  const events = []
  $(table).find('td').each((_, cell) => {
    const element = $(cell)
    const text = element.text().replace(/\r/g, '').replace(/\n\s*/g, '\n')
    const date = element.attr('data-date') || labeledValue(text, ['Ngày', 'Ngày học']) || parseDate(text)
    const title = element.attr('data-subject') || labeledValue(text, ['Môn học', 'Học phần', 'Tên môn học'])
    if (!date || !title) return
    const event = finishEvent({
      date,
      title,
      code: element.attr('data-code') || labeledValue(text, ['Mã môn', 'Mã học phần', 'Mã HP']),
      time: element.attr('data-time') || labeledValue(text, ['Thời gian', 'Giờ học', 'Ca học', 'Tiết']),
      room: element.attr('data-room') || labeledValue(text, ['Phòng', 'Phòng học', 'Địa điểm']),
      teacher: element.attr('data-teacher') || labeledValue(text, ['Giảng viên', 'Giáo viên', 'GV']),
    }, offset + events.length)
    if (event) events.push(event)
  })
  return events
}

export function parseTimetableHtml(html) {
  if (typeof html !== 'string' || !html.trim()) throw new TypeError('Timetable HTML must be a non-empty string')
  const $ = cheerio.load(html)
  const events = []

  $('table').each((_, table) => {
    const parsed = parseStructuredTable($, table, events.length)
    events.push(...(parsed.length ? parsed : parseLabeledCells($, table, events.length)))
  })

  const unique = new Map()
  for (const event of events) unique.set(`${event.date}|${event.code}|${event.title}|${event.time}|${event.room}`, event)
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}
