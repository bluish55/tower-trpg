// 브라우저 저장 (localStorage). 진행 상황, 탐사 기록, 설정.
import type { Archive, Game } from './types'
import { emptyArchive } from './engine'

const SAVE_KEY = 'tower_save_v3'
const ARCHIVE_KEY = 'tower_archive_v3'
const SETTINGS_KEY = 'tower_settings_v3'

export interface Settings { apiKey: string; model: string; remember: boolean; debug: boolean }
export const DEFAULT_SETTINGS: Settings = { apiKey: '', model: '', remember: false, debug: false }

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

export function loadGame(): Game | null {
  return safe(() => {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Game | null
    return g && g.v === 3 ? g : null
  }, null)
}
export function saveGame(g: Game) {
  safe(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(g))
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(g.archive))
  }, undefined)
}
export function clearGame() { safe(() => localStorage.removeItem(SAVE_KEY), undefined) }

export function loadArchive(): Archive {
  return safe(() => ({ ...emptyArchive(), ...(JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? 'null') ?? {}) }), emptyArchive())
}
export function saveArchive(a: Archive) { safe(() => localStorage.setItem(ARCHIVE_KEY, JSON.stringify(a)), undefined) }

export function loadSettings(): Settings {
  return safe(() => {
    const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') ?? {}) } as Settings
    if (!s.apiKey) s.apiKey = sessionStorage.getItem(SETTINGS_KEY + '_key') ?? ''
    return s
  }, DEFAULT_SETTINGS)
}
export function saveSettings(s: Settings) {
  safe(() => {
    const stored = { ...s }
    if (!s.remember) {
      sessionStorage.setItem(SETTINGS_KEY + '_key', s.apiKey)
      stored.apiKey = ''
    } else sessionStorage.removeItem(SETTINGS_KEY + '_key')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored))
  }, undefined)
}
