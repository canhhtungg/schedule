import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_RELAY_SECONDS,
  decryptPayload,
  encryptPayload,
  eventStartUtcMs,
  nextDelivery,
  planReminders,
} from '../server/notifications.js'
import {
  createNotificationConfigHandler,
  createNotificationDeliverHandler,
  createNotificationScheduleHandler,
  createNotificationTestHandler,
} from '../server/notificationHandlers.js'

const PAYLOAD_KEY = Buffer.alloc(32, 7).toString('base64')
const ENV = {
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  VAPID_PUBLIC_KEY: 'B'.repeat(87),
  VAPID_PRIVATE_KEY: 'p'.repeat(43),
  VAPID_SUBJECT: 'mailto:admin@example.com',
  NOTIFICATION_PAYLOAD_KEY: PAYLOAD_KEY,
  APP_ORIGIN: 'https://planner.example.com',
}

function response() {
  const headers = {}
  return {
    statusCode: 0,
    headers,
    setHeader(name, value) { headers[name.toLowerCase()] = value },
    end(value) { this.payload = JSON.parse(value) },
  }
}

async function invoke(handler, { method = 'POST', body, headers = {} } = {}) {
  const res = response()
  await handler({ method, body, headers }, res)
  return res
}

function browserHeaders() {
  return { 'content-type': 'application/json', origin: ENV.APP_ORIGIN, 'sec-fetch-site': 'same-origin' }
}

function subscription() {
  return { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'A'.repeat(65), auth: 'a'.repeat(22) } }
}

test('Bangkok event time is converted with a fixed UTC+7 offset', () => {
  const originalTimezone = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(eventStartUtcMs({ date: '2026-09-30', time: '07:30 – 09:20' }), Date.parse('2026-09-30T00:30:00.000Z'))
    assert.equal(eventStartUtcMs({ date: '2026-02-30', time: '07:30' }), null)
    assert.equal(eventStartUtcMs({ date: '2026-09-30', time: '25:00' }), null)
  } finally {
    process.env.TZ = originalTimezone
  }
})

test('reminder planning skips invalid and past events and sorts upcoming reminders', () => {
  const now = Date.parse('2026-09-30T00:00:00Z')
  const reminders = planReminders([
    { id: 'late', date: '2026-10-02', time: '08:00', title: 'Mật mã', room: 'P.401' },
    { id: 'past', date: '2026-09-30', time: '07:00', title: 'Đã qua' },
    { id: 'invalid', date: '2026-10-01', time: '', title: 'Thiếu giờ' },
    { id: 'early', date: '2026-10-01', time: '07:30 - 09:20', title: 'An toàn web' },
  ], 30, now)
  assert.deepEqual(reminders.map((item) => item.id), ['early', 'late'])
  assert.equal(reminders[0].remindAt, Date.parse('2026-10-01T00:00:00Z'))
})

test('AES-256-GCM payload round-trips and rejects tampering', () => {
  const payload = { subscription: subscription(), reminders: [{ title: 'ATTT' }] }
  const encrypted = encryptPayload(payload, PAYLOAD_KEY, () => Buffer.alloc(12, 3))
  assert.deepEqual(decryptPayload(encrypted, PAYLOAD_KEY), payload)
  assert.throws(() => decryptPayload({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }, PAYLOAD_KEY))
})

test('relay delay never exceeds six days', () => {
  const now = Date.parse('2026-09-30T00:00:00Z')
  assert.deepEqual(nextDelivery(now + 20 * 24 * 60 * 60_000, now), { delaySeconds: MAX_RELAY_SECONDS, relay: true })
  assert.deepEqual(nextDelivery(now + 60_000, now), { delaySeconds: 60, relay: false })
})

test('notification config returns stable CONFIG_NOT_READY without secrets', async () => {
  const res = await invoke(createNotificationConfigHandler({ env: {} }), { method: 'GET' })
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.payload, { available: false, publicKey: '', code: 'CONFIG_NOT_READY', message: 'Thông báo chưa được cấu hình trên máy chủ.' })
  assert.match(res.headers['cache-control'], /no-store/)
})

test('schedule validates browser input, cancels prior chain, and publishes encrypted data', async () => {
  const published = []
  const cancelled = []
  const qstash = {
    messages: { cancel: async (value) => { cancelled.push(value); return { cancelled: 1 } } },
    publishJSON: async (value) => { published.push(value); return { messageId: 'msg_new' } },
  }
  const now = Date.parse('2026-09-30T00:00:00Z')
  const handler = createNotificationScheduleHandler({ env: ENV, qstash, now: () => now, random: () => Buffer.alloc(16, 2) })
  const res = await invoke(handler, {
    body: {
      subscription: subscription(),
      leadMinutes: 30,
      events: [{ id: 'event-1', date: '2026-10-20', time: '07:30 – 09:20', title: 'An toàn web', room: 'P.401' }],
      previousMessageId: 'msg_old',
      previousChainId: '1'.repeat(32),
    },
    headers: browserHeaders(),
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.messageId, 'msg_new')
  assert.equal(res.payload.count, 1)
  assert.equal(published.length, 1)
  assert.equal(published[0].delay, MAX_RELAY_SECONDS)
  assert.equal(published[0].redact, undefined)
  assert.equal(published[0].timeout, undefined)
  assert.equal(published[0].url, `${ENV.APP_ORIGIN}/api/notifications/deliver`)
  assert.equal(decryptPayload(published[0].body, PAYLOAD_KEY).subscription.endpoint, subscription().endpoint)
  assert.deepEqual(cancelled[0], 'msg_old')
  assert.deepEqual(cancelled[1], { filter: { label: `notification-chain-${'1'.repeat(32)}` } })
})

test('schedule falls back from the legacy QStash URL to the token region', async () => {
  const attempted = []
  const handler = createNotificationScheduleHandler({
    env: ENV,
    now: () => Date.parse('2026-09-30T00:00:00Z'),
    qstashClientFactory: ({ baseUrl }) => ({
      messages: { cancel: async () => ({ cancelled: 0 }) },
      publishJSON: async () => {
        attempted.push(baseUrl)
        if (baseUrl === 'https://qstash.upstash.io') throw Object.assign(new Error('not found'), { status: 404 })
        return { messageId: 'msg_regional' }
      },
    }),
  })
  const res = await invoke(handler, {
    body: { subscription: subscription(), leadMinutes: 30, events: [{ id: 'one', date: '2026-10-02', time: '08:00', title: 'Mật mã' }] },
    headers: browserHeaders(),
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.messageId, 'msg_regional')
  assert.deepEqual(attempted, ['https://qstash.upstash.io', 'https://qstash-us-east-1.upstash.io'])
})

test('schedule maps QStash plan and authentication failures safely', async () => {
  for (const [status, code] of [[401, 'QSTASH_AUTH_FAILED'], [429, 'QSTASH_QUOTA_EXCEEDED'], [400, 'QSTASH_REQUEST_REJECTED']]) {
    const qstash = {
      messages: { cancel: async () => {} },
      publishJSON: async () => { throw Object.assign(new Error('upstream details'), { status }) },
    }
    const handler = createNotificationScheduleHandler({ env: ENV, qstash, now: () => Date.parse('2026-09-30T00:00:00Z') })
    const res = await invoke(handler, {
      body: { subscription: subscription(), leadMinutes: 30, events: [{ id: 'one', date: '2026-10-02', time: '08:00', title: 'Mật mã' }] },
      headers: browserHeaders(),
    })
    assert.equal(res.payload.code, code)
    assert.doesNotMatch(res.payload.message, /upstream details/)
  }
})

test('schedule rejects cross-origin and invalid lead time before publishing', async () => {
  let calls = 0
  const qstash = { messages: { cancel: async () => {} }, publishJSON: async () => { calls += 1 } }
  const handler = createNotificationScheduleHandler({ env: ENV, qstash })
  const crossOrigin = await invoke(handler, { body: {}, headers: { ...browserHeaders(), origin: 'https://evil.example' } })
  assert.equal(crossOrigin.statusCode, 403)
  const invalidLead = await invoke(handler, { body: { subscription: subscription(), leadMinutes: 10, events: [] }, headers: browserHeaders() })
  assert.equal(invalidLead.statusCode, 400)
  assert.equal(invalidLead.payload.code, 'INVALID_LEAD_MINUTES')
  assert.equal(calls, 0)
})

test('test endpoint sends an immediate fixed Web Push payload', async () => {
  let sent
  const now = Date.parse('2026-09-30T15:00:00Z')
  const handler = createNotificationTestHandler({
    env: ENV,
    now: () => now,
    sendPush: async (...args) => { sent = args },
  })
  const res = await invoke(handler, { body: { subscription: subscription() }, headers: browserHeaders() })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, { sent: true })
  assert.equal(sent[0].endpoint, subscription().endpoint)
  assert.equal(sent[1].title, 'Thông báo thử')
  assert.equal(sent[1].body, 'Ngay bây giờ')
  assert.equal(sent[1].tag, `notification-test-${now}`)
})

test('test endpoint reports an expired subscription', async () => {
  const handler = createNotificationTestHandler({
    env: ENV,
    sendPush: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }) },
  })
  const res = await invoke(handler, { body: { subscription: subscription() }, headers: browserHeaders() })
  assert.equal(res.statusCode, 410)
  assert.equal(res.payload.code, 'SUBSCRIPTION_EXPIRED')
})

test('delivery verifies raw body before decrypting and sends a due push', async () => {
  const now = Date.parse('2026-09-30T00:00:00Z')
  const chainId = '2'.repeat(32)
  const encrypted = encryptPayload({
    chainId,
    subscription: subscription(),
    reminders: [{ id: 'event-1', date: '2026-09-30', title: 'Mật mã học', time: '07:30 – 09:20', room: 'P.402', remindAt: now }],
    index: 0,
    hop: 0,
  }, PAYLOAD_KEY)
  const raw = Buffer.from(JSON.stringify(encrypted))
  let verifiedBody = ''
  let sent
  const handler = createNotificationDeliverHandler({
    env: ENV,
    now: () => now,
    qstash: { publishJSON: async () => { throw new Error('should not publish') }, messages: { cancel: async () => {} } },
    receiver: { verify: async ({ body }) => { verifiedBody = body; return true } },
    sendPush: async (...args) => { sent = args },
  })
  const res = await invoke(handler, { body: raw, headers: { 'upstash-signature': 'signed' } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.complete, true)
  assert.equal(verifiedBody, raw.toString('utf8'))
  assert.equal(sent[0].endpoint, subscription().endpoint)
  assert.equal(sent[1].title, 'Mật mã học · P.402')
  assert.equal(sent[1].body, 'Lúc 07:30 – 09:20')
  assert.equal(sent[1].data.url, '/?date=2026-09-30')
})

test('delivery rejects an invalid signature without decrypting or sending', async () => {
  let sent = false
  const handler = createNotificationDeliverHandler({
    env: ENV,
    receiver: { verify: async () => false },
    qstash: { messages: { cancel: async () => {} } },
    sendPush: async () => { sent = true },
  })
  const res = await invoke(handler, { body: Buffer.from('{"not":"encrypted"}'), headers: { 'upstash-signature': 'bad' } })
  assert.equal(res.statusCode, 401)
  assert.equal(res.payload.code, 'INVALID_SIGNATURE')
  assert.equal(sent, false)
})

test('service worker contains push and safe notification click handlers', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(source, /addEventListener\('push'/)
  assert.match(source, /showNotification/)
  assert.match(source, /addEventListener\('notificationclick'/)
  assert.match(source, /candidate\.origin === self\.location\.origin/)
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/)
})
