import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiConfigHandler, createAiScheduleHandler } from '../server/aiHandlers.js'
import { buildAiSystemPrompt, parseAiScheduleResponse } from '../server/aiSchedule.js'

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

test('GET /api/ai/config reports availability without exposing GROQ_API_KEY', async (t) => {
  await t.test('unconfigured', async () => {
    const res = await invoke(createAiConfigHandler({ env: {} }), undefined, 'GET')
    assert.equal(res.statusCode, 503)
    assert.equal(res.payload.available, false)
    assert.equal(res.payload.code, 'CONFIG_NOT_READY')
  })

  await t.test('configured', async () => {
    const res = await invoke(createAiConfigHandler({ env: { GROQ_API_KEY: 'gsk_secret_value', GROQ_MODEL: 'llama-3.3-70b-versatile' } }), undefined, 'GET')
    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.available, true)
    assert.equal(res.payload.model, 'llama-3.3-70b-versatile')
    assert.doesNotMatch(JSON.stringify(res.payload), /gsk_secret_value/)
  })
})

test('parseAiScheduleResponse normalizes events, strips invalid dates, and marks conflicts', () => {
  const existingEvents = [
    { id: 'busy-1', date: '2026-11-20', title: 'Mật mã học', time: '19:00 – 21:00' },
  ]
  const raw = JSON.stringify({
    reply: 'Mình đã tạo 2 buổi ôn tập cho bạn.',
    planTitle: 'Kế hoạch ôn tập tuần này',
    events: [
      {
        date: '2026-11-20',
        startTime: '19:30',
        endTime: '21:00',
        title: 'Ôn tập Tiếng Anh',
        code: 'ENG',
        room: 'Phòng tự học',
        color: 'cyan',
      },
      {
        date: '2026-11-19',
        startTime: '08:00',
        endTime: '10:00',
        title: 'Làm bài tập Toán',
        code: 'MATH',
        color: 'amber',
      },
      {
        date: '2026-02-30', // invalid date should be filtered out
        startTime: '08:00',
        endTime: '09:00',
        title: 'Ngày sai',
      },
    ],
  })

  const parsed = parseAiScheduleResponse(raw, existingEvents)
  assert.equal(parsed.planTitle, 'Kế hoạch ôn tập tuần này')
  assert.equal(parsed.events.length, 2)
  // Sorted by date ascending
  assert.equal(parsed.events[0].date, '2026-11-19')
  assert.equal(parsed.events[0].conflicts.length, 0)
  assert.equal(parsed.events[1].date, '2026-11-20')
  assert.equal(parsed.events[1].time, '19:30 – 21:00')
  assert.equal(parsed.events[1].conflicts.length, 1)
  assert.equal(parsed.events[1].conflicts[0].title, 'Mật mã học')
})

test('parseAiScheduleResponse supports action=delete and matches existing event IDs', () => {
  const existingEvents = [
    { id: 'ev-incense-1', date: '2026-11-08', title: 'Mua đồ thắp hương', time: '08:00 – 09:00', color: 'amber' },
  ]
  const raw = JSON.stringify({
    action: 'delete',
    reply: 'Mình đã chọn lịch mua đồ thắp hương để xóa.',
    planTitle: 'Xóa lịch mua đồ thắp hương',
    events: [
      {
        id: 'ev-incense-1',
        date: '2026-11-08',
        title: 'Mua đồ thắp hương',
      },
    ],
  })

  const parsed = parseAiScheduleResponse(raw, existingEvents)
  assert.equal(parsed.action, 'delete')
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].id, 'ev-incense-1')
  assert.equal(parsed.events[0].time, '08:00 – 09:00')
})

test('buildAiSystemPrompt includes reference date, calendar table with lunar dates, and existing events summary with IDs', () => {
  const prompt = buildAiSystemPrompt('2026-11-19', [
    { id: 'ev-123', date: '2026-11-20', title: 'An toàn mạng', time: '13:00 – 15:30' },
  ])
  assert.match(prompt, /2026-11-19 \(Thứ 5, Âm: 11\/10\)/)
  assert.match(prompt, /\[id: ev-123\] 2026-11-20 \(Thứ 6\) \| 13:00 – 15:30 \| An toàn mạng/)
})

test('POST /api/ai/schedule validates input and returns structured plan from Groq', async (t) => {
  await t.test('returns 503 when GROQ_API_KEY is missing', async () => {
    const handler = createAiScheduleHandler({ env: {} })
    const res = await invoke(handler, { messages: [{ role: 'user', content: 'Thêm lịch học' }] })
    assert.equal(res.statusCode, 503)
    assert.equal(res.payload.code, 'CONFIG_NOT_READY')
  })

  await t.test('rejects empty messages', async () => {
    const handler = createAiScheduleHandler({ env: { GROQ_API_KEY: 'gsk_test' } })
    const res = await invoke(handler, { messages: [] })
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'INVALID_MESSAGES')
  })

  await t.test('calls Groq dependency and returns normalized plan without leaking API key', async () => {
    let capturedCall
    const handler = createAiScheduleHandler({
      env: { GROQ_API_KEY: 'gsk_super_secret' },
      callGroq: async (args) => {
        capturedCall = args
        return JSON.stringify({
          reply: 'Đây là lịch tự học Tiếng Anh của bạn.',
          planTitle: 'Tự học Tiếng Anh',
          events: [
            {
              date: '2026-11-23',
              startTime: '19:30',
              endTime: '21:00',
              title: 'Tự học Tiếng Anh buổi 1',
              code: 'ENG',
              room: 'Online',
              color: 'violet',
            },
          ],
        })
      },
    })

    const res = await invoke(handler, {
      referenceDate: '2026-11-19',
      messages: [{ role: 'user', content: 'Lên lịch học Tiếng Anh tối thứ 2 tuần sau 19h30-21h' }],
      existingEvents: [],
    })

    assert.equal(res.statusCode, 200)
    assert.equal(capturedCall.apiKey, 'gsk_super_secret')
    assert.equal(capturedCall.model, 'openai/gpt-oss-120b')
    assert.equal(res.payload.planTitle, 'Tự học Tiếng Anh')
    assert.equal(res.payload.events.length, 1)
    assert.equal(res.payload.events[0].date, '2026-11-23')
    assert.equal(res.payload.events[0].time, '19:30 – 21:00')
    assert.doesNotMatch(JSON.stringify(res.payload), /gsk_super_secret/)
  })

  await t.test('automatically falls back to active production model when configured model is retired/unavailable', async () => {
    const attemptedModels = []
    const handler = createAiScheduleHandler({
      env: { GROQ_API_KEY: 'gsk_super_secret', GROQ_MODEL: 'llama-3.3-70b-versatile' },
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body)
        attemptedModels.push(body.model)
        if (body.model === 'llama-3.3-70b-versatile') {
          return {
            ok: false,
            status: 404,
            json: async () => ({
              error: {
                code: 'model_not_found',
                message: "The model 'llama-3.3-70b-versatile' does not exist or you do not have access to it.",
              },
            }),
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: 'Đã lên lịch mua đồ thắp hương trước ngày mùng 1 và ngày rằm.',
                    planTitle: 'Lịch nhắc mua đồ thắp hương',
                    events: [
                      {
                        date: '2026-11-22',
                        startTime: '08:00',
                        endTime: '09:00',
                        title: 'Mua đồ thắp hương',
                        code: 'REMIND',
                        color: 'amber',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        }
      },
    })

    const res = await invoke(handler, {
      referenceDate: '2026-11-19',
      messages: [{ role: 'user', content: 'Thêm lịch nhắc mua đồ thắp hương trước ngày rằm' }],
      existingEvents: [],
    })

    assert.equal(res.statusCode, 200)
    assert.deepEqual(attemptedModels, ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'])
    assert.equal(res.payload.events.length, 1)
    assert.equal(res.payload.events[0].title, 'Mua đồ thắp hương')
  })
})
