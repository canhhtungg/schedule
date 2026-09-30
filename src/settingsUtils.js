export const THEME_STORAGE_KEY = 'campus-planner.theme'
export const SHOW_LUNAR_STORAGE_KEY = 'campus-planner.show-lunar'
export const THEME_OPTIONS = ['light', 'dark', 'system']

export function normalizeTheme(value) {
  return THEME_OPTIONS.includes(value) ? value : 'system'
}

export function resolveTheme(setting, prefersDark = false) {
  const normalized = normalizeTheme(setting)
  return normalized === 'system' ? (prefersDark ? 'dark' : 'light') : normalized
}

export function applyThemeSetting(root, setting, prefersDark = false) {
  const resolved = resolveTheme(setting, prefersDark)
  root.dataset.theme = resolved
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  return resolved
}

export function readThemeSetting(storage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function readShowLunarSetting(storage) {
  try {
    const value = storage?.getItem(SHOW_LUNAR_STORAGE_KEY)
    return value === null || value === undefined ? true : value === 'true'
  } catch {
    return true
  }
}

export function saveThemeSetting(storage, setting) {
  const normalized = normalizeTheme(setting)
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalized)
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
  return normalized
}

export function saveShowLunarSetting(storage, showLunar) {
  const normalized = Boolean(showLunar)
  try {
    storage?.setItem(SHOW_LUNAR_STORAGE_KEY, String(normalized))
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
  return normalized
}
