import * as SyncApi from './sync.js'
import { localDay, localIso, sessionToJournalRecord } from './journal-record.js'

const ENABLED_KEY = 'focus.journalEnabled.v1'
const CONTENT_KEY = 'focus.journalContent.v1'
const HOSTNAME = globalThis.location?.hostname || ''
const REPO = Object.freeze({
  owner: HOSTNAME.endsWith('.github.io')
    ? HOSTNAME.slice(0, -'.github.io'.length)
    : '',
  repo: 'webapp-data',
  branch: 'main',
})

let clientPromise = null
let lastState = { status: 'not reported', pendingCount: 0, errorCode: '' }

function readItem(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function writeItem(key, value) {
  try { localStorage.setItem(key, value) } catch { /* Journal remains best-effort. */ }
}

function publish(patch) {
  lastState = { ...lastState, ...patch }
  window.dispatchEvent(new CustomEvent('focus-journal-state', { detail: lastState }))
}

function safeCode(error, fallback) {
  return typeof error?.code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(error.code)
    ? error.code
    : fallback
}

export function isJournalEnabled() {
  return readItem(ENABLED_KEY) === '1'
}

export function setJournalEnabled(enabled) {
  writeItem(ENABLED_KEY, enabled ? '1' : '0')
}
export function isJournalContentEnabled() { return readItem(CONTENT_KEY) !== '0' }
export async function setJournalContentEnabled(enabled) {
  writeItem(CONTENT_KEY, enabled ? '1' : '0')
  const client = await getClient()
  if (client && !enabled) await client.transformPending((record) => ({ ...withoutJournalContent(record), updatedAt: localIso() }))
  await reportJournalStatus()
}

export function withoutJournalContent(record) {
  const data = { ...(record.data || {}) }
  delete data.subject
  delete data.task
  return { ...record, title: 'Focus session', data: { ...data, contentIncluded: false } }
}

export function getJournalState() {
  return { enabled: isJournalEnabled(), ...lastState }
}

async function getClient() {
  if (clientPromise) {
    const existing = await clientPromise
    if (existing) return existing
    clientPromise = null
  }
  clientPromise = (async () => {
    const context = SyncApi.getContextId()
    if (!context) return null
    const module = await import('../../shared/v2/journal.js')
    return module.createJournalClient({
      app: 'focus',
      context,
      namespace: 'focus-journal',
      isEnabled: isJournalEnabled,
      resolveConfig: async () => {
        const token = SyncApi.getToken()
        if (!token) throw Object.assign(new Error('Journal authentication unavailable'), { type: 'auth', code: 'AUTH' })
        return { ...REPO, token }
      },
      onState: (state) => publish({
        status: state.status,
        pendingCount: state.pendingCount,
        errorCode: state.errorCode || '',
      }),
    })
  })().catch(() => null)
  return clientPromise
}

export async function queueSession(session, options = {}) {
  if (!isJournalEnabled() || !session) return { queued: false, reason: 'disabled' }
  const client = await getClient()
  if (!client) {
    publish({ status: 'error', errorCode: 'MODULE_UNAVAILABLE' })
    return { queued: false, reason: 'unavailable' }
  }
  try {
    return await client.enqueue(sessionToJournalRecord(session, { ...options, includeContent: isJournalContentEnabled() }), { date: localDay(session.endedAt) })
  } catch (error) {
    publish({ status: 'error', errorCode: safeCode(error, 'QUEUE_FAILED') })
    return { queued: false, reason: 'error' }
  }
}

export async function queueSessions(sessions) {
  const results = []
  for (const session of sessions) results.push(await queueSession(session))
  return results
}

export async function flushJournal() {
  const client = await getClient()
  if (!client) return { written: 0, pendingCount: 0, error: new Error('Journal unavailable') }
  return client.flush()
}

export async function redactJournalContent(from, to) {
  const client = await getClient()
  if (!client?.redactRange) return { error: Object.assign(new Error('Update Shared and reload Focus first.'), { code: 'CONTRACT_STALE' }) }
  return client.redactRange({ from, to, transform: withoutJournalContent })
}

export async function reportJournalStatus(extra = {}) {
  const client = await getClient()
  if (!client) return false
  try {
    await client.reportStatus({ journalEnabled: isJournalEnabled(), contentIncluded: isJournalContentEnabled(), ...extra })
    return true
  } catch (error) {
    publish({ status: 'error', errorCode: safeCode(error, 'STATUS_FAILED') })
    return false
  }
}

export async function refreshJournalState() {
  const client = await getClient()
  if (client) {
    try { publish({ pendingCount: await client.pendingCount() }) } catch { /* keep the last safe count */ }
  }
  return getJournalState()
}

export async function toggleJournal(enabled, preferredName = '') {
  if (enabled) {
    if (!SyncApi.getToken()) return { ok: false, reason: 'token' }
    if (!SyncApi.getContextId()) await SyncApi.ensureContext(preferredName)
    if (!SyncApi.getContextId()) return { ok: false, reason: 'context' }
  }
  clientPromise = null
  setJournalEnabled(enabled)
  publish({ status: enabled ? 'ready' : 'disabled', errorCode: '' })
  await reportJournalStatus({ enabledAt: enabled ? localIso() : undefined })
  return { ok: true }
}

export { localDay, localIso, sessionToJournalRecord }
