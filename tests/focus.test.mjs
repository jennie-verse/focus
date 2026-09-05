import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { localDay, localIso, sessionToJournalRecord } from '../src/journal-record.js'
import { withoutJournalContent } from '../src/journal.js'
import { createTimer, restoreTimer, nextModeAfter, adjustedMinutes, secondsFor, MODES } from '../src/model.js'
import { DEFAULT_SETTINGS, FONT_SCALES } from '../src/storage.js'
import { getStreak, getTodayStats, getRecentDays, formatTimer, formatDuration } from '../src/stats.js'

function fixture(overrides = {}) {
  return {
    id: 'fixture-session',
    mode: 'focus',
    startedAt: new Date('2026-08-17T14:00:00.000Z').getTime(),
    endedAt: new Date('2026-08-17T14:25:00.000Z').getTime(),
    plannedSeconds: 1500,
    elapsedSeconds: 1500,
    subject: 'Fixture subject',
    task: 'Fixture task',
    completed: true,
    ...overrides,
  }
}

// ---------- journal (unchanged behavior — same as before the rewrite) ----------

test('all three stored session modes produce complete journal records', () => {
  const titles = new Map([['focus', 'Focus session'], ['short', 'Short break'], ['long', 'Long break']])
  for (const [mode, title] of titles) {
    const record = sessionToJournalRecord(fixture({ mode }))
    assert.equal(record.kind, 'session')
    assert.equal(record.title, title)
    assert.equal(record.data.mode, mode)
    assert.equal(record.data.subject, 'Fixture subject')
    assert.equal(record.data.task, 'Fixture task')
    assert.equal(record.data.completed, true)
    assert.match(record.at, /(?:Z|[+-]\d{2}:\d{2})$/)
  }
})

test('journal date follows the local day of the stored endedAt timestamp', () => {
  const session = fixture()
  assert.equal(localDay(session.endedAt), localIso(session.endedAt).slice(0, 10))
})

test('content-off session projections omit subject and task', () => {
  const record = sessionToJournalRecord(fixture(), { includeContent: false })
  assert.equal(record.data.subject, undefined)
  assert.equal(record.data.task, undefined)
  assert.equal(record.data.contentIncluded, false)
})

test('redaction preserves Focus timing metadata and strips private content', () => {
  const redacted = withoutJournalContent(sessionToJournalRecord(fixture()))
  assert.equal(redacted.title, 'Focus session')
  assert.equal(redacted.data.subject, undefined)
  assert.equal(redacted.data.task, undefined)
  assert.equal(redacted.data.contentIncluded, false)
  assert.equal(redacted.data.elapsedSeconds, 1500)
})

test('deletion creates a newer tombstone while retaining non-secret session fields', () => {
  const record = sessionToJournalRecord(fixture(), { deleted: true, updatedAt: new Date('2026-08-18T02:00:00.000Z').getTime() })
  assert.equal(record.deleted, true)
  assert.ok(Date.parse(record.updatedAt) > Date.parse(record.at))
  assert.equal(JSON.stringify(record).includes('token'), false)
})

// ---------- model.js (new, pure timer logic extracted from the old App.jsx) ----------

test('createTimer sizes itself from settings and starts idle unless told to run', () => {
  const settings = { ...DEFAULT_SETTINGS, focusMinutes: 25 }
  const idle = createTimer('focus', settings)
  assert.equal(idle.status, 'idle')
  assert.equal(idle.totalSeconds, 1500)
  assert.equal(idle.remainingSeconds, 1500)
  assert.equal(idle.startedAt, null)
  const running = createTimer('short', { ...settings, shortMinutes: 5 }, true)
  assert.equal(running.status, 'running')
  assert.ok(running.targetEnd > Date.now())
})

test('restoreTimer falls back to a fresh idle focus timer for anything unrecognized', () => {
  const settings = DEFAULT_SETTINGS
  assert.equal(restoreTimer(settings, null).status, 'idle')
  assert.equal(restoreTimer(settings, { mode: 'nonsense', status: 'running' }).mode, 'focus')
  assert.equal(restoreTimer(settings, { mode: 'focus', status: 'idle' }).status, 'idle')
})

test('restoreTimer recomputes remaining time for a running timer from its wall-clock target', () => {
  const settings = DEFAULT_SETTINGS
  const targetEnd = Date.now() + 10_000
  const restored = restoreTimer(settings, { mode: 'focus', status: 'running', totalSeconds: 1500, targetEnd })
  assert.ok(restored.remainingSeconds > 9 && restored.remainingSeconds <= 10)
})

test('nextModeAfter cycles focus/short and inserts a long break on the configured cadence', () => {
  assert.equal(nextModeAfter('focus', 1, 4), 'short')
  assert.equal(nextModeAfter('focus', 4, 4), 'long')
  assert.equal(nextModeAfter('focus', 8, 4), 'long')
  assert.equal(nextModeAfter('short', 0, 4), 'focus')
  assert.equal(nextModeAfter('long', 0, 4), 'focus')
})

test('adjustedMinutes clamps to 1-180 regardless of mode', () => {
  assert.equal(adjustedMinutes(60, 1), 2)
  assert.equal(adjustedMinutes(60, -100), 1)
  assert.equal(adjustedMinutes(180 * 60, 5), 180)
})

test('secondsFor reads the matching settings field per mode', () => {
  const settings = { focusMinutes: 25, shortMinutes: 5, longMinutes: 15 }
  assert.equal(secondsFor('focus', settings), 1500)
  assert.equal(secondsFor('short', settings), 300)
  assert.equal(secondsFor('long', settings), 900)
})

test('MODES and FONT_SCALES keep their existing shape (settings screen and CSS var depend on these)', () => {
  assert.deepEqual(MODES.map((m) => m.id), ['focus', 'short', 'long'])
  assert.deepEqual(FONT_SCALES, { 1: 0.5, 2: 0.667, 3: 0.833, 4: 1, 5: 1.167, 6: 1.417 })
  assert.equal(DEFAULT_SETTINGS.fontScale, 4)
})

// ---------- stats.js (unchanged — copied verbatim from the old build) ----------

test('stats helpers are unchanged: streak, today totals, and 7-day buckets', () => {
  const today = Date.now()
  const sessions = [
    { mode: 'focus', endedAt: today, elapsedSeconds: 1500, completed: true },
    { mode: 'short', endedAt: today, elapsedSeconds: 300, completed: true },
  ]
  assert.equal(getStreak(sessions), 1)
  const todayStats = getTodayStats(sessions)
  assert.equal(todayStats.seconds, 1500)
  assert.equal(todayStats.completed, 1)
  assert.equal(getRecentDays(sessions, 7).length, 7)
  assert.equal(formatTimer(90), '01:30')
  assert.equal(formatDuration(3661, true), '1h 1m')
})

// ---------- static contracts (mirrors the old build's DOM-touching assertions) ----------

test('Focus app connects finish, backup import, single delete, and delete-all after local storage calls', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8')
  assert.match(app, /await addSession\(session\)\s+JournalApi\.queueSession\(session\)/)
  assert.match(app, /await replaceSessions\(\[\.\.\.merged\.values\(\)\]\)\s+JournalApi\.queueSessions\(backup\.sessions\)/)
  assert.match(app, /await deleteSession\(id\)\s+if \(removed\) JournalApi\.queueSession/)
  assert.match(app, /await clearSessions\(\)\s+removed\.forEach/)
})

test('journal opt-in uses a separate default-off key and a dynamic shared/v2 import', async () => {
  const source = await readFile(new URL('../src/journal.js', import.meta.url), 'utf8')
  assert.match(source, /focus\.journalEnabled\.v1/)
  assert.match(source, /import\('\.\.\/\.\.\/shared\/v2\/journal\.js'\)/)
  assert.doesNotMatch(source, /@vite-ignore/)
})

test('shared sync v1 is loaded only when sync work is requested, via a plain relative import', async () => {
  const source = await readFile(new URL('../src/sync.js', import.meta.url), 'utf8')
  assert.match(source, /import\('\.\.\/\.\.\/shared\/v1\/sync\.js'\)/)
  assert.doesNotMatch(source, /@vite-ignore|import\.meta\.url/)
  assert.match(source, /const CONTEXT_KEY = `\$\{NAMESPACE\}\.syncContextId`/)
  assert.match(source, /export function getContextId\(\) \{\s+return readItem\(CONTEXT_KEY, ''\)/)
})

test('sync and journal derive the repository owner from the Pages hostname', async () => {
  for (const path of ['../src/sync.js', '../src/journal.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /globalThis\.location\?\.hostname/)
    assert.match(source, /HOSTNAME\.endsWith\('\.github\.io'\)/)
    assert.doesNotMatch(source, /owner:\s*['"]jennie-verse['"]/)
  }
})

test('no build tool is required — no bundler config, no JSX, no npm dependencies to install', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.devDependencies, undefined)
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /import\.meta\.env|from 'react'/)
})

test('service worker and visible build versions match', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8')
  const version = await readFile(new URL('../src/version.js', import.meta.url), 'utf8')
  const swVersion = sw.match(/const VERSION = '([^']+)'/)?.[1]
  const appBuild = version.match(/APP_BUILD = '([^']+)'/)?.[1]
  assert.ok(swVersion && appBuild, 'both files must declare a version string')
  assert.equal(swVersion, appBuild)
})

test('minimal mode setting exists and is wired into the timer screen and settings screen', async () => {
  const settings = await readFile(new URL('../src/settings-screen.js', import.meta.url), 'utf8')
  assert.match(settings, /minimalMode/)
  const timerScreen = await readFile(new URL('../src/timer-screen.js', import.meta.url), 'utf8')
  assert.match(timerScreen, /settings\.minimalMode && locked/)
})

test('the same localStorage/IndexedDB keys as the old build are still used, unchanged', async () => {
  const storage = await readFile(new URL('../src/storage.js', import.meta.url), 'utf8')
  for (const key of ["'focus-timer-v1'", "'focus-sessions-v1'", "'focus-settings-v1'", "'focus-active-v1'"]) {
    assert.ok(storage.includes(key), `storage.js must still reference ${key}`)
  }
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8')
  assert.match(app, /focus-last-subject/)
  assert.match(app, /focus-last-backup/)
})

test('the backup file format is unchanged: {app: "Focus", version: 1, settings, sessions}', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8')
  assert.match(app, /app: 'Focus', version: 1, exportedAt: Date\.now\(\), settings: state\.settings, sessions: state\.sessions/)
  assert.match(app, /backup\?\.app !== 'Focus' \|\| !Array\.isArray\(backup\.sessions\)/)
})
