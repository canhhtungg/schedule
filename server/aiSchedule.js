import { addDays, dateKey, pad, parseDateKey, vietnameseLunarDate } from '../src/calendarUtils.js'
import { findEventConflicts } from '../src/scheduleUtils.js'
import { formatTimeRange, parseTimeRange } from '../src/timeUtils.js'

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
export const FALLBACK_GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
]
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const MAX_AI_MESSAGES = 12
export const MAX_AI_MESSAGE_CHARS = 2000
export const MAX_AI_CONTEXT_EVENTS = 300
export const MAX_AI_PROPOSED_EVENTS = 120

const COLORS = ['violet', 'amber', 'cyan', 'green', 'rose', 'blue']
const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

const cleanText = (value, maxLength = 200) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '')

export function bangkokDateKey(nowMs = Date.now()) {
  const bangkokMs = nowMs + 7 * 60 * 60 * 1000
  const date = new Date(bangkokMs)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function bangkokTimeKey(nowMs = Date.now()) {
  const bangkokMs = nowMs + 7 * 60 * 60 * 1000
  const date = new Date(bangkokMs)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function weekdayLabelForDateKey(value) {
  const parsed = parseDateKey(value)
  if (!parsed) return ''
  return WEEKDAY_LABELS[parsed.getDay()]
}

const SHORT_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function buildUpcomingCalendarReference(referenceDateKey, daysCount = 60) {
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const lines = []
  for (let offset = 0; offset < daysCount; offset += 1) {
    const current = addDays(baseDate, offset)
    const key = dateKey(current)
    const weekday = SHORT_WEEKDAYS[current.getDay()]
    const lunar = vietnameseLunarDate(current)
    const lunarStr = `${pad(lunar.day)}/${pad(lunar.month)}${lunar.leap ? 'N' : ''}`
    lines.push(`${key}(${weekday},Âm:${lunarStr})`)
  }
  return lines.join(' ')
}

export function buildYearLunarSpecialDaysReference(referenceDateKey, daysCount = 240) {
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const lines = []
  for (let offset = 0; offset < daysCount; offset += 1) {
    const current = addDays(baseDate, offset)
    const lunar = vietnameseLunarDate(current)
    const nextLunar = vietnameseLunarDate(addDays(current, 1))
    const isBeforeMung1 = nextLunar.day === 1
    const isBeforeRam = lunar.day === 14
    if (lunar.day === 1 || lunar.day === 15 || isBeforeMung1 || isBeforeRam) {
      const key = dateKey(current)
      const lunarStr = `${pad(lunar.day)}/${pad(lunar.month)}${lunar.leap ? 'N' : ''}`
      lines.push(`${key}(Âm:${lunarStr})`)
    }
  }
  return lines.join(' ')
}

export function summarizeExistingEvents(existingEvents, referenceDateKey) {
  if (!Array.isArray(existingEvents) || existingEvents.length === 0) return 'Chưa có lịch nào.'
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const minKey = dateKey(baseDate)
  const maxKey = dateKey(addDays(baseDate, 120))

  const relevant = existingEvents
    .filter((item) => item && typeof item.date === 'string' && item.date >= minKey && item.date <= maxKey)
    .slice(0, 80)

  if (!relevant.length) return 'Không có lịch nào từ hôm nay trở đi.'

  return relevant
    .map((item) => {
      const idStr = cleanText(item.id, 60)
      const weekday = weekdayLabelForDateKey(item.date)
      const timeStr = cleanText(item.time, 40) || 'Cả ngày'
      const titleStr = cleanText(item.title, 90)
      return `- [id: ${idStr}] ${item.date} (${weekday}) | ${timeStr} | ${titleStr}`
    })
    .join('\n')
}

export function buildAiSystemPrompt(referenceDateKey, existingEvents = [], referenceTimeKey = '') {
  const todayKey = parseDateKey(referenceDateKey) ? referenceDateKey : bangkokDateKey()
  const nowTimeKey = normalizeTimeToken(referenceTimeKey) || bangkokTimeKey()
  const todayWeekday = weekdayLabelForDateKey(todayKey)
  const calendarRef = buildUpcomingCalendarReference(todayKey, 60)
  const yearSpecialLunarRef = buildYearLunarSpecialDaysReference(todayKey, 240)
  const busySummary = summarizeExistingEvents(existingEvents, todayKey)

  return `Bạn là Trợ lý Lập kế hoạch Lịch học thông minh của ứng dụng KMA Schedule.
Nhiệm vụ: Phân tích yêu cầu thêm lịch mới, sửa kế hoạch, hoặc XÓA lịch đã có và trả về JSON.

THỜI GIAN HIỆN TẠI:
- Bây giờ là: ${nowTimeKey} ngày ${todayKey} (${todayWeekday}), múi giờ Việt Nam (UTC+7).
- Lịch 60 ngày tới (từ hôm nay): ${calendarRef}
- Các ngày Mùng 1 (Âm:01/MM), Rằm (Âm:15/MM) và ngày liền trước Mùng 1/Rằm sắp tới (từ hôm nay trở đi): ${yearSpecialLunarRef}

DANH SÁCH LỊCH HIỆN CÓ (kèm [id: ...] để né trùng giờ hoặc chọn lịch cần xóa):
${busySummary}

QUY TẮC BẮT BUỘC:
1. KHÔNG TẠO LỊCH TRONG QUÁ KHỨ: Khi thêm lịch mới ("action": "add", ví dụ người dùng bảo thêm lịch trong tuần/tháng), CHỈ tạo sự kiện bắt đầu từ thời điểm hiện tại (${nowTimeKey} ngày ${todayKey}) trở đi. TUYỆT ĐỐI BỎ QUA các ngày đã qua (< ${todayKey}) và các khung giờ trong ngày hôm nay (${todayKey}) đã trôi qua (< ${nowTimeKey}) để tiết kiệm bộ nhớ và token.
2. NẾU THÊM LỊCH: Đặt "action": "add". BẮT BUỘC tạo các sự kiện cụ thể trong mảng "events". Ngày trước mùng 1 là ngày liền trước ngày có Âm:01/MM; ngày trước rằm là ngày có Âm:14/MM. Nếu không nêu giờ cụ thể, tự chọn giờ hợp lý (VD sáng 08:00-09:00, chiều 14:00-16:00, tối 19:30-21:30) và né giờ bận.
3. NẾU XÓA LỊCH (VD: "xóa các lịch mua đồ thắp hương", "xóa lịch ngày mai"): Đặt "action": "delete". Tìm đúng các sự kiện khớp yêu cầu trong DANH SÁCH LỊCH HIỆN CÓ và đưa vào mảng "events" (giữ nguyên "id", "date", "title") để ứng dụng xóa khỏi bảng danh sách và hủy thông báo.
4. "date" phải là ngày DƯƠNG LỊCH "YYYY-MM-DD".

ĐỊNH DẠNG JSON BẮT BUỘC (KHÔNG BỌC MARKDOWN):
{
  "action": "add | delete",
  "reply": "Lời giải thích ngắn gọn...",
  "planTitle": "Tiêu đề ngắn gọn",
  "events": [
    {
      "id": "Giữ nguyên id nếu action=delete, để rỗng nếu action=add",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "title": "Tên sự kiện",
      "code": "Mã ngắn (VD: REMIND, STUDY, EXAM...)",
      "room": "Địa điểm / Phòng (hoặc chuỗi rỗng)",
      "teacher": "Ghi chú thêm (hoặc chuỗi rỗng)",
      "color": "violet | amber | cyan | green | rose | blue"
    }
  ]
}`
}

function normalizeTimeToken(value) {
  const match = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/.exec(String(value || '').trim())
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export function isPastProposedEvent(event, referenceDateKey, referenceTimeKey = '') {
  if (!event || !event.date || !referenceDateKey) return false
  if (event.date < referenceDateKey) return true
  if (event.date === referenceDateKey && referenceTimeKey) {
    const compareTime = event.endTime || event.startTime
    if (compareTime && compareTime < referenceTimeKey) return true
  }
  return false
}

export function normalizeProposedEvent(rawEvent, index = 0, existingEvents = [], action = 'add') {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const requestedId = cleanText(rawEvent.id, 120)

  if (action === 'delete') {
    const matchedById = requestedId
      ? existingEvents.find((item) => item && item.id === requestedId)
      : null
    const rawDate = cleanText(rawEvent.date, 10)
    const rawTitle = cleanText(rawEvent.title, 200).toLowerCase()
    const matchedByFields = !matchedById && rawDate && rawTitle
      ? existingEvents.find((item) => item && item.date === rawDate && cleanText(item.title, 200).toLowerCase() === rawTitle)
      : null
    const matched = matchedById || matchedByFields

    const date = matched?.date || rawDate
    const title = matched?.title || cleanText(rawEvent.title, 200)
    if (!parseDateKey(date) || !title) return null

    const parsedRange = parseTimeRange(matched?.time || rawEvent.time)
    const startTime = normalizeTimeToken(rawEvent.startTime) || parsedRange.startTime
    const endTime = normalizeTimeToken(rawEvent.endTime) || parsedRange.endTime
    const time = matched?.time || (startTime ? (endTime && endTime > startTime ? `${startTime} – ${endTime}` : startTime) : '')

    return {
      id: matched?.id || requestedId || `ai-delete-${date}-${index}`,
      targetEventId: matched?.id || requestedId || '',
      date,
      weekday: weekdayLabelForDateKey(date),
      title,
      code: cleanText(matched?.code || rawEvent.code, 50),
      startTime,
      endTime,
      time,
      room: cleanText(matched?.room || rawEvent.room, 100),
      teacher: cleanText(matched?.teacher || rawEvent.teacher, 150),
      color: COLORS.includes(matched?.color) ? matched.color : 'rose',
      conflicts: [],
    }
  }

  const date = cleanText(rawEvent.date, 10)
  const title = cleanText(rawEvent.title, 200)
  if (!parseDateKey(date) || !title) return null

  const parsedRange = parseTimeRange(rawEvent.time)
  let startTime = normalizeTimeToken(rawEvent.startTime) || parsedRange.startTime
  let endTime = normalizeTimeToken(rawEvent.endTime) || parsedRange.endTime
  let time = ''

  if (startTime) {
    if (endTime && endTime <= startTime) endTime = ''
    try {
      time = formatTimeRange(startTime, endTime)
    } catch {
      time = startTime
      endTime = ''
    }
  }

  const requestedColor = cleanText(rawEvent.color, 20).toLowerCase()
  const color = COLORS.includes(requestedColor) ? requestedColor : COLORS[index % COLORS.length]
  const draft = {
    id: `ai-draft-${date}-${index}`,
    date,
    weekday: weekdayLabelForDateKey(date),
    title,
    code: cleanText(rawEvent.code, 50),
    startTime,
    endTime,
    time,
    room: cleanText(rawEvent.room, 100),
    teacher: cleanText(rawEvent.teacher, 150),
    color,
  }

  const conflicts = findEventConflicts(existingEvents, draft)
  return {
    ...draft,
    conflicts: conflicts.map((item) => ({
      id: item.id,
      title: item.title,
      time: item.time || '',
    })),
  }
}

export function parseAiScheduleResponse(rawContent, existingEvents = [], { referenceDateKey = '', referenceTimeKey = '' } = {}) {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new Error('AI không trả về dữ liệu.')
  }

  let cleaned = rawContent.trim()
  const codeBlockMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned)
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    } else {
      throw new Error('Phản hồi từ AI không đúng định dạng JSON.')
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Phản hồi từ AI phải là một JSON object.')
  }

  const action = cleanText(parsed.action, 20).toLowerCase() === 'delete' ? 'delete' : 'add'
  const rawEvents = Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_AI_PROPOSED_EVENTS) : []
  const events = rawEvents
    .map((item, index) => normalizeProposedEvent(item, index, existingEvents, action))
    .filter(Boolean)
    .filter((item) => action === 'delete' || !isPastProposedEvent(item, referenceDateKey, referenceTimeKey))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title))

  const reply = cleanText(parsed.reply, 3000) || (
    events.length
      ? (action === 'delete'
        ? `Mình đã tìm thấy ${events.length} sự kiện cần xóa theo yêu cầu của bạn. Hãy kiểm tra và bấm xác nhận xóa nhé!`
        : `Mình đã lập kế hoạch gồm ${events.length} sự kiện theo yêu cầu của bạn. Bạn hãy kiểm tra và bấm chốt để thêm vào lịch nhé!`)
      : 'Mình chưa tìm thấy thông tin ngày giờ cụ thể. Bạn có thể mô tả rõ hơn thời gian và nội dung lịch mong muốn không?'
  )
  const planTitle = cleanText(parsed.planTitle, 160) || (
    events.length
      ? (action === 'delete' ? `Danh sách lịch cần xóa (${events.length} lịch)` : `Kế hoạch đề xuất (${events.length} lịch)`)
      : ''
  )

  return {
    action,
    reply,
    planTitle,
    events,
  }
}
