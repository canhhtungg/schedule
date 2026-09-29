import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteEvent, saveEvent } from '../src/scheduleUtils.js'

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
