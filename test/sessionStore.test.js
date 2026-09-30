import assert from 'node:assert/strict'
import test from 'node:test'
import { clearStoredSession, readStoredSession, SESSION_STORAGE_KEY, writeStoredSession } from '../src/sessionStore.js'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

const session = {
  mode: 'qldt',
  user: 'AT000001',
  events: [{ id: 'one', date: '2026-09-30', title: 'Mật mã', code: 'AT101', time: '', room: '', teacher: '', color: 'blue' }],
}

test('persists and restores schedule session without credentials', () => {
  const store = storage()
  const saved = writeStoredSession(store, { ...session, password: 'must-not-be-stored' })
  assert.equal(saved.version, 1)
  assert.deepEqual(readStoredSession(store), saved)
  assert.equal(store.getItem(SESSION_STORAGE_KEY).includes('must-not-be-stored'), false)
  assert.equal(Object.hasOwn(readStoredSession(store), 'password'), false)
})

test('keeps edited events across reload and clears them on logout', () => {
  const store = storage()
  writeStoredSession(store, session)
  const restored = readStoredSession(store)
  restored.events.push({ id: 'two', date: '2026-10-01', title: 'Tự học', code: '', time: '', room: '', teacher: '', color: 'violet' })
  writeStoredSession(store, restored)
  assert.equal(readStoredSession(store).events.length, 2)
  clearStoredSession(store)
  assert.equal(readStoredSession(store), null)
})

test('rejects corrupt or structurally invalid stored sessions', () => {
  const store = storage()
  store.setItem(SESSION_STORAGE_KEY, '{bad json')
  assert.equal(readStoredSession(store), null)
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'qldt', user: 'A', events: [{ date: 'bad', title: 'X' }] }))
  assert.equal(readStoredSession(store), null)
})
