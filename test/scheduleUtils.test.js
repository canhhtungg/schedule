import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteEvent, deleteEventsBatch, eventsToIcs, findEventConflicts, saveEvent, saveEventsBatch, updateEventsBatch } from '../src/scheduleUtils.js'

test('creates, edits, sorts, and deletes session events', () => {
  const existing = [{ id: 'one', date: '2026-09-30', title: 'Môn cũ', code: '', time: '', room: '', teacher: '', color: 'violet' }]
  const added = saveEvent(existing, { date: '2026-09-29', title: '  Tự học  ', room: ' A1 ' })
  assert.equal(added.length, 2)
  assert.equal(added[0].title, 'Tự học')
  assert.equal(added[0].room, 'A1')
  const edited = saveEvent(added, { ...added[1], title: 'Môn đã sửa', teacher: '' }, 'one')
  assert.equal(edited.find((event) => event.id === 'one').title, 'Môn đã sửa')
  assert.equal(deleteEvent(edited, 'one').length, 1)
})

test('requires a real date and title', () => {
  assert.throws(() => saveEvent([], { date: '2026-02-30', title: 'Sai ngày' }), /Ngày không hợp lệ/)
  assert.throws(() => saveEvent([], { date: '2026-09-30', title: '   ' }), /bắt buộc/)
})

test('saveEventsBatch inserts multiple events, skips exact duplicates, and sorts', () => {
  const existing = [
    { id: 'e1', date: '2026-10-02', title: 'Mật mã học', code: 'AT1', time: '07:00 – 09:25', room: '301', teacher: '', color: 'violet' },
  ]
  const batch = [
    { date: '2026-10-03', title: 'Tự học Tiếng Anh', code: 'ENG', time: '19:30 – 21:00', room: 'Online', color: 'cyan' },
    { date: '2026-10-01', title: 'Ôn tập Toán', code: 'MATH', time: '14:00 – 16:00', room: 'Thư viện', color: 'amber' },
    { date: '2026-10-02', title: 'mật mã học', code: 'AT1', time: '07:00 – 09:25', room: '301' }, // duplicate
  ]
  const updated = saveEventsBatch(existing, batch)
  assert.equal(updated.length, 3)
  assert.deepEqual(updated.map((e) => e.date), ['2026-10-01', '2026-10-02', '2026-10-03'])
  assert.equal(updated[0].color, 'amber')
  assert.equal(updated[2].color, 'cyan')
})

test('deleteEventsBatch removes events by id or by date+title+time signature', () => {
  const existing = [
    { id: 'e1', date: '2026-11-08', title: 'Mua đồ thắp hương', time: '08:00 – 09:00' },
    { id: 'e2', date: '2026-11-23', title: 'Mua đồ thắp hương', time: '08:00 – 09:00' },
    { id: 'e3', date: '2026-11-24', title: 'An toàn mạng', time: '13:00 – 15:30' },
  ]
  const remaining = deleteEventsBatch(existing, [
    { id: 'e1', date: '2026-11-08', title: 'Mua đồ thắp hương' },
    { id: 'ai-custom-id', date: '2026-11-23', title: 'Mua đồ thắp hương', time: '08:00 – 09:00' },
  ])
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].id, 'e3')
})

test('updateEventsBatch updates existing events by targetEventId or id and preserves event identity', () => {
  const existing = [
    { id: 'e1', date: '2026-11-20', title: 'Ôn tập Tiếng Anh', code: 'ENG', time: '19:00 – 20:30', room: 'Online', teacher: '', color: 'cyan' },
    { id: 'e2', date: '2026-11-21', title: 'An toàn mạng', code: 'NET', time: '07:00 – 09:25', room: '301', teacher: 'Thầy A', color: 'violet' },
  ]
  const updated = updateEventsBatch(existing, [
    {
      id: 'ai-draft-1',
      targetEventId: 'e1',
      date: '2026-11-22',
      title: 'Ôn tập Tiếng Anh (Dời lịch)',
      code: 'ENG',
      time: '20:00 – 21:30',
      room: 'Phòng 202',
      color: 'amber',
    },
  ])
  assert.equal(updated.length, 2)
  const target = updated.find((item) => item.id === 'e1')
  assert.ok(target)
  assert.equal(target.date, '2026-11-22')
  assert.equal(target.title, 'Ôn tập Tiếng Anh (Dời lịch)')
  assert.equal(target.time, '20:00 – 21:30')
  assert.equal(target.room, 'Phòng 202')
})

test('eventsToIcs formats events into a valid iCalendar VCALENDAR string', () => {
  const events = [
    { id: 'ev-1', date: '2026-11-20', title: 'An toàn mạng', code: 'AT1', time: '07:00 – 09:25', room: 'TA1-301', teacher: 'Nguyễn Văn A' },
  ]
  const ics = eventsToIcs(events)
  assert.match(ics, /BEGIN:VCALENDAR/)
  assert.match(ics, /BEGIN:VEVENT/)
  assert.match(ics, /UID:ev-1@kma\.planner/)
  assert.match(ics, /DTSTART;TZID=Asia\/Ho_Chi_Minh:20261120T070000/)
  assert.match(ics, /DTEND;TZID=Asia\/Ho_Chi_Minh:20261120T092500/)
  assert.match(ics, /SUMMARY:\[AT1\] An toàn mạng/)
  assert.match(ics, /LOCATION:TA1-301/)
  assert.match(ics, /END:VCALENDAR/)
})

test('findEventConflicts detects overlapping time ranges on the same date', () => {
  const existing = [
    { id: 'e1', date: '2026-10-02', title: 'An toàn mạng', time: '13:30 – 16:00' },
    { id: 'e2', date: '2026-10-03', title: 'Lập trình Web', time: '09:00 – 11:30' },
  ]
  const overlapping = findEventConflicts(existing, { date: '2026-10-02', startTime: '15:00', endTime: '17:00', title: 'Học nhóm' })
  assert.equal(overlapping.length, 1)
  assert.equal(overlapping[0].id, 'e1')

  const nonOverlapping = findEventConflicts(existing, { date: '2026-10-02', startTime: '16:00', endTime: '18:00', title: 'Tập gym' })
  assert.equal(nonOverlapping.length, 0)
})
