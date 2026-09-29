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

function configureExportForm(html) {
  const fields = formFields(html)
  fields.set('dprTerm', '1')
  fields.set('dprType', 'A')
  fields.set('btnView', 'Xuất file Excel')
  return fields
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
  const fetchWithCookies = makeFetchCookie(globalThis.fetch, jar)

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
  if (looksLikeLogin(timetablePage.html) || /Login\.aspx|ErrorPage_PageNotExist/i.test(timetablePage.url)) {
    throw new QldtError('SESSION_REJECTED', 'Phiên đăng nhập QLĐT không hợp lệ hoặc đã bị chuyển hướng.', 401)
  }

  const exportForm = configureExportForm(timetablePage.html)
  const exported = await request(fetchWithCookies, TIMETABLE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: BASE_URL,
      referer: TIMETABLE_URL,
    },
    body: exportForm,
  }, limits)
  return parseExport(exported)
}
