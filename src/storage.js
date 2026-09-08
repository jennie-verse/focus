const DB_NAME = 'focus-timer-v1'
const DB_VERSION = 1
const SESSION_STORE = 'sessions'
const FALLBACK_SESSIONS_KEY = 'focus-sessions-v1'
const SETTINGS_KEY = 'focus-settings-v1'
const ACTIVE_KEY = 'focus-active-v1'

export const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortMinutes: 5,
  longMinutes: 15,
  longEvery: 4,
  sound: true,
  vibration: true,
  notify: true,
  autoStart: false,
  // Text size step, 1-6. 4 is today's default look (unchanged); see FONT_SCALES in App.jsx.
  fontScale: 4,
})

// Step 4 = 1.0 = the app's existing default look. The other steps scale
// proportionally around that same baseline (not the generic webapp-standard
// px values), so the app you already use does not shift size at step 4.
export const FONT_SCALES = Object.freeze({ 1: 0.5, 2: 0.667, 3: 0.833, 4: 1, 5: 1.167, 6: 1.417 })

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, { keyPath: 'id' })
        store.createIndex('endedAt', 'endedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Database open failed'))
  })
}

async function runStore(mode, operation) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    let transaction
    let value
    const fail = error => { db.close(); reject(error || new Error('Database transaction failed')) }
    try {
      transaction = db.transaction(SESSION_STORE, mode)
      transaction.oncomplete = () => { db.close(); resolve(value) }
      transaction.onerror = () => fail(transaction.error)
      transaction.onabort = () => fail(transaction.error || new Error('Database transaction aborted'))
      value = operation(transaction.objectStore(SESSION_STORE))
    } catch (error) {
      // In particular, a failed put after clear must never commit the clear.
      try { transaction?.abort() } catch {}
      fail(error)
    }
  })
}

// Pending fallback operations overlay IndexedDB, including deletions and full
// replacements. Old array backups remain readable as additional sessions.
function readFallback() {
  let raw = null
  try { raw = localStorage.getItem(FALLBACK_SESSIONS_KEY) } catch {}
  const value = safeParse(raw, null)
  const pending = Array.isArray(value)
    ? { sessions: value, deleted: [], replace: false }
    : value && Array.isArray(value.sessions) && Array.isArray(value.deleted)
      ? value : { sessions: [], deleted: [], replace: false }
  return { raw, pending }
}

function overlay(records, pending) {
  const sessions = new Map((pending.replace ? [] : records).map(item => [item.id, item]))
  pending.deleted.forEach(id => sessions.delete(id))
  pending.sessions.forEach(item => sessions.set(item.id, item))
  return [...sessions.values()]
}

function applyPending(store, pending) {
  if (pending.replace) store.clear()
  pending.deleted.forEach(id => store.delete(id))
  pending.sessions.forEach(item => store.put(item))
}

// Serialize this page's reads and writes so recovery cannot erase a newer save.
let sessionQueue = Promise.resolve()
function serial(operation) {
  const result = sessionQueue.then(operation)
  sessionQueue = result.catch(() => {})
  return result
}

async function recoverFallback(raw, pending) {
  await runStore('readwrite', store => applyPending(store, pending))
  // Keep the overlay if another page changed it while the transaction ran.
  try {
    if (localStorage.getItem(FALLBACK_SESSIONS_KEY) === raw) localStorage.removeItem(FALLBACK_SESSIONS_KEY)
  } catch { /* The committed overlay is safe to replay. */ }
}

function mutateSessions(change) {
  return serial(async () => {
    const { raw, pending } = readFallback()
    const next = change(pending)
    if (!raw) {
      try { await runStore('readwrite', store => applyPending(store, next)); return } catch {}
    }
    // Persist new intent before attempting recovery, so even a failed cleanup
    // cannot bring a deleted session back or replace a newly saved record.
    const saved = JSON.stringify({ version: 2, ...next })
    localStorage.setItem(FALLBACK_SESSIONS_KEY, saved)
    try { await recoverFallback(saved, next) } catch { /* Safely queued locally. */ }
  })
}

export function loadSettings() {
  const stored = safeParse(localStorage.getItem(SETTINGS_KEY), {})
  return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadActiveTimer() {
  const value = safeParse(localStorage.getItem(ACTIVE_KEY), null)
  return value && typeof value === 'object' ? value : null
}

export function saveActiveTimer(timer) {
  if (!timer || timer.status === 'idle') {
    localStorage.removeItem(ACTIVE_KEY)
    return
  }
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(timer))
}

export function clearActiveTimer() {
  localStorage.removeItem(ACTIVE_KEY)
}

export function getSessions() {
  return serial(async () => {
    let { raw, pending } = readFallback()
    if (raw) {
      try { await recoverFallback(raw, pending) } catch {}
      ;({ pending } = readFallback())
    }
    let records = []
    try { records = (await runStore('readonly', store => store.getAll()))?.result || [] } catch {}
    return overlay(records, pending).sort((a, b) => b.endedAt - a.endedAt)
  })
}

function validateSession(session) {
  if (!session || typeof session.id !== 'string' || !session.id || !Number.isFinite(session.endedAt)) {
    throw new Error('Invalid session record')
  }
}

export function addSession(session) {
  validateSession(session)
  return mutateSessions(pending => ({ ...pending,
    sessions: [...pending.sessions.filter(item => item.id !== session.id), session],
    deleted: pending.deleted.filter(id => id !== session.id),
  }))
}

export function replaceSessions(sessions) {
  if (!Array.isArray(sessions)) throw new Error('Invalid session backup')
  sessions.forEach(validateSession)
  return mutateSessions(() => ({ sessions, deleted: [], replace: true }))
}

export function deleteSession(id) {
  return mutateSessions(pending => ({ ...pending,
    sessions: pending.sessions.filter(item => item.id !== id),
    deleted: [...new Set([...pending.deleted, id])],
  }))
}

export function clearSessions() {
  return mutateSessions(() => ({ sessions: [], deleted: [], replace: true }))
}
