import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const LEAD_MINUTES = [15, 30, 45, 60]
export const MAX_NOTIFICATION_EVENTS = 500
export const MAX_RELAY_SECONDS = 6 * 24 * 60 * 60
export const BANGKOK_OFFSET_MINUTES = 7 * 60

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?:\D|$)/

export function eventStartUtcMs(event) {
  if (!event || typeof event.date !== 'string' || typeof event.time !== 'string') return null
  const dateMatch = DATE_RE.exec(event.date)
  const timeMatch = TIME_RE.exec(event.time)
  if (!dateMatch || !timeMatch) return null

  const [, yearText, monthText, dayText] = dateMatch
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const calendarCheck = new Date(Date.UTC(year, month - 1, day))
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) return null

  return Date.UTC(year, month - 1, day, hour, minute) - BANGKOK_OFFSET_MINUTES * 60_000
}

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function planReminders(events, leadMinutes, nowMs = Date.now()) {
  if (!LEAD_MINUTES.includes(leadMinutes)) throw new TypeError('leadMinutes không hợp lệ.')
  if (!Array.isArray(events) || events.length > MAX_NOTIFICATION_EVENTS) throw new TypeError('Danh sách sự kiện không hợp lệ.')

  return events.flatMap((event, sourceIndex) => {
    const startAt = eventStartUtcMs(event)
    const title = boundedText(event?.title, 200)
    if (!startAt || !title) return []
    const remindAt = startAt - leadMinutes * 60_000
    if (remindAt <= nowMs) return []
    return [{
      id: boundedText(event.id, 120) || `${event.date}-${sourceIndex}`,
      date: event.date,
      title,
      time: boundedText(event.time, 100),
      room: boundedText(event.room, 100),
      remindAt,
    }]
  }).sort((left, right) => left.remindAt - right.remindAt || left.id.localeCompare(right.id))
}

export function parsePayloadKey(encodedKey) {
  if (typeof encodedKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)) throw new TypeError('Invalid payload key.')
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey) throw new TypeError('Invalid payload key.')
  return key
}

export function encryptPayload(payload, encodedKey, random = randomBytes) {
  const key = parsePayloadKey(encodedKey)
  const iv = random(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('kma-notification-v1'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptPayload(envelope, encodedKey) {
  if (!envelope || envelope.v !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new TypeError('Invalid encrypted payload.')
  }
  const key = parsePayloadKey(encodedKey)
  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  if (iv.length !== 12 || tag.length !== 16) throw new TypeError('Invalid encrypted payload.')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from('kma-notification-v1'))
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

export function nextDelivery(reminderAtMs, nowMs = Date.now()) {
  const targetSeconds = Math.max(0, Math.ceil((reminderAtMs - nowMs) / 1000))
  return {
    delaySeconds: Math.min(targetSeconds, MAX_RELAY_SECONDS),
    relay: targetSeconds > MAX_RELAY_SECONDS,
  }
}

export function notificationForReminder(reminder, chainId) {
  const eventLine = reminder.room ? `${reminder.title} · ${reminder.room}` : reminder.title
  return {
    title: '',
    body: `${eventLine}\nLúc ${reminder.time}`,
    icon: '/system-logo-512.png',
    badge: '/system-logo-512.png',
    tag: `schedule-${chainId}-${reminder.id}-${reminder.remindAt}`.slice(0, 240),
    data: { url: `/?date=${encodeURIComponent(reminder.date)}` },
  }
}

export function notificationForTest(nowMs = Date.now()) {
  return {
    title: 'Thông báo thử',
    body: 'Ngay bây giờ',
    icon: '/system-logo-512.png',
    badge: '/system-logo-512.png',
    tag: `notification-test-${nowMs}`,
    data: { url: '/?notification=test' },
  }
}
