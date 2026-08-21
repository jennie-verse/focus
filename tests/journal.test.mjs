import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { localDay, localIso, sessionToJournalRecord } from '../src/journal-record.js'

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

test('all three stored session modes produce complete journal records', () => {
  const titles = new Map([
    ['focus', 'Focus session'], ['short', 'Short break'], ['long', 'Long break'],
  ])
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

test('deletion creates a newer tombstone while retaining non-secret session fields', () => {
  const record = sessionToJournalRecord(fixture(), {
    deleted: true,
    updatedAt: new Date('2026-08-18T02:00:00.000Z').getTime(),
  })
  assert.equal(record.deleted, true)
  assert.ok(Date.parse(record.updatedAt) > Date.parse(record.at))
  assert.equal(JSON.stringify(record).includes('token'), false)
})

test('Focus app connects finish, backup import, single delete, and delete-all after local storage calls', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /await addSession\(session\)\s+JournalApi\.queueSession\(session\)/)
  assert.match(app, /await replaceSessions\([^\n]+\)\s+JournalApi\.queueSessions\(backup\.sessions\)/)
  assert.match(app, /await deleteSession\(id\)\s+if \(removed\) JournalApi\.queueSession/)
  assert.match(app, /await clearSessions\(\)\s+removed\.forEach/)
})

test('journal opt-in uses a separate default-off key and a dynamic shared/v2 import', async () => {
  const source = await readFile(new URL('../src/journal.js', import.meta.url), 'utf8')
  assert.match(source, /focus\.journalEnabled\.v1/)
  assert.match(source, /import\(\/\* @vite-ignore \*\/ MODULE_URL\)/)
  assert.doesNotMatch(source, /SyncApi\.isEnabled\(\).*setJournalEnabled/s)
})

test('shared sync v1 is loaded only when sync work is requested', async () => {
  const source = await readFile(new URL('../src/sync.js', import.meta.url), 'utf8')
  assert.match(source, /import\(\/\* @vite-ignore \*\/ SHARED_URL\)/)
  assert.doesNotMatch(source, /^import\s+.*shared\/v1\/sync\.js/m)
  assert.match(source, /const CONTEXT_KEY = `\$\{NAMESPACE\}\.syncContextId`/)
  assert.match(source, /export function getContextId\(\) \{\s+return readItem\(CONTEXT_KEY, ''\)/)
})
