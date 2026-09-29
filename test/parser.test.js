import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseTimetableHtml } from '../server/parser.js'
import { parseTimetableWorkbook } from '../server/workbookParser.js'
import * as XLSX from '@e965/xlsx'

const fixtureUrl = new URL('./fixtures/student-timetable.anonymized.html', import.meta.url)

test('parses and normalizes an anonymized QLĐT timetable fixture', async () => {
  const html = await readFile(fixtureUrl, 'utf8')
  const events = parseTimetableHtml(html)

  assert.equal(events.length, 3)
  assert.deepEqual(events.map(({ date, code, title, time, room, teacher }) => ({ date, code, title, time, room, teacher })), [
    { date: '2026-10-05', code: 'AT101', title: 'Nhập môn an toàn thông tin', time: '07:30 – 09:20', room: 'P.401', teacher: 'GV. A' },
    { date: '2026-10-07', code: 'MM202', title: 'Mật mã ứng dụng', time: '13:00 – 15:50', room: 'Lab 2', teacher: 'GV. B' },
    { date: '2026-10-08', code: 'NET303', title: 'Lập trình mạng', time: '09:30 – 11:20', room: 'P.305', teacher: 'GV. C' },
  ])
  assert.ok(events.every((event) => /^[a-f0-9]{16}$/.test(event.id)))
})

test('skips incomplete rows and de-duplicates repeated lessons', () => {
  const html = `
    <table>
      <tr><th>Ngày</th><th>Môn học</th><th>Mã môn</th><th>Thời gian</th><th>Phòng</th></tr>
      <tr><td>01/11/2026</td><td>Kiểm thử phần mềm</td><td>SE401</td><td>7:30 - 9:20</td><td>A1</td></tr>
      <tr><td>01/11/2026</td><td>Kiểm thử phần mềm</td><td>SE401</td><td>7:30 - 9:20</td><td>A1</td></tr>
      <tr><td>không rõ</td><td>Hàng lỗi</td><td>X</td><td></td><td></td></tr>
    </table>`
  const events = parseTimetableHtml(html)
  assert.equal(events.length, 1)
  assert.equal(events[0].date, '2026-11-01')
  assert.equal(events[0].time, '07:30 – 09:20')
  assert.equal(events[0].teacher, 'Chưa rõ')
})

test('expands the QLĐT Excel export into dated lessons', () => {
  const worksheet = {
    F10: { t: 's', v: 'AT101 - Nhập môn an toàn thông tin' },
    G10: { t: 's', v: 'Từ 05/10/2026 đến 12/10/2026: Thứ 2 tiết 1,2,3 tại P.401\nThứ 4 tiết 7,8,9 tại Lab 2' },
    '!ref': 'A1:G10',
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TKB')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const events = parseTimetableWorkbook(bytes)

  assert.deepEqual(events.map(({ date, code, title, time, room }) => ({ date, code, title, time, room })), [
    { date: '2026-10-05', code: 'AT101', title: 'Nhập môn an toàn thông tin', time: '07:00 – 09:25', room: 'P.401' },
    { date: '2026-10-07', code: 'AT101', title: 'Nhập môn an toàn thông tin', time: '12:30 – 14:55', room: 'Lab 2' },
    { date: '2026-10-12', code: 'AT101', title: 'Nhập môn an toàn thông tin', time: '07:00 – 09:25', room: 'P.401' },
  ])
})
