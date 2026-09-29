import { fetchQldtSchedule, QldtError } from './qldt.js'
import { parseTimetableHtml } from './parser.js'
import { parseTimetableWorkbook } from './workbookParser.js'

export const MAX_LOGIN_BODY_BYTES = 8 * 1024
export const MAX_HTML_BYTES = 1024 * 1024
export const MAX_EXCEL_BYTES = 3 * 1024 * 1024
export const MAX_IMPORT_BODY_BYTES = Math.ceil(MAX_EXCEL_BYTES * 4 / 3) + 16 * 1024

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

function assertBodySize(body, maxBytes) {
  let encoded
  try {
    encoded = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.')
  }
  if (Buffer.byteLength(encoded || '') > maxBytes) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  }
}

async function readJson(request, maxBytes) {
  const contentType = header(request, 'content-type') || ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type phải là application/json.')
  }

  const declaredLength = Number(header(request, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  }

  if (request.body !== undefined) {
    assertBodySize(request.body, maxBytes)
    if (request.body === null || Array.isArray(request.body) || typeof request.body !== 'object') {
      throw new ApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là một JSON object.')
    }
    return request.body
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
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

function sendKnownError(response, error, fallbackMessage) {
  if (error instanceof ApiError || error instanceof QldtError) {
    return sendJson(response, error.status, { code: error.code, message: error.message })
  }
  return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: fallbackMessage })
}

function strictBase64(value) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_BASE64', 'Nội dung Excel phải là base64 hợp lệ.')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) throw new ApiError(400, 'INVALID_BASE64', 'Nội dung Excel phải là base64 hợp lệ.')
  if (bytes.byteLength > MAX_EXCEL_BYTES) throw new ApiError(413, 'EXCEL_TOO_LARGE', 'File Excel sau giải mã không được vượt quá 3 MB.')
  return bytes
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
  timeoutMs = positiveInt(process.env.QLDT_TIMEOUT_MS, 12_000),
  maxBodyBytes = positiveInt(process.env.QLDT_MAX_BODY_BYTES, 8 * 1024 * 1024),
} = {}) {
  return async function scheduleHandler(request, response) {
    let body
    let password = ''

    try {
      if (request.method !== 'POST') return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'POST' })

      body = await readJson(request, MAX_LOGIN_BODY_BYTES)
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      password = typeof body.password === 'string' ? body.password : ''

      if (body.username !== undefined && typeof body.username !== 'string') throw new ApiError(400, 'INVALID_INPUT', 'Tài khoản phải là chuỗi ký tự.')
      if (body.password !== undefined && typeof body.password !== 'string') throw new ApiError(400, 'INVALID_INPUT', 'Mật khẩu phải là chuỗi ký tự.')
      if (username.length > 100 || password.length > 256) throw new ApiError(400, 'INVALID_INPUT', 'Thông tin đăng nhập vượt quá độ dài cho phép.')
      if (!username || !password) throw new ApiError(400, 'MISSING_CREDENTIALS', 'Vui lòng nhập đủ tài khoản và mật khẩu.')

      const events = await fetchSchedule(username, password, { timeoutMs, maxBodyBytes })
      return sendJson(response, 200, { mode: 'qldt', user: username, events })
    } catch (error) {
      return sendKnownError(response, error, 'Không thể tải lịch học lúc này.')
    } finally {
      password = ''
      if (body && typeof body === 'object' && Object.hasOwn(body, 'password')) body.password = ''
      if (request.body && typeof request.body === 'object' && Object.hasOwn(request.body, 'password')) request.body.password = ''
    }
  }
}

export function createImportScheduleHandler({
  parseHtml = parseTimetableHtml,
  parseWorkbook = parseTimetableWorkbook,
} = {}) {
  return async function importScheduleHandler(request, response) {
    try {
      if (request.method !== 'POST') return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'POST' })
      const body = await readJson(request, MAX_IMPORT_BODY_BYTES)
      let events
      let user

      if (body.sourceType === 'html') {
        if (typeof body.content !== 'string' || !body.content.trim()) throw new ApiError(400, 'INVALID_INPUT', 'Vui lòng dán HTML thời khóa biểu.')
        if (Buffer.byteLength(body.content, 'utf8') > MAX_HTML_BYTES) throw new ApiError(413, 'HTML_TOO_LARGE', 'Nội dung HTML không được vượt quá 1 MB.')
        events = parseHtml(body.content)
        user = 'HTML đã nhập'
      } else if (body.sourceType === 'excel') {
        if (typeof body.filename !== 'string' || !/\.(?:xls|xlsx)$/i.test(body.filename.trim())) throw new ApiError(400, 'INVALID_FILE', 'Chỉ chấp nhận file Excel .xls hoặc .xlsx.')
        if (body.filename.length > 255) throw new ApiError(400, 'INVALID_FILE', 'Tên file quá dài.')
        events = parseWorkbook(strictBase64(body.contentBase64))
        user = body.filename.trim()
      } else {
        throw new ApiError(400, 'INVALID_SOURCE_TYPE', 'Nguồn nhập phải là HTML hoặc Excel.')
      }

      if (!Array.isArray(events) || events.length === 0) {
        throw new ApiError(422, 'NO_SCHEDULE_EVENTS', 'Không tìm thấy sự kiện lịch học. Hãy dùng HTML của trang StudentTimeTable.aspx hoặc file Excel thời khóa biểu.')
      }
      return sendJson(response, 200, { mode: 'import', user, events })
    } catch (error) {
      if (error instanceof ApiError) return sendKnownError(response, error, 'Không thể nhập thời khóa biểu lúc này.')
      if (error instanceof TypeError || error?.name === 'Error') {
        return sendJson(response, 422, { code: 'IMPORT_PARSE_FAILED', message: 'Không thể đọc dữ liệu thời khóa biểu. Hãy kiểm tra lại file hoặc HTML.' })
      }
      return sendKnownError(response, error, 'Không thể nhập thời khóa biểu lúc này.')
    }
  }
}
