import { addDays, dateKey, parseDateKey } from '../src/calendarUtils.js'
import { findEventConflicts } from '../src/scheduleUtils.js'
import { formatTimeRange, parseTimeRange } from '../src/timeUtils.js'

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'
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

export function buildUpcomingCalendarReference(referenceDateKey, daysCount = 35) {
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const lines = []
  for (let offset = 0; offset < daysCount; offset += 1) {
    const current = addDays(baseDate, offset)
    const key = dateKey(current)
    const weekday = WEEKDAY_LABELS[current.getDay()]
    lines.push(`${key} (${weekday})`)
  }
  return lines.join(', ')
}

export function summarizeExistingEvents(existingEvents, referenceDateKey) {
  if (!Array.isArray(existingEvents) || existingEvents.length === 0) return 'Chưa có lịch nào trong khoảng thời gian này.'
  const baseDate = parseDateKey(referenceDateKey) || parseDateKey(bangkokDateKey())
  const minKey = dateKey(addDays(baseDate, -3))
  const maxKey = dateKey(addDays(baseDate, 60))

  const relevant = existingEvents
    .filter((item) => item && typeof item.date === 'string' && item.date >= minKey && item.date <= maxKey)
    .slice(0, 150)

  if (!relevant.length) return 'Không có lịch bận nào trong 60 ngày tới.'

  return relevant
    .map((item) => {
      const weekday = weekdayLabelForDateKey(item.date)
      const timeStr = cleanText(item.time, 50) || 'Cả ngày'
      const titleStr = cleanText(item.title, 120)
      return `- ${item.date} (${weekday}) | ${timeStr} | ${titleStr}`
    })
    .join('\n')
}

export function buildAiSystemPrompt(referenceDateKey, existingEvents = []) {
  const todayKey = parseDateKey(referenceDateKey) ? referenceDateKey : bangkokDateKey()
  const todayWeekday = weekdayLabelForDateKey(todayKey)
  const calendarRef = buildUpcomingCalendarReference(todayKey, 42)
  const busySummary = summarizeExistingEvents(existingEvents, todayKey)

  return `Bạn là Trợ lý Lập kế hoạch Lịch học thông minh của ứng dụng KMA Schedule.
Nhiệm vụ của bạn là phân tích mong muốn lịch trình của người dùng (lịch tự học, ôn thi, học nhóm, thể thao, công việc cá nhân, lịch học bổ sung...) và tạo danh sách các sự kiện lịch cụ thể.

THÔNG TIN THỜI GIAN HIỆN TẠI:
- Hôm nay là: ${todayKey} (${todayWeekday}), múi giờ Việt Nam (UTC+7).
- Bảng tra cứu lịch dương 42 ngày tới (hãy dựa tuyệt đối vào bảng này để xác định đúng ngày YYYY-MM-DD cho các thứ trong tuần, "tuần này", "tuần sau", "tháng tới"):
${calendarRef}

LỊCH HIỆN CÓ CỦA NGƯỜI DÙNG (để tránh xếp trùng giờ):
${busySummary}

QUY TẮC LẬP KẾ HOẠCH:
1. Nếu người dùng yêu cầu tạo lịch lặp lại (ví dụ: "mỗi tối Thứ 2, 4, 6 trong 3 tuần tới", "mỗi sáng từ mai đến Chủ nhật"), hãy liệt kê đầy đủ từng ngày cụ thể vào mảng "events".
2. Nếu người dùng không nói rõ khoảng kéo dài cho lịch lặp lại theo tuần, mặc định lên kế hoạch cho 2 tuần tới.
3. Nếu người dùng nói buổi sáng/chiều/tối mà không nêu giờ cụ thể, hãy tự chọn khung giờ hợp lý (VD: sáng 08:00-10:00, chiều 14:00-16:00, tối 19:30-21:30) và ưu tiên NÉ các khung giờ đã bận trong LỊCH HIỆN CÓ ở trên.
4. Nếu người dùng yêu cầu chỉnh sửa kế hoạch vừa đề xuất ở tin nhắn trước (VD: "đổi sang 20h", "bỏ ngày thứ 7", "thêm 1 tuần nữa"), hãy trả về mảng "events" MỚI đã được cập nhật đầy đủ theo ý người dùng.
5. Nếu yêu cầu chưa đủ thông tin hoặc chỉ là câu hỏi trò chuyện thông thường, hãy trả lời thân thiện trong "reply" và để "events" là mảng rỗng [].
6. Luôn trả lời bằng tiếng Việt tự nhiên, rõ ràng, thân thiện.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON OBJECT HỢP LỆ, KHÔNG BỌC MARKDOWN):
{
  "reply": "Lời giải thích ngắn gọn về kế hoạch đã sắp xếp, lưu ý nếu có điều chỉnh giờ để tránh trùng lịch...",
  "planTitle": "Tiêu đề ngắn gọn của kế hoạch (VD: Kế hoạch ôn tập Toán & Tiếng Anh - 2 tuần)",
  "events": [
    {
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "title": "Tên sự kiện / môn học",
      "code": "Mã hoặc nhãn ngắn in hoa (VD: STUDY, EXAM, WORK, SPORT, KMA... tối đa 15 ký tự)",
      "room": "Địa điểm / Phòng / Online (để chuỗi rỗng nếu không có)",
      "teacher": "Ghi chú thêm hoặc giảng viên (để chuỗi rỗng nếu không có)",
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

export function normalizeProposedEvent(rawEvent, index = 0, existingEvents = []) {
  if (!rawEvent || typeof rawEvent !== 'object') return null
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

  const rawEvents = Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_AI_PROPOSED_EVENTS) : []
  const events = rawEvents
    .map((item, index) => normalizeProposedEvent(item, index, existingEvents))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title))

  const reply = cleanText(parsed.reply, 3000) || (
    events.length
      ? `Mình đã lập kế hoạch gồm ${events.length} sự kiện theo yêu cầu của bạn. Bạn hãy kiểm tra và bấm chốt để thêm vào lịch nhé!`
      : 'Mình chưa tìm thấy thông tin ngày giờ cụ thể để tạo lịch. Bạn có thể mô tả rõ hơn thời gian và nội dung lịch mong muốn không?'
  )
  const planTitle = cleanText(parsed.planTitle, 160) || (events.length ? `Kế hoạch đề xuất (${events.length} lịch)` : '')

  return {
    reply,
    planTitle,
    events,
  }
}
