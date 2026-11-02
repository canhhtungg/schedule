import * as cheerio from 'cheerio'
import makeFetchCookie from 'fetch-cookie'
import { CookieJar } from 'tough-cookie'
import { parseTimetableHtml } from './parser.js'
import { parseTimetableWorkbook } from './workbookParser.js'

const BASE_URL = 'http://qldt.actvn.edu.vn'
const LOGIN_URL = `${BASE_URL}/CMCSoft.IU.Web.Info/Login.aspx`
const TIMETABLE_URL = `${BASE_URL}/CMCSoft.IU.Web.Info/Reports/Form/StudentTimeTable.aspx`
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024

export class QldtError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'QldtError'
    this.code = code
    this.status = status
  }
}

async function readBytes(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new QldtError('UPSTREAM_BODY_TOO_LARGE', 'Phản hồi từ QLĐT vượt quá giới hạn cho phép.')
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new QldtError('UPSTREAM_BODY_TOO_LARGE', 'Phản hồi từ QLĐT vượt quá giới hạn cho phép.')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

function requestOptions(options, timeoutMs) {
  return {
    ...options,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'text/html,application/xhtml+xml,application/vnd.ms-excel,*/*;q=0.8',
      'accept-language': 'vi-VN,vi;q=0.9,en;q=0.5',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'cache-control': 'no-cache, no-store',
      pragma: 'no-cache',
      ...options.headers,
    },
  }
}

async function request(fetchWithCookies, url, options, limits) {
  let response
  try {
    response = await fetchWithCookies(url, requestOptions(options, limits.timeoutMs))
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new QldtError('UPSTREAM_TIMEOUT', 'QLĐT phản hồi quá chậm. Vui lòng thử lại sau.', 504)
    throw new QldtError('UPSTREAM_UNAVAILABLE', 'Không thể kết nối trực tiếp tới QLĐT. Vui lòng thử lại sau.', 502)
  }
  const bytes = await readBytes(response, limits.maxBodyBytes)
  if (!response.ok) throw new QldtError('UPSTREAM_HTTP_ERROR', `QLĐT trả về lỗi HTTP ${response.status}.`, 502)
  return { bytes, html: new TextDecoder('utf-8').decode(bytes), url: response.url, contentType: response.headers.get('content-type') || '' }
}

function formFields(html, requireWebForms = true) {
  const $ = cheerio.load(html)
  const fields = new URLSearchParams()
  const form = $('form').first()
  form.find('input[name]').each((_, input) => {
    const type = ($(input).attr('type') || 'text').toLowerCase()
    if (type !== 'submit' && type !== 'button' && type !== 'checkbox' && type !== 'radio') fields.set($(input).attr('name'), $(input).attr('value') || '')
  })
  form.find('select[name]').each((_, select) => {
    const selected = $(select).find('option[selected]').first()
    const fallback = $(select).find('option').first()
    fields.set($(select).attr('name'), (selected.length ? selected : fallback).attr('value') || '')
  })
  if (requireWebForms) {
    for (const required of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
      if (!fields.has(required)) throw new QldtError('UPSTREAM_FORM_CHANGED', `QLĐT không còn cung cấp trường ${required}.`, 502)
    }
  }
  return fields
}

function looksLikeLogin(html) {
  const $ = cheerio.load(html)
  const error = $('#lblErrorInfo').text().trim()
  const guest = $('#PageHeader1_lblUserFullName').text().trim().toLowerCase()
  return Boolean(error) || guest === 'khách' || $('input[name="txtPassword"]').length > 0 || $('input[name="txtUserName"]').length > 0
}

function getDropdownOptions(html, fieldName) {
  const $ = cheerio.load(html)
  const select = $(`select[name="${fieldName}"]`).first()
  if (!select.length) return []
  return select.find('option').map((_, option) => ({
      value: $(option).attr('value') || '',
      label: $(option).text().trim(),
    })).get().filter((option) => option.value)
}

function getSemesterOptions(html) {
  return getDropdownOptions(html, 'drpSemester')
}

function getTermOptions(html) {
  return getDropdownOptions(html, 'drpTerm')
}

function semesterRank(option) {
  const match = option.label.match(/^\s*(\d+)_(\d{4})_(\d{4})\s*$/)
  if (!match) return null
  return [Number(match[3]), Number(match[2]), Number(match[1])]
}

function chooseLatestSemester(options) {
  if (!options.length) throw new QldtError('SEMESTER_DROPDOWN_NOT_FOUND', 'Không tìm thấy danh sách học kỳ trên QLĐT.')
  const ranked = options.map((option) => ({ ...option, rank: semesterRank(option) }))
  if (ranked.some((option) => !option.rank)) {
    if (ranked.length === 1) return ranked[0]
    throw new QldtError('SEMESTER_LABEL_UNRECOGNIZED', 'Không nhận diện được định dạng học kỳ do QLĐT cung cấp.')
  }
  return ranked.sort((a, b) => {
    for (let index = 0; index < a.rank.length; index += 1) {
      if (a.rank[index] !== b.rank[index]) return b.rank[index] - a.rank[index]
    }
    return 0
  })[0]
}

function chooseLatestTerm(options) {
  if (!options.length) throw new QldtError('TERM_DROPDOWN_NOT_FOUND', 'Không tìm thấy danh sách đợt học sau khi chọn học kỳ trên QLĐT.')
  const ranked = options.map((option, index) => {
    const match = `${option.label} ${option.value}`.match(/\d+/)
    return { ...option, rank: match ? Number(match[0]) : index }
  })
  return ranked.sort((a, b) => b.rank - a.rank)[0]
}

function configureExportForm(html, semesterValue, termValue) {
  const fields = formFields(html)
  fields.set('drpSemester', semesterValue)
  fields.set('drpTerm', termValue)
  fields.set('drpType', 'A')
  fields.set('btnView', 'Xuất file Excel')
  return fields
}

function configurePostbackForm(html, target, field, value) {
  const fields = formFields(html)
  fields.set('__EVENTTARGET', target)
  fields.set('__EVENTARGUMENT', '')
  fields.set('__LASTFOCUS', '')
  fields.set(field, value)
  return fields
}

function selectedOptionValue(html, fieldName) {
  const $ = cheerio.load(html)
  return $(`select[name="${fieldName}"] option:selected`).attr('value')
}

function parseExport(result) {
  const looksHtml = /html/i.test(result.contentType) || /^\s*</.test(result.html)
  if (looksHtml) {
    if (looksLikeLogin(result.html)) throw new QldtError('SESSION_REJECTED', 'Phiên đăng nhập QLĐT không hợp lệ hoặc đã bị chuyển hướng.', 401)
    const htmlEvents = parseTimetableHtml(result.html)
    if (htmlEvents.length) return htmlEvents
  }
  try {
    const workbookEvents = parseTimetableWorkbook(result.bytes)
    if (workbookEvents.length) return workbookEvents
  } catch {
    // Convert a changing upstream format into one stable API error without exposing workbook contents.
  }
  throw new QldtError('TIMETABLE_PARSE_FAILED', 'Đã đăng nhập nhưng chưa nhận diện được dữ liệu thời khóa biểu.', 502)
}

export async function fetchQldtSchedule(username, password, options = {}) {
  const limits = {
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBodyBytes: options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES,
  }
  const jar = new CookieJar()
  const fetchWithCookies = makeFetchCookie(options.fetchImpl || globalThis.fetch, jar)

  const loginPage = await request(fetchWithCookies, LOGIN_URL, { method: 'GET' }, limits)
  const loginForm = formFields(loginPage.html)
  loginForm.set('txtUserName', username)
  // The live Web Forms page submits the entered password unchanged; hashing here
  // would make the server hash an MD5 string a second time and reject valid users.
  loginForm.set('txtPassword', password)
  loginForm.set('btnSubmit', 'Đăng nhập')

  let loginResult
  try {
    loginResult = await request(fetchWithCookies, LOGIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: BASE_URL,
        referer: LOGIN_URL,
      },
      body: loginForm,
    }, limits)
  } finally {
    loginForm.set('txtPassword', '')
  }
  if (looksLikeLogin(loginResult.html)) throw new QldtError('INVALID_CREDENTIALS', 'QLĐT từ chối tài khoản hoặc mật khẩu.', 401)

  const timetablePage = await request(fetchWithCookies, TIMETABLE_URL, {
    method: 'GET',
    headers: { referer: loginResult.url || LOGIN_URL },
  }, limits)
  const ensureAuthenticatedPage = (page) => {
    if (looksLikeLogin(page.html) || /Login\.aspx|ErrorPage_PageNotExist/i.test(page.url)) {
      throw new QldtError('SESSION_REJECTED', 'Phiên đăng nhập QLĐT không hợp lệ hoặc đã bị chuyển hướng.', 401)
    }
  }
  ensureAuthenticatedPage(timetablePage)

  const semester = chooseLatestSemester(getSemesterOptions(timetablePage.html))
  const postHeaders = {
    'content-type': 'application/x-www-form-urlencoded',
    origin: BASE_URL,
    referer: TIMETABLE_URL,
  }
  const semesterPage = await request(fetchWithCookies, TIMETABLE_URL, {
    method: 'POST', headers: postHeaders,
    body: configurePostbackForm(timetablePage.html, 'drpSemester', 'drpSemester', semester.value),
  }, limits)
  ensureAuthenticatedPage(semesterPage)
  if (selectedOptionValue(semesterPage.html, 'drpSemester') !== semester.value) {
    throw new QldtError('SEMESTER_POSTBACK_FAILED', 'QLĐT không xác nhận học kỳ đã chọn.')
  }

  const term = chooseLatestTerm(getTermOptions(semesterPage.html))
  const termPage = await request(fetchWithCookies, TIMETABLE_URL, {
    method: 'POST', headers: postHeaders,
    body: configurePostbackForm(semesterPage.html, 'drpTerm', 'drpTerm', term.value),
  }, limits)
  ensureAuthenticatedPage(termPage)
  if (selectedOptionValue(termPage.html, 'drpTerm') !== term.value) {
    throw new QldtError('TERM_POSTBACK_FAILED', 'QLĐT không xác nhận đợt học đã chọn.')
  }

  const logger = options.logger || console
  logger.info('[qldt] Selected schedule period', JSON.stringify({ semester: semester.label, term: term.label }))
  const exported = await request(fetchWithCookies, TIMETABLE_URL, {
    method: 'POST', headers: postHeaders,
    body: configureExportForm(termPage.html, semester.value, term.value),
  }, limits)
  ensureAuthenticatedPage(exported)
  const events = parseExport(exported)
  logger.info('[qldt] Schedule export succeeded', JSON.stringify({ semester: semester.label, term: term.label, eventCount: events.length }))
  return events
}
