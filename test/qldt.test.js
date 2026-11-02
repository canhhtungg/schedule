import test from 'node:test'
import assert from 'node:assert/strict'
import { getAllTerms } from '../server/qldt.js'

test('returns every QLĐT term, including periods from older academic years', () => {
  const html = `<form>
    <select name="dprTerm">
      <option value="old">Học kỳ II năm học 2025-2026 - Đợt 5</option>
      <option value="new1">Học kỳ I năm học 2026-2027 - Đợt 1</option>
      <option value="new2">Học kỳ I năm học 2026-2027 - Đợt 2</option>
    </select>
  </form>`

  assert.deepEqual(getAllTerms(html).map(({ value }) => value), ['old', 'new1', 'new2'])
})

test('returns every listed term even when its label has no year', () => {
  const html = `<form>
    <select name="dprTerm">
      <option value="term1">2026-2027 - Học kỳ I</option>
      <option value="term2">2026-2027 - Hè</option>
    </select>
  </form>`

  assert.deepEqual(getAllTerms(html).map(({ value }) => value), ['term1', 'term2'])
})
