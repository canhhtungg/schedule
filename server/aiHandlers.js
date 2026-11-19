import {
  DEFAULT_GROQ_MODEL,
  FALLBACK_GROQ_MODELS,
  GROQ_API_URL,
  MAX_AI_CONTEXT_EVENTS,
  MAX_AI_MESSAGES,
  MAX_AI_MESSAGE_CHARS,
  bangkokDateKey,
  buildAiSystemPrompt,
  parseAiScheduleResponse,
} from './aiSchedule.js'
import { parseDateKey } from '../src/calendarUtils.js'

export const MAX_AI_BODY_BYTES = 128 * 1024

const API_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

class AiApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'AiApiError'
    this.status = status
    this.code = code
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status
  for (const [name, value] of Object.entries({ ...API_HEADERS, ...extraHeaders })) response.setHeader(name, value)
  response.end(JSON.stringify(payload))
}

function requestHeader(request, name) {
  if (typeof request.get === 'function') return request.get(name)
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function bodyBytes(value) {
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') return Buffer.from(value)
  return Buffer.from(JSON.stringify(value ?? null))
}

async function readJson(request, maxBytes) {
  if (!/^application\/json(?:\s*;|$)/i.test(requestHeader(request, 'content-type') || '')) {
    throw new AiApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type phải là application/json.')
  }

  const declaredLength = Number(requestHeader(request, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AiApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
  }

  if (request.body !== undefined && !Buffer.isBuffer(request.body)) {
    if (bodyBytes(request.body).length > maxBytes) {
      throw new AiApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    }
    if (!request.body || Array.isArray(request.body) || typeof request.body !== 'object') {
      throw new AiApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là một JSON object.')
    }
    return request.body
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new AiApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt quá giới hạn cho phép.')
    chunks.push(chunk)
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not an object')
    return parsed
  } catch {
    throw new AiApiError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không hợp lệ.')
  }
}

function resolveAiConfig(env) {
  const apiKey = typeof env.GROQ_API_KEY === 'string' ? env.GROQ_API_KEY.trim() : ''
  if (!apiKey) return null
  const model = (typeof env.GROQ_MODEL === 'string' && env.GROQ_MODEL.trim()) ? env.GROQ_MODEL.trim() : DEFAULT_GROQ_MODEL
  const parsedTimeout = Number(env.GROQ_TIMEOUT_MS)
  const timeoutMs = Number.isSafeInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 25_000
  return { apiKey, model, timeoutMs }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AiApiError(400, 'INVALID_MESSAGES', 'Vui lòng nhập nội dung yêu cầu lịch trình.')
  }
  if (messages.length > MAX_AI_MESSAGES) {
    throw new AiApiError(400, 'TOO_MANY_MESSAGES', `Tối đa ${MAX_AI_MESSAGES} tin nhắn trong một lượt phân tích.`)
  }

  const normalized = []
  for (const item of messages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new AiApiError(400, 'INVALID_MESSAGES', 'Định dạng tin nhắn không hợp lệ.')
    }
    const role = item.role === 'assistant' ? 'assistant' : (item.role === 'user' ? 'user' : '')
    if (!role) throw new AiApiError(400, 'INVALID_MESSAGES', 'Vai trò tin nhắn chỉ được là user hoặc assistant.')
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!content) throw new AiApiError(400, 'INVALID_MESSAGES', 'Nội dung tin nhắn không được để trống.')
    if (content.length > MAX_AI_MESSAGE_CHARS) {
      throw new AiApiError(400, 'MESSAGE_TOO_LONG', `Tin nhắn không được vượt quá ${MAX_AI_MESSAGE_CHARS} ký tự.`)
    }
    normalized.push({ role, content })
  }

  if (normalized[normalized.length - 1].role !== 'user') {
    throw new AiApiError(400, 'INVALID_MESSAGES', 'Tin nhắn cuối cùng phải từ người dùng.')
  }

  return normalized
}

function validateExistingEvents(events) {
  if (events === undefined || events === null) return []
  if (!Array.isArray(events)) throw new AiApiError(400, 'INVALID_EVENTS', 'Danh sách sự kiện hiện tại không hợp lệ.')
  return events
    .slice(0, MAX_AI_CONTEXT_EVENTS)
    .filter((item) => item && typeof item === 'object' && typeof item.date === 'string' && parseDateKey(item.date))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.slice(0, 120) : '',
      date: item.date,
      title: typeof item.title === 'string' ? item.title.slice(0, 200) : '',
      time: typeof item.time === 'string' ? item.time.slice(0, 100) : '',
      room: typeof item.room === 'string' ? item.room.slice(0, 100) : '',
      code: typeof item.code === 'string' ? item.code.slice(0, 50) : '',
      color: typeof item.color === 'string' ? item.color.slice(0, 20) : '',
    }))
}

function isModelUnavailableError(status, errorPayload) {
  if (status === 404) return true
  const code = String(errorPayload?.code || '').toLowerCase()
  const message = String(errorPayload?.message || '').toLowerCase()
  return (
    code === 'model_not_found'
    || code === 'model_decommissioned'
    || message.includes('does not exist or you do not have access')
    || message.includes('has been decommissioned')
    || message.includes('model not found')
  )
}

async function defaultCallGroq({ apiKey, model, timeoutMs, systemPrompt, messages, fetchImpl = globalThis.fetch }) {
  const candidateModels = [...new Set([model, ...FALLBACK_GROQ_MODELS].filter(Boolean))]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let lastUpstreamMsg = ''

    for (let index = 0; index < candidateModels.length; index += 1) {
      const candidateModel = candidateModels[index]
      const response = await fetchImpl(GROQ_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.2,
          max_completion_tokens: 8192,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }),
        signal: controller.signal,
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const upstreamMsg = data?.error?.message || ''
        lastUpstreamMsg = upstreamMsg
        if (response.status === 401 || response.status === 403) {
          throw new AiApiError(502, 'GROQ_AUTH_FAILED', 'GROQ_API_KEY trên máy chủ không hợp lệ hoặc đã hết hạn.')
        }
        if (response.status === 429) {
          throw new AiApiError(429, 'GROQ_RATE_LIMIT', 'Groq AI đang quá tải hoặc đạt giới hạn request. Vui lòng thử lại sau ít giây.')
        }
        if (isModelUnavailableError(response.status, data?.error) && index < candidateModels.length - 1) {
          continue
        }
        throw new AiApiError(502, 'GROQ_UPSTREAM_ERROR', upstreamMsg ? `Groq AI trả lỗi: ${upstreamMsg}` : 'Không thể xử lý yêu cầu với Groq AI lúc này.')
      }

      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw new AiApiError(502, 'GROQ_EMPTY_RESPONSE', 'Groq AI không trả về nội dung kế hoạch.')
      }
      return content
    }

    throw new AiApiError(502, 'GROQ_UPSTREAM_ERROR', lastUpstreamMsg ? `Groq AI trả lỗi: ${lastUpstreamMsg}` : 'Không thể xử lý yêu cầu với Groq AI lúc này.')
  } catch (error) {
    if (error instanceof AiApiError) throw error
    if (error?.name === 'AbortError') {
      throw new AiApiError(504, 'GROQ_TIMEOUT', 'Yêu cầu tới Groq AI bị quá thời gian chờ. Vui lòng thử lại.')
    }
    throw new AiApiError(502, 'GROQ_NETWORK_ERROR', 'Không thể kết nối tới máy chủ Groq AI.')
  } finally {
    clearTimeout(timer)
  }
}

export function createAiConfigHandler({ env = process.env } = {}) {
  return async function aiConfigHandler(request, response) {
    if (request.method !== 'GET') {
      return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'GET' })
    }
    const config = resolveAiConfig(env)
    if (!config) {
      return sendJson(response, 503, {
        available: false,
        model: '',
        code: 'CONFIG_NOT_READY',
        message: 'Chưa cấu hình GROQ_API_KEY trên máy chủ.',
      })
    }
    return sendJson(response, 200, { available: true, model: config.model })
  }
}

export function createAiScheduleHandler({
  env = process.env,
  now = Date.now,
  callGroq = defaultCallGroq,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function aiScheduleHandler(request, response) {
    try {
      if (request.method !== 'POST') {
        return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' }, { allow: 'POST' })
      }

      const config = resolveAiConfig(env)
      if (!config) {
        throw new AiApiError(503, 'CONFIG_NOT_READY', 'Máy chủ chưa được cấu hình GROQ_API_KEY. Hãy thêm GROQ_API_KEY vào biến môi trường (.env hoặc Vercel).')
      }

      const body = await readJson(request, MAX_AI_BODY_BYTES)
      const messages = validateMessages(body.messages)
      const existingEvents = validateExistingEvents(body.existingEvents)
      const requestedRefDate = typeof body.referenceDate === 'string' && parseDateKey(body.referenceDate)
        ? body.referenceDate
        : bangkokDateKey(now())

      const systemPrompt = buildAiSystemPrompt(requestedRefDate, existingEvents)
      const rawContent = await callGroq({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
        systemPrompt,
        messages,
        fetchImpl,
      })

      let result
      try {
        result = parseAiScheduleResponse(rawContent, existingEvents)
      } catch {
        throw new AiApiError(502, 'AI_PARSE_ERROR', 'Không thể đọc cấu trúc lịch từ phản hồi của AI. Vui lòng thử diễn đạt lại yêu cầu.')
      }

      return sendJson(response, 200, {
        action: result.action,
        reply: result.reply,
        planTitle: result.planTitle,
        events: result.events,
        referenceDate: requestedRefDate,
        model: config.model,
      })
    } catch (error) {
      if (error instanceof AiApiError) {
        return sendJson(response, error.status, { code: error.code, message: error.message })
      }
      return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu lập lịch AI lúc này.' })
    }
  }
}
