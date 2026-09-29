import { fetchQldtSchedule, QldtError, qldtConnectionNotice } from './qldt.js'

export const MAX_REQUEST_BODY_BYTES = 8 * 1024

const API_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function positiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function header(request, name) {
  if (typeof request.get === 'function') return request.get(name)
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function assertBodySize(body) {
  let encoded
  try {
    encoded = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.')
  }
  if (Buffer.byteLength(encoded || '') > MAX_REQUEST_BODY_BYTES) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  }
}

async function readJson(request) {
  const contentType = header(request, 'content-type') || ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type phải là application/json.')
  }

  const declaredLength = Number(header(request, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  }

  if (request.body !== undefined) {
    assertBodySize(request.body)
    if (request.body === null || Array.isArray(request.body) || typeof request.body !== 'object') {
      throw new ApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là một JSON object.')
    }
    return request.body
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    }
    chunks.push(chunk)
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not an object')
    return parsed
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.')
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status
  for (const [name, value] of Object.entries({ ...API_HEADERS, ...extraHeaders })) response.setHeader(name, value)
  response.end(JSON.stringify(payload))
}

function demoEvents(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return [
    { id: 'demo-1', date: `${year}-${month}-03`, title: 'Cấu trúc dữ liệu', code: 'CS204', time: '07:30 – 09:20', room: 'A-302', teacher: 'GV. Minh Anh', color: 'violet' },
    { id: 'demo-2', date: `${year}-${month}-03`, title: 'Tiếng Anh chuyên ngành', code: 'EN310', time: '13:00 – 14:50', room: 'B-205', teacher: 'GV. Thu Hà', color: 'amber' },
    { id: 'demo-3', date: `${year}-${month}-12`, title: 'An toàn hệ thống', code: 'SE301', time: '07:30 – 10:20', room: 'A-405', teacher: 'GV. Đức Long', color: 'green' },
    { id: 'demo-4', date: `${year}-${month}-19`, title: 'Phát triển Web', code: 'WEB302', time: '07:30 – 10:20', room: 'Lab 2', teacher: 'GV. Quang Huy', color: 'blue' },
  ]
}

export function createHealthHandler() {
  return async function healthHandler(request, response) {
    if (request.method !== 'GET') {
      return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'GET' })
    }
    return sendJson(response, 200, { ok: true, service: 'kma-schedule', upstreamTransport: 'http' })
  }
}

export function createScheduleHandler({
  fetchSchedule = fetchQldtSchedule,
  now = () => new Date(),
  timeoutMs = positiveInt(process.env.QLDT_TIMEOUT_MS, 12_000),
  maxBodyBytes = positiveInt(process.env.QLDT_MAX_BODY_BYTES, 8 * 1024 * 1024),
} = {}) {
  return async function scheduleHandler(request, response) {
    let body
    let password = ''

    try {
      if (request.method !== 'POST') {
        return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'POST' })
      }

      body = await readJson(request)
      const mode = body.mode === undefined ? 'qldt' : body.mode
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      password = typeof body.password === 'string' ? body.password : ''

      if (mode !== 'qldt' && mode !== 'demo') {
        throw new ApiError(400, 'INVALID_INPUT', 'Chế độ đăng nhập không hợp lệ.')
      }
      if (body.username !== undefined && typeof body.username !== 'string') {
        throw new ApiError(400, 'INVALID_INPUT', 'Tài khoản phải là chuỗi ký tự.')
      }
      if (body.password !== undefined && typeof body.password !== 'string') {
        throw new ApiError(400, 'INVALID_INPUT', 'Mật khẩu phải là chuỗi ký tự.')
      }
      if (username.length > 100 || password.length > 256) {
        throw new ApiError(400, 'INVALID_INPUT', 'Thông tin đăng nhập vượt quá độ dài cho phép.')
      }

      if (mode === 'demo') {
        return sendJson(response, 200, { mode, user: username || 'DEMO2026', events: demoEvents(now()), warnings: [] })
      }
      if (!username || !password) {
        throw new ApiError(400, 'MISSING_CREDENTIALS', 'Vui lòng nhập đủ tài khoản và mật khẩu.')
      }

      const events = await fetchSchedule(username, password, { timeoutMs, maxBodyBytes })
      return sendJson(response, 200, { mode, user: username, events, warnings: [qldtConnectionNotice] })
    } catch (error) {
      if (error instanceof ApiError || error instanceof QldtError) {
        return sendJson(response, error.status, { code: error.code, message: error.message })
      }
      return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'Không thể tải lịch học lúc này.' })
    } finally {
      password = ''
      if (body && typeof body === 'object' && Object.hasOwn(body, 'password')) body.password = ''
      if (request.body && typeof request.body === 'object' && Object.hasOwn(request.body, 'password')) request.body.password = ''
    }
  }
}
