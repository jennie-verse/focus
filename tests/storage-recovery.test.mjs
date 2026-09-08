import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/storage.js', import.meta.url), 'utf8').replaceAll('export ', '')
function storage() {
  const values = new Map(); let records = new Map()
  const faults = { writes: false, local: false, throwPut: false }
  const db = { close() {}, transaction(name, mode) {
    const staged = new Map(records); let aborted = false
    const tx = { abort() { aborted = true }, objectStore() { return {
      getAll() { return { result: [...records.values()] } },
      put(item) { if (faults.throwPut) throw new Error('Clone failed'); staged.set(item.id, item) },
      delete(id) { staged.delete(id) }, clear() { staged.clear() },
    } } }
    queueMicrotask(() => {
      if (aborted || (mode === 'readwrite' && faults.writes)) { tx.error = new Error('Aborted'); tx.onabort?.(); return }
      if (mode === 'readwrite') records = staged
      tx.oncomplete?.()
    })
    return tx
  } }
  const indexedDB = { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request } }
  const context = vm.createContext({ window: { indexedDB }, indexedDB, localStorage: {
    getItem(key) { return values.get(key) || null },
    setItem(key, value) { if (faults.local) throw new Error('Quota exceeded'); values.set(key, value) },
    removeItem(key) { values.delete(key) },
  } })
  vm.runInContext(source, context)
  return { context, values, faults, get records() { return [...records.values()] } }
}
const row = (id, endedAt = 1) => ({ id, endedAt })
const ids = rows => Array.from(rows, item => item.id).sort()

test('fallback additions remain visible alongside primary data and migrate after recovery', async () => {
  const run = storage(), api = run.context
  await api.addSession(row('primary'))
  run.faults.writes = true
  await api.addSession(row('fallback', 2))
  assert.deepEqual(ids(await api.getSessions()), ['fallback', 'primary'])
  run.faults.writes = false
  assert.deepEqual(ids(await api.getSessions()), ['fallback', 'primary'])
  assert.equal(run.values.has('focus-sessions-v1'), false)
  assert.deepEqual(ids(run.records), ['fallback', 'primary'])
})
test('fallback deletes, replacements and clear do not resurrect primary records', async () => {
  const run = storage(), api = run.context
  await api.addSession(row('old'))
  run.faults.writes = true
  await api.deleteSession('old')
  assert.deepEqual(ids(await api.getSessions()), [])
  await api.replaceSessions([row('restored')])
  assert.deepEqual(ids(await api.getSessions()), ['restored'])
  await api.clearSessions()
  assert.deepEqual(ids(await api.getSessions()), [])
  run.faults.writes = false
  await api.addSession(row('new'))
  assert.deepEqual(ids(await api.getSessions()), ['new'])
  assert.deepEqual(ids(run.records), ['new'])
})
test('legacy fallback arrays are merged and concurrent local saves are retained', async () => {
  const run = storage(), api = run.context
  await api.addSession(row('primary'))
  run.values.set('focus-sessions-v1', JSON.stringify([row('legacy')]))
  run.faults.writes = true
  await Promise.all([api.addSession(row('a')), api.addSession(row('b'))])
  assert.deepEqual(ids(await api.getSessions()), ['a', 'b', 'legacy', 'primary'])
})
test('failed replacement aborts the clear, and failed dual storage does not report success', async () => {
  const run = storage(), api = run.context
  await api.addSession(row('keep'))
  run.faults.throwPut = true; run.faults.local = true
  await assert.rejects(api.replaceSessions([row('new')]))
  assert.deepEqual(ids(run.records), ['keep'])
  assert.deepEqual(ids(await api.getSessions()), ['keep'])
  assert.throws(() => api.replaceSessions([{}]), /Invalid session/)
})
