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
    const transaction = db.transaction(SESSION_STORE, mode)
    const store = transaction.objectStore(SESSION_STORE)
    let value
    try {
      value = operation(store)
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    transaction.oncomplete = () => {
      db.close()
      resolve(value)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error || new Error('Database transaction failed'))
    }
  })
}

function getFallbackSessions() {
  const value = safeParse(localStorage.getItem(FALLBACK_SESSIONS_KEY), [])
  return Array.isArray(value) ? value : []
}

function setFallbackSessions(sessions) {
  localStorage.setItem(FALLBACK_SESSIONS_KEY, JSON.stringify(sessions))
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

export async function getSessions() {
  try {
    const sessions = await runStore('readonly', (store) => {
      const request = store.getAll()
      request.onsuccess = () => {}
      return request
    })
    const records = sessions?.result || []
    return [...records].sort((a, b) => b.endedAt - a.endedAt)
  } catch {
    return [...getFallbackSessions()].sort((a, b) => b.endedAt - a.endedAt)
  }
}

export async function addSession(session) {
  try {
    await runStore('readwrite', (store) => store.put(session))
  } catch {
    const sessions = getFallbackSessions().filter((item) => item.id !== session.id)
    sessions.push(session)
    setFallbackSessions(sessions)
  }
}

export async function replaceSessions(sessions) {
  try {
    await runStore('readwrite', (store) => {
      store.clear()
      sessions.forEach((session) => store.put(session))
    })
  } catch {
    setFallbackSessions(sessions)
  }
}

export async function deleteSession(id) {
  try {
    await runStore('readwrite', (store) => store.delete(id))
  } catch {
    setFallbackSessions(getFallbackSessions().filter((session) => session.id !== id))
  }
}

export async function clearSessions() {
  try {
    await runStore('readwrite', (store) => store.clear())
  } catch {
    setFallbackSessions([])
  }
}
