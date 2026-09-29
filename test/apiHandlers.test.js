import assert from 'node:assert/strict'
import test from 'node:test'
import { createHealthHandler, createScheduleHandler } from '../server/apiHandlers.js'

function request(method, body, contentType = 'application/json') {
  return { method, body, headers: { 'content-type': contentType } }
}

function response() {
  const headers = {}
  return {
    statusCode: 0,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
    end(payload) {
      this.payload = JSON.parse(payload)
    },
    headers,
  }
}

test('GET /api/health returns no-store health metadata', async () => {
  const res = response()
  await createHealthHandler()(request('GET'), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, { ok: true, service: 'kma-schedule', upstreamTransport: 'http' })
  assert.match(res.headers['cache-control'], /no-store/)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
})

test('demo schedule is handled directly and never calls QLĐT', async () => {
  let upstreamCalls = 0
  const body = { mode: 'demo', username: ' DEMO ', password: 'discard-me' }
  const handler = createScheduleHandler({
    fetchSchedule: async () => {
      upstreamCalls += 1
      return []
    },
    now: () => new Date(2026, 8, 30),
  })
  const res = response()

  await handler(request('POST', body), res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.mode, 'demo')
  assert.equal(res.payload.user, 'DEMO')
  assert.equal(res.payload.events.length, 4)
  assert.equal(res.payload.events[0].date, '2026-09-03')
  assert.equal(upstreamCalls, 0)
  assert.equal(body.password, '')
})

test('validation rejects missing credentials without calling QLĐT', async () => {
  let upstreamCalls = 0
  const handler = createScheduleHandler({
    fetchSchedule: async () => {
      upstreamCalls += 1
      return []
    },
  })
  const res = response()

  await handler(request('POST', { mode: 'qldt', username: 'student', password: '' }), res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.code, 'MISSING_CREDENTIALS')
  assert.equal(upstreamCalls, 0)
})

test('valid QLĐT input uses the injected dependency and scrubs password', async () => {
  let received
  const body = { mode: 'qldt', username: ' student ', password: 'private' }
  const handler = createScheduleHandler({
    fetchSchedule: async (...args) => {
      received = args
      return [{ id: 'event-1' }]
    },
    timeoutMs: 3210,
    maxBodyBytes: 6543,
  })
  const res = response()

  await handler(request('POST', body), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(received, ['student', 'private', { timeoutMs: 3210, maxBodyBytes: 6543 }])
  assert.deepEqual(res.payload.events, [{ id: 'event-1' }])
  assert.equal(body.password, '')
  assert.doesNotMatch(JSON.stringify(res.payload), /private/)
})

test('invalid mode and oversized body are rejected before QLĐT', async (t) => {
  let upstreamCalls = 0
  const handler = createScheduleHandler({
    fetchSchedule: async () => {
      upstreamCalls += 1
      return []
    },
  })

  await t.test('invalid mode', async () => {
    const res = response()
    await handler(request('POST', { mode: 'other', username: 'student', password: 'private' }), res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'INVALID_INPUT')
  })

  await t.test('oversized JSON', async () => {
    const res = response()
    await handler(request('POST', { mode: 'demo', padding: 'x'.repeat(9 * 1024) }), res)
    assert.equal(res.statusCode, 413)
    assert.equal(res.payload.code, 'REQUEST_TOO_LARGE')
  })

  assert.equal(upstreamCalls, 0)
})

test('schedule endpoint requires JSON and POST', async (t) => {
  const handler = createScheduleHandler({ fetchSchedule: async () => [] })

  await t.test('content type', async () => {
    const res = response()
    await handler(request('POST', { mode: 'demo' }, 'text/plain'), res)
    assert.equal(res.statusCode, 415)
    assert.equal(res.payload.code, 'UNSUPPORTED_MEDIA_TYPE')
  })

  await t.test('method', async () => {
    const res = response()
    await handler(request('GET'), res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers.allow, 'POST')
  })
})
