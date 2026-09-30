import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyThemeSetting,
  normalizeTheme,
  readShowLunarSetting,
  readThemeSetting,
  resolveTheme,
  saveShowLunarSetting,
  saveThemeSetting,
} from '../src/settingsUtils.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('normalizes and resolves light, dark, and system themes', () => {
  assert.equal(normalizeTheme('unknown'), 'system')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
})

test('persists theme and lunar display preferences', () => {
  const store = storage()
  assert.equal(readThemeSetting(store), 'system')
  assert.equal(readShowLunarSetting(store), true)
  assert.equal(saveThemeSetting(store, 'dark'), 'dark')
  assert.equal(saveShowLunarSetting(store, false), false)
  assert.equal(readThemeSetting(store), 'dark')
  assert.equal(readShowLunarSetting(store), false)
})

test('applies resolved theme to a document-like root', () => {
  const classes = new Set()
  const root = {
    dataset: {},
    style: {},
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name) } },
  }
  assert.equal(applyThemeSetting(root, 'system', true), 'dark')
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.style.colorScheme, 'dark')
  assert.equal(classes.has('dark'), true)
})
