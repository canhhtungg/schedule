import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteEvent, findEventConflicts, saveEvent, saveEventsBatch } from '../src/scheduleUtils.js'

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
