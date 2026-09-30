import { randomBytes } from 'node:crypto'
import { Client, Receiver } from '@upstash/qstash'
import webPush from 'web-push'
import {
  LEAD_MINUTES,
  MAX_NOTIFICATION_EVENTS,
  decryptPayload,
  encryptPayload,
  nextDelivery,
  notificationForReminder,
  notificationForTest,
  parsePayloadKey,
  planReminders,
} from './notifications.js'

const MAX_SCHEDULE_BODY_BYTES = 512 * 1024
const MAX_DELIVER_BODY_BYTES = 1024 * 1024
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,200}$/
const CHAIN_ID_RE = /^[a-f0-9]{32}$/
const API_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

class NotificationApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status
  for (const [name, value] of Object.entries({ ...API_HEADERS, ...extraHeaders })) response.setHeader(name, value)
  response.end(JSON.stringify(payload))
}

function methodGuard(request, response, method) {
  if (request.method === method) return false
  sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: method })
  return true
}

function requestHeader(request, name) {
  if (typeof request.get === 'function') return request.get(name)
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function notificationConfig(env) {
  const names = [
    'QSTASH_TOKEN',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    'NOTIFICATION_PAYLOAD_KEY',
    'APP_ORIGIN',
  ]
  if (names.some((name) => typeof env[name] !== 'string' || !env[name].trim())) return null
  try {
    parsePayloadKey(env.NOTIFICATION_PAYLOAD_KEY)
    const origin = new URL(env.APP_ORIGIN)
    if (origin.username || origin.password || (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1')) return null
    if (!/^mailto:[^\s@]+@[^\s@]+$/i.test(env.VAPID_SUBJECT)) return null
    if (!/^[A-Za-z0-9_-]{40,120}$/.test(env.VAPID_PUBLIC_KEY) || !/^[A-Za-z0-9_-]{30,100}$/.test(env.VAPID_PRIVATE_KEY)) return null
    return { ...env, APP_ORIGIN: origin.origin }
  } catch {
    return null
  }
}

function assertConfigured(env) {
  const config = notificationConfig(env)
  if (!config) throw new NotificationApiError(503, 'CONFIG_NOT_READY', 'Thông báo chưa được cấu hình trên máy chủ.')
  return config
}

function assertSameOrigin(request, config) {
  const origin = requestHeader(request, 'origin')
  const fetchSite = requestHeader(request, 'sec-fetch-site')
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    throw new NotificationApiError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được phép.')
  }
  if (!origin) throw new NotificationApiError(403, 'ORIGIN_NOT_ALLOWED', 'Thiếu Origin hợp lệ.')
  let parsed
  try { parsed = new URL(origin).origin } catch { throw new NotificationApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin không hợp lệ.') }
  if (parsed !== config.APP_ORIGIN) throw new NotificationApiError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được phép.')
}

function bodyBytes(value) {
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') return Buffer.from(value)
  return Buffer.from(JSON.stringify(value ?? null))
}

async function readRawBody(request, maxBytes) {
  if (request.rawBody !== undefined) {
    const raw = bodyBytes(request.rawBody)
    if (raw.length > maxBytes) throw new NotificationApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    return raw
  }
  if (request.body !== undefined) {
    const raw = bodyBytes(request.body)
    if (raw.length > maxBytes) throw new NotificationApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    return raw
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new NotificationApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(request, maxBytes) {
  if (!/^application\/json(?:\s*;|$)/i.test(requestHeader(request, 'content-type') || '')) {
    throw new NotificationApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type phải là application/json.')
  }
  const declaredLength = Number(requestHeader(request, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new NotificationApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  let value
  if (request.body && !Buffer.isBuffer(request.body) && typeof request.body === 'object') {
    if (bodyBytes(request.body).length > maxBytes) throw new NotificationApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    value = request.body
  } else {
    try { value = JSON.parse((await readRawBody(request, maxBytes)).toString('utf8')) } catch { throw new NotificationApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.') }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new NotificationApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là một JSON object.')
  return value
}

function validateSubscription(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NotificationApiError(400, 'INVALID_SUBSCRIPTION', 'Push subscription không hợp lệ.')
  let endpoint
  try { endpoint = new URL(value.endpoint) } catch { throw new NotificationApiError(400, 'INVALID_SUBSCRIPTION', 'Push endpoint không hợp lệ.') }
  if (endpoint.protocol !== 'https:' || value.endpoint.length > 2048) throw new NotificationApiError(400, 'INVALID_SUBSCRIPTION', 'Push endpoint phải dùng HTTPS.')
  const p256dh = value.keys?.p256dh
  const auth = value.keys?.auth
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(auth)) {
    throw new NotificationApiError(400, 'INVALID_SUBSCRIPTION', 'Push subscription thiếu khóa hợp lệ.')
  }
  return { endpoint: endpoint.href, expirationTime: null, keys: { p256dh, auth } }
}

function validateEvents(value) {
  if (!Array.isArray(value) || value.length > MAX_NOTIFICATION_EVENTS) throw new NotificationApiError(400, 'INVALID_EVENTS', `Tối đa ${MAX_NOTIFICATION_EVENTS} sự kiện.`)
  for (const event of value) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new NotificationApiError(400, 'INVALID_EVENTS', 'Danh sách sự kiện không hợp lệ.')
    for (const [key, max] of [['id', 120], ['date', 10], ['title', 200], ['time', 100], ['room', 100]]) {
      if (event[key] !== undefined && (typeof event[key] !== 'string' || event[key].length > max)) throw new NotificationApiError(400, 'INVALID_EVENTS', 'Dữ liệu sự kiện vượt giới hạn.')
    }
  }
  return value
}

function labelFor(chainId) {
  return `notification-chain-${chainId}`
}

function createServices(config, dependencies) {
  return {
    qstash: dependencies.qstash || new Client({ token: config.QSTASH_TOKEN, enableTelemetry: false }),
    receiver: dependencies.receiver || new Receiver({ currentSigningKey: config.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: config.QSTASH_NEXT_SIGNING_KEY }),
    sendPush: dependencies.sendPush || ((subscription, payload) => webPush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: 'high',
      vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY },
    })),
  }
}

async function cancelPending(qstash, messageId, chainId) {
  if (messageId && MESSAGE_ID_RE.test(messageId)) {
    try { await qstash.messages.cancel(messageId) } catch { /* Best effort: it may already be in flight or delivered. */ }
  }
  if (chainId && CHAIN_ID_RE.test(chainId)) {
    try { await qstash.messages.cancel({ filter: { label: labelFor(chainId) } }) } catch { /* The exact ID cancellation above is still useful. */ }
  }
}

async function publishEncrypted(qstash, config, payload, nowMs) {
  const current = payload.reminders[payload.index]
  if (!current) return null
  const { delaySeconds } = nextDelivery(current.remindAt, nowMs)
  const body = encryptPayload(payload, config.NOTIFICATION_PAYLOAD_KEY)
  const result = await qstash.publishJSON({
    url: `${config.APP_ORIGIN}/api/notifications/deliver`,
    body,
    delay: delaySeconds,
    retries: 3,
    timeout: 30,
    deduplicationId: `${payload.chainId}-${payload.index}-${payload.hop}`,
    label: labelFor(payload.chainId),
    redact: { body: true },
  })
  return result.messageId
}

function handleError(response, error) {
  if (error instanceof NotificationApiError) return sendJson(response, error.status, { code: error.code, message: error.message })
  return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu thông báo.' })
}

export function createNotificationConfigHandler({ env = process.env } = {}) {
  return async function notificationConfigHandler(request, response) {
    if (methodGuard(request, response, 'GET')) return
    const config = notificationConfig(env)
    if (!config) return sendJson(response, 503, { available: false, publicKey: '', code: 'CONFIG_NOT_READY', message: 'Thông báo chưa được cấu hình trên máy chủ.' })
    return sendJson(response, 200, { available: true, publicKey: config.VAPID_PUBLIC_KEY })
  }
}

export function createNotificationScheduleHandler({ env = process.env, now = Date.now, random = randomBytes, ...dependencies } = {}) {
  return async function notificationScheduleHandler(request, response) {
    try {
      if (methodGuard(request, response, 'POST')) return
      const config = assertConfigured(env)
      assertSameOrigin(request, config)
      const body = await readJson(request, MAX_SCHEDULE_BODY_BYTES)
      const subscription = validateSubscription(body.subscription)
      if (!LEAD_MINUTES.includes(body.leadMinutes)) throw new NotificationApiError(400, 'INVALID_LEAD_MINUTES', 'Chỉ hỗ trợ nhắc trước 15, 30, 45 hoặc 60 phút.')
      const events = validateEvents(body.events)
      const previousMessageId = typeof body.previousMessageId === 'string' ? body.previousMessageId : ''
      const previousChainId = typeof body.previousChainId === 'string' ? body.previousChainId : ''
      if (previousMessageId && !MESSAGE_ID_RE.test(previousMessageId)) throw new NotificationApiError(400, 'INVALID_MESSAGE_ID', 'Message ID không hợp lệ.')
      if (previousChainId && !CHAIN_ID_RE.test(previousChainId)) throw new NotificationApiError(400, 'INVALID_CHAIN_ID', 'Chain ID không hợp lệ.')

      const services = createServices(config, dependencies)
      await cancelPending(services.qstash, previousMessageId, previousChainId)
      const reminders = planReminders(events, body.leadMinutes, now())
      if (!reminders.length) return sendJson(response, 200, { messageId: null, chainId: null, count: 0 })
      const chainId = random(16).toString('hex')
      const messageId = await publishEncrypted(services.qstash, config, { chainId, subscription, reminders, index: 0, hop: 0 }, now())
      return sendJson(response, 200, { messageId, chainId, count: reminders.length })
    } catch (error) {
      return handleError(response, error)
    }
  }
}

export function createNotificationCancelHandler({ env = process.env, ...dependencies } = {}) {
  return async function notificationCancelHandler(request, response) {
    try {
      if (methodGuard(request, response, 'POST')) return
      const config = assertConfigured(env)
      assertSameOrigin(request, config)
      const body = await readJson(request, 1024)
      const messageId = typeof body.messageId === 'string' ? body.messageId : ''
      const chainId = typeof body.chainId === 'string' ? body.chainId : ''
      if (!messageId && !chainId) throw new NotificationApiError(400, 'INVALID_MESSAGE_ID', 'Thiếu message ID cần hủy.')
      if (messageId && !MESSAGE_ID_RE.test(messageId)) throw new NotificationApiError(400, 'INVALID_MESSAGE_ID', 'Message ID không hợp lệ.')
      if (chainId && !CHAIN_ID_RE.test(chainId)) throw new NotificationApiError(400, 'INVALID_CHAIN_ID', 'Chain ID không hợp lệ.')
      const { qstash } = createServices(config, dependencies)
      await cancelPending(qstash, messageId, chainId)
      return sendJson(response, 200, { cancelled: true })
    } catch (error) {
      return handleError(response, error)
    }
  }
}

export function createNotificationTestHandler({ env = process.env, now = Date.now, ...dependencies } = {}) {
  return async function notificationTestHandler(request, response) {
    try {
      if (methodGuard(request, response, 'POST')) return
      const config = assertConfigured(env)
      assertSameOrigin(request, config)
      const body = await readJson(request, 8 * 1024)
      const subscription = validateSubscription(body.subscription)
      const { sendPush } = createServices(config, dependencies)
      try {
        await sendPush(subscription, notificationForTest(now()))
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          throw new NotificationApiError(410, 'SUBSCRIPTION_EXPIRED', 'Đăng ký thông báo đã hết hạn. Hãy tắt rồi bật lại thông báo.')
        }
        throw error
      }
      return sendJson(response, 200, { sent: true })
    } catch (error) {
      return handleError(response, error)
    }
  }
}

export function createNotificationDeliverHandler({ env = process.env, now = Date.now, ...dependencies } = {}) {
  return async function notificationDeliverHandler(request, response) {
    try {
      if (methodGuard(request, response, 'POST')) return
      const config = assertConfigured(env)
      const raw = await readRawBody(request, MAX_DELIVER_BODY_BYTES)
      const signature = requestHeader(request, 'upstash-signature')
      if (typeof signature !== 'string' || !signature) throw new NotificationApiError(401, 'INVALID_SIGNATURE', 'Chữ ký QStash không hợp lệ.')
      const services = createServices(config, dependencies)
      let verified = false
      try {
        verified = await services.receiver.verify({ signature, body: raw.toString('utf8'), url: `${config.APP_ORIGIN}/api/notifications/deliver` })
      } catch {
        throw new NotificationApiError(401, 'INVALID_SIGNATURE', 'Chữ ký QStash không hợp lệ.')
      }
      if (!verified) throw new NotificationApiError(401, 'INVALID_SIGNATURE', 'Chữ ký QStash không hợp lệ.')

      let encrypted
      try { encrypted = JSON.parse(raw.toString('utf8')) } catch { throw new NotificationApiError(400, 'INVALID_PAYLOAD', 'Payload không hợp lệ.') }
      let payload
      try { payload = decryptPayload(encrypted, config.NOTIFICATION_PAYLOAD_KEY) } catch { throw new NotificationApiError(400, 'INVALID_PAYLOAD', 'Payload không hợp lệ.') }
      if (!payload || !CHAIN_ID_RE.test(payload.chainId) || !Array.isArray(payload.reminders) || !Number.isSafeInteger(payload.index) || !Number.isSafeInteger(payload.hop)) {
        throw new NotificationApiError(400, 'INVALID_PAYLOAD', 'Payload không hợp lệ.')
      }
      const reminder = payload.reminders[payload.index]
      if (!reminder) return sendJson(response, 200, { ok: true, complete: true })
      const nowMs = now()
      if (reminder.remindAt > nowMs + 1000) {
        const messageId = await publishEncrypted(services.qstash, config, { ...payload, hop: payload.hop + 1 }, nowMs)
        return sendJson(response, 200, { ok: true, relayed: true, messageId })
      }

      try {
        await services.sendPush(payload.subscription, notificationForReminder(reminder, payload.chainId))
      } catch (error) {
        if (error?.statusCode !== 404 && error?.statusCode !== 410) throw error
        return sendJson(response, 200, { ok: true, terminal: true })
      }

      const nextPayload = { ...payload, index: payload.index + 1, hop: 0 }
      const messageId = await publishEncrypted(services.qstash, config, nextPayload, nowMs)
      return sendJson(response, 200, { ok: true, complete: !messageId, messageId })
    } catch (error) {
      return handleError(response, error)
    }
  }
}
