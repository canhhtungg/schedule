import express from 'express'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHealthHandler, createImportScheduleHandler, createScheduleHandler } from './apiHandlers.js'
import { createNotificationCancelHandler, createNotificationConfigHandler, createNotificationDeliverHandler, createNotificationScheduleHandler, createNotificationTestHandler } from './notificationHandlers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const app = express()
const port = Number(process.env.PORT) || 3000

app.disable('x-powered-by')
app.use((_, response, next) => {
  response.set({
    'cache-control': 'no-store, max-age=0',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  })
  next()
})
// Import requests may contain a base64-encoded 3 MB workbook. Each handler still
// enforces its own, narrower decoded/body limits.
app.use(express.json({
  limit: '5mb',
  strict: true,
  verify: (request, _response, buffer) => { request.rawBody = Buffer.from(buffer) },
}))

app.get('/api/health', createHealthHandler())
app.post('/api/login/schedule', createScheduleHandler())
app.post('/api/import/schedule', createImportScheduleHandler())
app.get('/api/notifications/config', createNotificationConfigHandler())
app.post('/api/notifications/schedule', createNotificationScheduleHandler())
app.post('/api/notifications/cancel', createNotificationCancelHandler())
app.post('/api/notifications/test', createNotificationTestHandler())
app.post('/api/notifications/deliver', createNotificationDeliverHandler())

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
