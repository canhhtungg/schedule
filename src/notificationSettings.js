export const NOTIFICATION_STORAGE_KEY = 'campus-planner.notifications'
export const NOTIFICATION_LEADS = [15, 30, 45, 60]

export function defaultNotificationSettings() {
  return { enabled: false, leadMinutes: 30, messageId: null, chainId: null }
}

export function normalizeNotificationSettings(value) {
  const defaults = defaultNotificationSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  return {
    enabled: value.enabled === true,
    leadMinutes: NOTIFICATION_LEADS.includes(value.leadMinutes) ? value.leadMinutes : defaults.leadMinutes,
    messageId: typeof value.messageId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value.messageId) ? value.messageId : null,
    chainId: typeof value.chainId === 'string' && /^[a-f0-9]{32}$/.test(value.chainId) ? value.chainId : null,
  }
}

export function readNotificationSettings(storage) {
  try {
    return normalizeNotificationSettings(JSON.parse(storage?.getItem(NOTIFICATION_STORAGE_KEY) || 'null'))
  } catch {
    return defaultNotificationSettings()
  }
}

export function saveNotificationSettings(storage, settings) {
  const normalized = normalizeNotificationSettings(settings)
  try { storage?.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(normalized)) } catch { /* Keep the in-memory setting. */ }
  return normalized
}

export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
