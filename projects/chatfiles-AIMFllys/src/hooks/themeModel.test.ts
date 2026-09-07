import assert from 'node:assert/strict'
import test from 'node:test'
import * as themeModel from './themeModel.js'

const { parseThemePreference, resolveTheme, serializeThemePreference } = themeModel

test('accepts only supported persisted theme preferences', () => {
  assert.equal(parseThemePreference('system'), 'system')
  assert.equal(parseThemePreference('light'), 'light')
  assert.equal(parseThemePreference('dark'), 'dark')
  assert.equal(parseThemePreference('sepia'), 'system')
  assert.equal(parseThemePreference(null), 'system')
})

test('resolves system theme without overriding explicit choices', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('serializes the exact supported preference', () => {
  assert.equal(serializeThemePreference('system'), 'system')
  assert.equal(serializeThemePreference('light'), 'light')
  assert.equal(serializeThemePreference('dark'), 'dark')
})

test('cycles one theme control through system, light, and dark', () => {
  const next = (themeModel as { nextThemePreference?: (value: themeModel.ThemePreference) => themeModel.ThemePreference })
    .nextThemePreference
  assert.equal(typeof next, 'function')
  if (!next) return
  assert.equal(next('system'), 'light')
  assert.equal(next('light'), 'dark')
  assert.equal(next('dark'), 'system')
})
