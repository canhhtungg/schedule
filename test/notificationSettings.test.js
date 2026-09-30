import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NOTIFICATION_STORAGE_KEY,
  detectNotificationEnvironment,
  readNotificationSettings,
  saveNotificationSettings,
} from '../src/notificationSettings.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('notification settings persist lead time and pending QStash identifiers only', () => {
  const storage = memoryStorage()
  const saved = saveNotificationSettings(storage, {
    enabled: true,
    leadMinutes: 45,
    messageId: 'msg_pending_1',
    chainId: 'a'.repeat(32),
    privateKey: 'must-not-persist',
  })
  assert.deepEqual(saved, { enabled: true, leadMinutes: 45, messageId: 'msg_pending_1', chainId: 'a'.repeat(32) })
  assert.deepEqual(readNotificationSettings(storage), saved)
  assert.doesNotMatch(storage.getItem(NOTIFICATION_STORAGE_KEY), /private|must-not-persist/)
})

test('notification settings reject corrupt values', () => {
  const storage = memoryStorage()
  storage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({ enabled: 'yes', leadMinutes: 10, messageId: '../bad', chainId: 'short' }))
  assert.deepEqual(readNotificationSettings(storage), { enabled: false, leadMinutes: 30, messageId: null, chainId: null })
})

test('iPhone Web Push requires the installed standalone PWA', () => {
  const navigatorObject = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', serviceWorker: {}, standalone: false }
  const browserWindow = { isSecureContext: true, PushManager: class {}, Notification: class {}, matchMedia: () => ({ matches: false }) }
  assert.deepEqual(detectNotificationEnvironment(browserWindow, navigatorObject), {
    ios: true,
    standalone: false,
    needsInstallation: true,
    supported: false,
  })

  navigatorObject.standalone = true
  assert.equal(detectNotificationEnvironment(browserWindow, navigatorObject).supported, true)
})
