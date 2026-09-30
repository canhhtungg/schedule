import assert from 'node:assert/strict'
import test from 'node:test'
import { isLunarHighlight, lunarLabel, parseDateKey, shiftMonth, vietnameseLunarDate } from '../src/calendarUtils.js'

test('converts known Vietnamese lunar new year dates', () => {
  assert.deepEqual(vietnameseLunarDate(new Date(2024, 1, 10)), { day: 1, month: 1, year: 2024, leap: false })
  assert.deepEqual(vietnameseLunarDate(new Date(2025, 0, 29)), { day: 1, month: 1, year: 2025, leap: false })
  assert.deepEqual(vietnameseLunarDate(new Date(2026, 1, 17)), { day: 1, month: 1, year: 2026, leap: false })
})

test('formats and highlights lunar day 1 and 15', () => {
  const first = new Date(2026, 1, 17)
  const fifteenth = new Date(2026, 2, 3)
  assert.equal(lunarLabel(first), '1/1')
  assert.equal(lunarLabel(first, { showLunar: false }), '1/1')
  assert.equal(lunarLabel(fifteenth, { showLunar: false }), '15/1')
  assert.equal(lunarLabel(new Date(2026, 2, 4), { showLunar: false }), null)
  assert.equal(isLunarHighlight(first), true)
  assert.equal(isLunarHighlight(fifteenth), true)
})

test('calendar helpers preserve a valid selected day across shorter months', () => {
  assert.equal(shiftMonth(new Date(2026, 0, 31), 1).getDate(), 28)
  assert.equal(parseDateKey('2026-02-29'), null)
  assert.equal(parseDateKey('2026-02-28')?.getDate(), 28)
})
