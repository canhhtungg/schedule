import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from '@e965/xlsx'
import { createHealthHandler, createImportScheduleHandler, createScheduleHandler, MAX_HTML_BYTES } from '../server/apiHandlers.js'

function request(method, body, contentType = 'application/json') {
  return { method, body, headers: { 'content-type': contentType } }
}

function response() {
  const headers = {}
  return {
    statusCode: 0,
    setHeader(name, value) { headers[name.toLowerCase()] = value },
    end(payload) { this.payload = JSON.parse(payload) },
    headers,
  }
}

async function invoke(handler, body, method = 'POST', contentType = 'application/json') {
  const res = response()
  await handler(request(method, body, contentType), res)
  return res
}

test('GET /api/health returns no-store health metadata', async () => {
  const res = await invoke(createHealthHandler(), undefined, 'GET')
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, { ok: true, service: 'kma-schedule', upstreamTransport: 'http' })
  assert.match(res.headers['cache-control'], /no-store/)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
})

test('login validation rejects missing credentials without calling QLĐT', async () => {
  let upstreamCalls = 0
  const handler = createScheduleHandler({ fetchSchedule: async () => { upstreamCalls += 1; return [] } })
  const res = await invoke(handler, { username: 'student', password: '' })
  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.code, 'MISSING_CREDENTIALS')
  assert.equal(upstreamCalls, 0)
})

test('valid QLĐT input uses injected dependency and scrubs password', async () => {
  let received
  const body = { username: ' student ', password: 'private' }
  const handler = createScheduleHandler({ fetchSchedule: async (...args) => { received = args; return [{ id: 'event-1' }] }, timeoutMs: 3210, maxBodyBytes: 6543 })
  const res = await invoke(handler, body)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(received, ['student', 'private', { timeoutMs: 3210, maxBodyBytes: 6543 }])
  assert.deepEqual(res.payload.events, [{ id: 'event-1' }])
  assert.equal(res.payload.mode, 'qldt')
  assert.equal(body.password, '')
  assert.doesNotMatch(JSON.stringify(res.payload), /private/)
})

test('login endpoint keeps its narrow body, JSON, and method limits', async (t) => {
  const handler = createScheduleHandler({ fetchSchedule: async () => [] })
  await t.test('oversized JSON', async () => {
    const res = await invoke(handler, { username: 'student', password: 'x', padding: 'x'.repeat(9 * 1024) })
    assert.equal(res.statusCode, 413)
    assert.equal(res.payload.code, 'REQUEST_TOO_LARGE')
  })
  await t.test('content type', async () => {
    const res = await invoke(handler, {}, 'POST', 'text/plain')
    assert.equal(res.statusCode, 415)
  })
  await t.test('method', async () => {
    const res = await invoke(handler, undefined, 'GET')
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers.allow, 'POST')
  })
})

test('POST /api/import/schedule parses HTML and returns normalized events', async () => {
  const html = '<table><tr><th>Ngày</th><th>Môn học</th><th>Giảng viên</th></tr><tr><td>30/09/2026</td><td>An toàn web</td><td>GV. Lan</td></tr></table>'
  const res = await invoke(createImportScheduleHandler(), { sourceType: 'html', content: html })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.mode, 'import')
  assert.equal(res.payload.events.length, 1)
  assert.deepEqual(res.payload.events[0].teacher, 'GV. Lan')
  assert.equal(res.payload.events[0].room, '')
  assert.match(res.headers['cache-control'], /no-store/)
})

test('POST /api/import/schedule parses a strict base64 workbook', async () => {
  const worksheet = {
    B9: { t: 's', v: 'Giảng viên' }, B10: { t: 's', v: 'TS. Nguyễn An' },
    F10: { t: 's', v: 'AT101 - Nhập môn ATTT' },
    G10: { t: 's', v: 'Từ 28/09/2026 đến 05/10/2026: Thứ 2 tiết 1,2,3 tại P.401' },
    '!ref': 'A1:G10',
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TKB')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const res = await invoke(createImportScheduleHandler(), { sourceType: 'excel', filename: 'tkb.xlsx', contentBase64: bytes.toString('base64') })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.events.length, 2)
  assert.ok(res.payload.events.every((event) => event.teacher === 'TS. Nguyễn An'))
})

test('import rejects invalid, empty/configuration, and oversized inputs', async (t) => {
  const handler = createImportScheduleHandler()
  await t.test('invalid base64', async () => {
    const res = await invoke(handler, { sourceType: 'excel', filename: 'tkb.xlsx', contentBase64: 'not base64' })
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'INVALID_BASE64')
  })
  await t.test('unsupported filename', async () => {
    const res = await invoke(handler, { sourceType: 'excel', filename: 'tkb.txt', contentBase64: 'AAAA' })
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'INVALID_FILE')
  })
  await t.test('HTML without events', async () => {
    const res = await invoke(handler, { sourceType: 'html', content: '<html><body>Trang cấu hình học kỳ</body></html>' })
    assert.equal(res.statusCode, 422)
    assert.equal(res.payload.code, 'NO_SCHEDULE_EVENTS')
  })
  await t.test('oversized HTML', async () => {
    const res = await invoke(handler, { sourceType: 'html', content: `<!--${'x'.repeat(MAX_HTML_BYTES)}-->` })
    assert.equal(res.statusCode, 413)
    assert.equal(res.payload.code, 'HTML_TOO_LARGE')
  })
  await t.test('oversized decoded workbook', async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 1)
    const res = await invoke(handler, { sourceType: 'excel', filename: 'tkb.xlsx', contentBase64: bytes.toString('base64') })
    assert.equal(res.statusCode, 413)
    assert.equal(res.payload.code, 'EXCEL_TOO_LARGE')
  })
})
