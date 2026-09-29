import * as XLSX from '@e965/xlsx'
import { createHash } from 'node:crypto'

const COLORS = ['violet', 'amber', 'cyan', 'green', 'rose', 'blue']
const PERIOD_TIMES = {
  '1,2,3': '07:00 – 09:25',
  '4,5,6': '09:35 – 12:00',
  '7,8,9': '12:30 – 14:55',
  '7,8,9,10': '12:30 – 15:50',
  '10,11,12': '15:05 – 17:30',
  '13,14,15,16': '18:00 – 21:15',
}

const clean = (value = '') => String(value).replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
const pad = (value) => String(value).padStart(2, '0')
const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

function parseVietnameseDate(value) {
  const match = clean(value).match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (!match) return null
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  return Number.isNaN(date.getTime()) ? null : date
}

function weekdayNumber(value) {
  const normalized = clean(value).toLowerCase()
  if (/cn|chủ\s*nhật/.test(normalized)) return 0
  const number = Number(normalized.match(/\d/)?.[0])
  return number >= 2 && number <= 7 ? number - 1 : null
}

function datesForWeekday(start, end, weekday) {
  const dates = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  while (cursor <= end) {
    if (cursor.getDay() === weekday) dates.push(isoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function splitSubject(value) {
  const text = clean(value)
  const match = text.match(/^([A-ZĐ\d][A-ZĐ\d._-]{2,})\s*[-–:]\s*(.+)$/i)
  return match ? { code: clean(match[1]), title: clean(match[2]) } : { code: '', title: text }
}

function periodTime(value) {
  const periods = clean(value).replace(/\s/g, '').replace(/-/g, ',')
  return PERIOD_TIMES[periods] || `Tiết ${periods}`
}

function makeEvent({ date, code, title, periods, room }, index) {
  const time = periodTime(periods)
  const id = createHash('sha256').update(`${date}|${code}|${title}|${time}|${room}`).digest('hex').slice(0, 16)
  return { id, date, title, code, time, room: clean(room) || 'Chưa rõ', teacher: 'Chưa rõ', color: COLORS[index % COLORS.length] }
}

function nearbySubject(worksheet, row) {
  const preferred = worksheet[`F${row}`]?.v
  if (clean(preferred)) return clean(preferred)
  for (const column of ['E', 'D', 'G', 'C', 'B']) {
    const value = clean(worksheet[`${column}${row}`]?.v)
    if (value && !/^Từ\s+\d/i.test(value)) return value
  }
  return 'Học phần'
}

function scheduleBlocks(value) {
  const text = clean(value).replace(/\s*Từ\s+/gi, '\nTừ ')
  const blockPattern = /Từ\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\s+đến\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\s*:\s*([\s\S]*?)(?=\nTừ\s+\d|$)/gi
  return [...text.matchAll(blockPattern)].map((match) => ({ start: match[1], end: match[2], details: match[3] }))
}

function detailLines(value) {
  const pattern = /(?:Thứ\s*(\d)|((?:Chủ\s*nhật)|CN))\s+tiết\s*([\d,\s-]+?)\s+tại\s*([^\n;]+?)(?=(?:\s+(?:Thứ\s*\d|Chủ\s*nhật|CN)\s+tiết)|$)/gi
  return [...String(value).matchAll(pattern)].map((match) => ({ day: match[1] ? `Thứ ${match[1]}` : match[2], periods: match[3], room: match[4] }))
}

export function parseTimetableWorkbook(bytes) {
  if (!bytes || bytes.byteLength === 0) throw new TypeError('Timetable workbook must not be empty')
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false, dense: false })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!worksheet) return []

  const events = []
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith('!')) continue
    const value = clean(worksheet[address]?.v)
    if (!/Từ\s+\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}\s+đến/i.test(value)) continue
    const row = Number(address.match(/\d+/)?.[0])
    const { code, title } = splitSubject(nearbySubject(worksheet, row))

    for (const block of scheduleBlocks(value)) {
      const start = parseVietnameseDate(block.start)
      const end = parseVietnameseDate(block.end)
      if (!start || !end || start > end) continue
      for (const detail of detailLines(block.details)) {
        const weekday = weekdayNumber(detail.day)
        if (weekday === null) continue
        for (const date of datesForWeekday(start, end, weekday)) {
          events.push(makeEvent({ date, code, title, periods: detail.periods, room: detail.room }, events.length))
        }
      }
    }
  }

  const unique = new Map()
  for (const event of events) unique.set(`${event.date}|${event.code}|${event.title}|${event.time}|${event.room}`, event)
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}
