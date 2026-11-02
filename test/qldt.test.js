import test from 'node:test'
import assert from 'node:assert/strict'
import { currentAcademicYearTerms } from '../server/qldt.js'

test('selects all terms in the newest academic year, including Roman-numeral semesters', () => {
  const html = `<form>
    <select name="dprTerm">
      <option value="old">Học kỳ II năm học 2025-2026 - Đợt 5</option>
      <option value="new1">Học kỳ I năm học 2026-2027 - Đợt 1</option>
      <option value="new2">Học kỳ I năm học 2026-2027 - Đợt 2</option>
    </select>
  </form>`

  assert.deepEqual(currentAcademicYearTerms(html).map(({ value }) => value), ['new1', 'new2'])
})

test('recognizes a Roman-numeral semester and a Vietnamese summer term', () => {
  const html = `<form>
    <select name="dprTerm">
      <option value="term1">2026-2027 - Học kỳ I</option>
      <option value="term2">2026-2027 - Hè</option>
    </select>
  </form>`

  assert.deepEqual(currentAcademicYearTerms(html).map(({ value }) => value), ['term1', 'term2'])
})
