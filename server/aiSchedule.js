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

export function weekdayLabelForDateKey(value) {
  const parsed = parseDateKey(value)
  if (!parsed) return ''
  return WEEKDAY_LABELS[parsed.getDay()]
}

export function buildUpcomingCalendarReference(referenceDateKey, daysCount = 120) {
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const lines = []
  for (let offset = 0; offset < daysCount; offset += 1) {
    const current = addDays(baseDate, offset)
    const key = dateKey(current)
    const weekday = WEEKDAY_LABELS[current.getDay()]
    const lunar = vietnameseLunarDate(current)
    const lunarStr = `${pad(lunar.day)}/${pad(lunar.month)}${lunar.leap ? 'N' : ''}`
    lines.push(`${key} (${weekday}, Âm: ${lunarStr})`)
  }
  return lines.join(', ')
}

export function buildYearLunarSpecialDaysReference(referenceDateKey) {
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const startOfYear = new Date(baseDate.getFullYear(), 0, 1)
  const lines = []
  for (let offset = 0; offset < 400; offset += 1) {
    const current = addDays(startOfYear, offset)
    const lunar = vietnameseLunarDate(current)
    if (lunar.day === 1 || lunar.day === 14 || lunar.day === 15 || lunar.day >= 29) {
      const key = dateKey(current)
      const weekday = WEEKDAY_LABELS[current.getDay()]
      const lunarStr = `${pad(lunar.day)}/${pad(lunar.month)}${lunar.leap ? 'N' : ''}`
      lines.push(`${key} (${weekday}, Âm: ${lunarStr})`)
    }
  }
  return lines.join(', ')
}

export function summarizeExistingEvents(existingEvents, referenceDateKey) {
  if (!Array.isArray(existingEvents) || existingEvents.length === 0) return 'Chưa có lịch nào trong khoảng thời gian này.'
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const minKey = dateKey(addDays(baseDate, -14))
  const maxKey = dateKey(addDays(baseDate, 180))

  const relevant = existingEvents
    .filter((item) => item && typeof item.date === 'string' && item.date >= minKey && item.date <= maxKey)
    .slice(0, 200)

  if (!relevant.length) return 'Không có lịch nào trong khoảng thời gian này.'

  return relevant
    .map((item) => {
      const idStr = cleanText(item.id, 120)
      const weekday = weekdayLabelForDateKey(item.date)
      const timeStr = cleanText(item.time, 50) || 'Cả ngày'
      const titleStr = cleanText(item.title, 120)
      const roomStr = cleanText(item.room, 80)
      return `- [id: ${idStr}] ${item.date} (${weekday}) | ${timeStr} | ${titleStr}${roomStr ? ` | Phòng: ${roomStr}` : ''}`
    })
    .join('\n')
}

export function buildAiSystemPrompt(referenceDateKey, existingEvents = []) {
  const todayKey = parseDateKey(referenceDateKey) ? referenceDateKey : bangkokDateKey()
  const todayWeekday = weekdayLabelForDateKey(todayKey)
  const calendarRef = buildUpcomingCalendarReference(todayKey, 120)
  const yearSpecialLunarRef = buildYearLunarSpecialDaysReference(todayKey)
  const busySummary = summarizeExistingEvents(existingEvents, todayKey)

  return `Bạn là Trợ lý Lập kế hoạch Lịch học thông minh của ứng dụng KMA Schedule.
Nhiệm vụ của bạn là phân tích mong muốn lịch trình của người dùng (thêm lịch mới, chỉnh sửa kế hoạch, hoặc XÓA các lịch đã có trong thời khóa biểu) và trả về danh sách sự kiện cụ thể trong mảng "events".

THÔNG TIN THỜI GIAN HIỆN TẠI:
- Hôm nay là: ${todayKey} (${todayWeekday}), múi giờ Việt Nam (UTC+7).
- Bảng tra cứu chi tiết từng ngày dương lịch & âm lịch (Âm: DD/MM) trong 120 ngày tới:
${calendarRef}
- Bảng tra cứu nhanh các ngày Mùng 1 (Âm: 01/MM), Ngày Rằm (Âm: 15/MM) và ngày liền trước mùng 1/rằm (Âm: 14/MM, 29/MM, 30/MM) trong cả năm:
${yearSpecialLunarRef}

DANH SÁCH LỊCH HIỆN CÓ CỦA NGƯỜI DÙNG (kèm [id: ...] để đối chiếu trùng giờ hoặc chọn lịch cần xóa):
${busySummary}

QUY TẮC LẬP KẾ HOẠCH BẮT BUỘC:
1. NẾU NGƯỜI DÙNG YÊU CẦU THÊM LỊCH / LÊN KẾ HOẠCH:
   - Đặt "action": "add".
   - BẮT BUỘC sinh ra các phần tử sự kiện cụ thể trong mảng "events" (KHÔNG ĐƯỢC để "events": [] rồi chỉ liệt kê ngày trong "reply").
   - Nếu người dùng nói "tháng 11 và tháng 12" kèm "mùng 1 hoặc rằm (âm lịch)", hãy liệt kê đầy đủ các ngày thỏa mãn vào mảng "events". Lưu ý: "ngày trước ngày mùng 1" là ngày dương lịch liền trước ngày có ` + '`Âm: 01/MM`' + ` (tức ngày 29 hoặc 30 âm lịch cuối tháng trước), và "ngày trước ngày rằm" là ngày dương lịch liền trước ngày có ` + '`Âm: 15/MM`' + ` (tức ngày ` + '`Âm: 14/MM`' + `).
   - Nếu người dùng nói buổi sáng/chiều/tối mà không nêu giờ cụ thể, hãy tự chọn khung giờ hợp lý (VD: sáng "08:00" đến "09:00", chiều "14:00" đến "16:00", tối "19:30" đến "21:30") và ưu tiên NÉ các khung giờ đã bận trong DANH SÁCH LỊCH HIỆN CÓ.
2. NẾU NGƯỜI DÙNG YÊU CẦU XÓA / HỦY / GỠ BỎ CÁC LỊCH ĐÃ CÓ TRONG THỜI KHÓA BIỂU (VD: "xóa các lịch mua đồ thắp hương", "xóa lịch ngày mai", "xóa hết lịch tự học tiếng Anh"):
   - Đặt "action": "delete".
   - Tìm đúng các sự kiện khớp với yêu cầu của người dùng trong DANH SÁCH LỊCH HIỆN CÓ ở trên và đưa chúng vào mảng "events" (giữ nguyên "id", "date", "title", và khung giờ của sự kiện đó) để ứng dụng xóa khỏi bảng danh sách lịch và hủy lịch thông báo (notification).
3. Trường "date" của mỗi sự kiện trong mảng "events" BẮT BUỘC phải là ngày DƯƠNG LỊCH định dạng "YYYY-MM-DD".
4. Chỉ để "events" là mảng rỗng [] khi người dùng chào hỏi xã giao mà hoàn toàn không yêu cầu thêm hoặc xóa lịch nào.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON OBJECT HỢP LỆ, KHÔNG BỌC MARKDOWN):
{
  "action": "add | delete",
  "reply": "Lời giải thích ngắn gọn về các lịch sắp thêm hoặc sắp xóa...",
  "planTitle": "Tiêu đề ngắn gọn (VD: Kế hoạch nhắc mua đồ thắp hương / Danh sách lịch cần xóa)",
  "events": [
    {
      "id": "Giữ nguyên id từ [id: ...] nếu action là delete (hoặc để chuỗi rỗng nếu action là add)",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "title": "Tên sự kiện / môn học",
      "code": "Mã hoặc nhãn ngắn in hoa (VD: REMIND, STUDY, EXAM, WORK... tối đa 15 ký tự)",
      "room": "Địa điểm / Phòng / Online (để chuỗi rỗng nếu không có)",
      "teacher": "Ghi chú thêm (VD: Ngày 14/11 âm lịch - Trước rằm tháng 11)",
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

export function parseAiScheduleResponse(rawContent, existingEvents = []) {
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
