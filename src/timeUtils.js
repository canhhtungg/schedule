const TIME_TOKEN = /(?:^|\D)([01]?\d|2[0-3])[:h]([0-5]\d)(?=\D|$)/gi
const TIME_VALUE = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function parseTimeRange(value) {
  const matches = [...String(value || '').matchAll(TIME_TOKEN)]
    .slice(0, 2)
    .map((match) => `${match[1].padStart(2, '0')}:${match[2]}`)
  return { startTime: matches[0] || '', endTime: matches[1] || '' }
}

export function formatTimeRange(startTime, endTime) {
  const start = String(startTime || '').trim()
  const end = String(endTime || '').trim()
  if (!start && !end) return ''
  if (!TIME_VALUE.test(start)) throw new TypeError('Giờ bắt đầu không hợp lệ.')
  if (end && !TIME_VALUE.test(end)) throw new TypeError('Giờ kết thúc không hợp lệ.')
  if (end && end <= start) throw new TypeError('Giờ kết thúc phải sau giờ bắt đầu.')
  return end ? `${start} – ${end}` : start
}
