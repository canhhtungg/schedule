import express from 'express'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fetchQldtSchedule, QldtError, qldtConnectionNotice } from './qldt.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const app = express()
const port = Number(process.env.PORT) || 3000
const timeoutMs = positiveInt(process.env.QLDT_TIMEOUT_MS, 12_000)
const maxBodyBytes = positiveInt(process.env.QLDT_MAX_BODY_BYTES, 8 * 1024 * 1024)

function positiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function demoEvents() {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  return [
    { id: 'demo-1', date: `${year}-${month}-03`, title: 'Cấu trúc dữ liệu', code: 'CS204', time: '07:30 – 09:20', room: 'A-302', teacher: 'GV. Minh Anh', color: 'violet' },
    { id: 'demo-2', date: `${year}-${month}-03`, title: 'Tiếng Anh chuyên ngành', code: 'EN310', time: '13:00 – 14:50', room: 'B-205', teacher: 'GV. Thu Hà', color: 'amber' },
    { id: 'demo-3', date: `${year}-${month}-12`, title: 'An toàn hệ thống', code: 'SE301', time: '07:30 – 10:20', room: 'A-405', teacher: 'GV. Đức Long', color: 'green' },
    { id: 'demo-4', date: `${year}-${month}-19`, title: 'Phát triển Web', code: 'WEB302', time: '07:30 – 10:20', room: 'Lab 2', teacher: 'GV. Quang Huy', color: 'blue' },
  ]
}

app.disable('x-powered-by')
app.use(express.json({ limit: '8kb', strict: true }))
app.use((_, response, next) => {
  response.set({
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
  next()
})

app.get('/api/health', (_, response) => {
  response.json({ ok: true, service: 'kma-schedule', upstreamTransport: 'http' })
})

app.post('/api/login/schedule', async (request, response) => {
  let password = typeof request.body?.password === 'string' ? request.body.password : ''
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : ''
  const mode = request.body?.mode === 'demo' ? 'demo' : 'qldt'

  try {
    if (mode === 'demo') {
      return response.json({ mode, user: username || 'DEMO2026', events: demoEvents(), warnings: [] })
    }
    if (!username || !password) return response.status(400).json({ code: 'MISSING_CREDENTIALS', message: 'Vui lòng nhập đủ tài khoản và mật khẩu.' })
    if (username.length > 100 || password.length > 256) return response.status(400).json({ code: 'INVALID_INPUT', message: 'Thông tin đăng nhập vượt quá độ dài cho phép.' })

    const events = await fetchQldtSchedule(username, password, { timeoutMs, maxBodyBytes })
    return response.json({ mode, user: username, events, warnings: [qldtConnectionNotice] })
  } catch (error) {
    if (error instanceof QldtError) return response.status(error.status).json({ code: error.code, message: error.message })
    return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Không thể tải lịch học lúc này.' })
  } finally {
    password = ''
    if (request.body && typeof request.body === 'object') request.body.password = ''
  }
})

if (process.env.NODE_ENV === 'production') {
  const indexHtml = readFileSync(path.join(rootDir, 'dist', 'index.html'))
  app.use(express.static(path.join(rootDir, 'dist'), { index: 'index.html', maxAge: '1h' }))
  app.get(/^(?!\/api(?:\/|$)).*/, (_, response) => response.type('html').send(indexHtml))
}

app.use((error, _request, response, _next) => {
  if (error?.type === 'entity.too.large') return response.status(413).json({ code: 'REQUEST_TOO_LARGE', message: 'Yêu cầu vượt quá giới hạn cho phép.' })
  if (error instanceof SyntaxError) return response.status(400).json({ code: 'INVALID_JSON', message: 'Dữ liệu gửi lên không hợp lệ.' })
  return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu.' })
})

app.listen(port, '0.0.0.0', () => {
  process.stdout.write(`KMA Schedule listening on port ${port}\n`)
})
