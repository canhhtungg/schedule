export const SESSION_STORAGE_KEY = 'campus-planner.session.v1'
export const SESSION_VERSION = 1
const MAX_EVENTS = 5000
const COLORS = new Set(['violet', 'amber', 'cyan', 'green', 'rose', 'blue'])

const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : ''

function normalizeEvent(event, index) {
  if (!event || typeof event !== 'object') return null
  const date = text(event.date, 10)
  const title = text(event.title, 200).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return null
  return {
    id: text(event.id, 100) || `restored-${date}-${index}`,
    date,
    title,
    code: text(event.code, 50),
    time: text(event.time, 100),
    room: text(event.room, 100),
    teacher: text(event.teacher, 150),
    color: COLORS.has(event.color) ? event.color : 'violet',
  }
}

export function normalizeSession(value) {
  if (!value || typeof value !== 'object' || value.version !== SESSION_VERSION) return null
  if (value.mode !== 'qldt' && value.mode !== 'import') return null
  const user = text(value.user, 255).trim()
  if (!user || !Array.isArray(value.events) || value.events.length > MAX_EVENTS) return null
  const events = value.events.map(normalizeEvent).filter(Boolean)
  if (events.length !== value.events.length) return null
  return { version: SESSION_VERSION, mode: value.mode, user, events }
}

export function readStoredSession(storage) {
  try {
    const raw = storage?.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const session = normalizeSession(JSON.parse(raw))
    if (!session) storage?.removeItem(SESSION_STORAGE_KEY)
    return session
  } catch {
    try { storage?.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore unavailable storage */ }
    return null
  }
}

export function writeStoredSession(storage, session) {
  const normalized = normalizeSession({ ...session, version: SESSION_VERSION })
  if (!normalized) return null
  try { storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized)) } catch { /* keep the in-memory session */ }
  return normalized
}

export function clearStoredSession(storage) {
  try { storage?.removeItem(SESSION_STORAGE_KEY) } catch { /* keep logout working */ }
}
