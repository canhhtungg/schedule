import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTimeRange, parseTimeRange } from '../src/timeUtils.js'

test('time helpers convert imported ranges to native time input values', () => {
  assert.deepEqual(parseTimeRange('7:30 – 09:20'), { startTime: '07:30', endTime: '09:20' })
  assert.deepEqual(parseTimeRange('13h00 - 15h50'), { startTime: '13:00', endTime: '15:50' })
  assert.deepEqual(parseTimeRange(''), { startTime: '', endTime: '' })
})

test('time helpers format and validate event times', () => {
  assert.equal(formatTimeRange('07:30', '09:20'), '07:30 – 09:20')
  assert.equal(formatTimeRange('07:30', ''), '07:30')
  assert.equal(formatTimeRange('', ''), '')
  assert.throws(() => formatTimeRange('', '09:20'), /bắt đầu/i)
  assert.throws(() => formatTimeRange('09:20', '07:30'), /sau giờ bắt đầu/i)
})
