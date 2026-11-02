import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '@e965/xlsx'
import { fetchQldtSchedule, QldtError } from '../server/qldt.js'

const hidden = (state) => `<input type="hidden" name="__VIEWSTATE" value="${state}">
  <input type="hidden" name="__VIEWSTATEGENERATOR" value="GEN-${state}">
  <input type="hidden" name="__EVENTVALIDATION" value="VALID-${state}">
  <input type="hidden" name="__EVENTTARGET" value="">
  <input type="hidden" name="__EVENTARGUMENT" value="">
  <input type="hidden" name="__LASTFOCUS" value="">`

function timetablePage({ state, selectedSemester, selectedTerm }) {
  const semesters = [
    ['new', '1_2026_2027'],
    ['old', '3_2025_2026'],
  ].map(([value, label]) => `<option value="${value}"${value === selectedSemester ? ' selected' : ''}>${label}</option>`).join('')
  const terms = (selectedSemester === 'new' ? [['1', '1'], ['2', '2']] : [['5', '5']])
    .map(([value, label]) => `<option value="${value}"${value === selectedTerm ? ' selected' : ''}>${label}</option>`).join('')
  return `<html><form>${hidden(state)}
    <select name="drpSemester">${semesters}</select>
    <select name="drpTerm">${terms}</select>
    <select name="drpType"><option value="A" selected>Hiển thị theo học phần</option></select>
    <input type="submit" name="btnView" value="Xuất file Excel">
  </form><table id="gridRegistered"></table></html>`
}

function workbookResponse() {
  const sheet = {
    B9: { t: 's', v: 'Giảng viên' }, B10: { t: 's', v: 'Giảng viên mẫu' },
    F10: { t: 's', v: 'AT101 - Môn học học kỳ mới' },
    G10: { t: 's', v: 'Từ 28/09/2026 đến 05/10/2026: Thứ 2 tiết 1,2,3 tại P.401' },
    '!ref': 'A1:G10',
  }
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'TKB')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

test('selects the newest semester and its latest term using successive WebForms postbacks', async () => {
  const calls = []
  const fetchImpl = async (_url, init = {}) => {
    const method = init.method || 'GET'
    if (method === 'GET' && _url.endsWith('/Login.aspx')) {
      return new Response(`<form>${hidden('login')}<input name="txtUserName"><input name="txtPassword"></form>`, { headers: { 'content-type': 'text/html' } })
    }
    if (method === 'POST' && _url.endsWith('/Login.aspx')) {
      return new Response('<span id="PageHeader1_lblUserFullName">Sinh viên</span>', { headers: { 'content-type': 'text/html' } })
    }
    if (method === 'GET') return new Response(timetablePage({ state: 'initial', selectedSemester: 'old', selectedTerm: '5' }), { headers: { 'content-type': 'text/html' } })

    const fields = new URLSearchParams(init.body)
    calls.push(fields)
    if (fields.get('__EVENTTARGET') === 'drpSemester') {
      assert.equal(fields.get('drpSemester'), 'new')
      assert.equal(fields.get('__VIEWSTATE'), 'initial')
      return new Response(timetablePage({ state: 'semester', selectedSemester: 'new', selectedTerm: '1' }), { headers: { 'content-type': 'text/html' } })
    }
    if (fields.get('__EVENTTARGET') === 'drpTerm') {
      assert.equal(fields.get('drpTerm'), '2')
      assert.equal(fields.get('__VIEWSTATE'), 'semester')
      return new Response(timetablePage({ state: 'term', selectedSemester: 'new', selectedTerm: '2' }), { headers: { 'content-type': 'text/html' } })
    }
    assert.equal(fields.get('btnView'), 'Xuất file Excel')
    assert.equal(fields.get('drpSemester'), 'new')
    assert.equal(fields.get('drpTerm'), '2')
    assert.equal(fields.get('__VIEWSTATE'), 'term')
    return new Response(workbookResponse(), { headers: { 'content-type': 'application/vnd.ms-excel' } })
  }
  const logs = []
  const events = await fetchQldtSchedule('student', 'secret', {
    fetchImpl,
    logger: { info: (...args) => logs.push(args) },
  })

  assert.equal(calls.length, 3)
  assert.equal(events.length, 2)
  assert.ok(events.every((event) => event.title.includes('Môn học học kỳ mới')))
  assert.equal(logs.length, 2)
  assert.doesNotMatch(JSON.stringify(logs), /secret|student|VIEWSTATE|VALID-/)
})

test('fails clearly when the timetable page has no semester dropdown', async () => {
  const fetchImpl = async (_url, init = {}) => {
    const url = String(_url)
    if (url.endsWith('/Login.aspx') && (init.method || 'GET') === 'GET') {
      return new Response(`<form>${hidden('login')}<input name="txtUserName"><input name="txtPassword"></form>`, { headers: { 'content-type': 'text/html' } })
    }
    if (url.endsWith('/Login.aspx')) return new Response('<span id="PageHeader1_lblUserFullName">Sinh viên</span>', { headers: { 'content-type': 'text/html' } })
    return new Response(`<form>${hidden('initial')}<select name="drpTerm"><option value="1">1</option></select></form>`, { headers: { 'content-type': 'text/html' } })
  }

  await assert.rejects(fetchQldtSchedule('student', 'secret', { fetchImpl }), (error) => {
    assert.ok(error instanceof QldtError)
    assert.equal(error.code, 'SEMESTER_DROPDOWN_NOT_FOUND')
    return true
  })
})
