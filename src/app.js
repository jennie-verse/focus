import {
  DEFAULT_SETTINGS, FONT_SCALES,
  addSession, clearActiveTimer, clearSessions, deleteSession, getSessions,
  loadActiveTimer, loadSettings, replaceSessions, saveActiveTimer, saveSettings,
} from './storage.js'
import * as SyncApi from './sync.js'
import * as JournalApi from './journal.js'
import { formatTimer, getRecentDays, getStreak, getTodayStats } from './stats.js'
import { secondsFor, createTimer, restoreTimer, makeId, formatMoment, dateInputValue, daysInRange, nextModeAfter, adjustedMinutes } from './model.js'
import { toast, confirmModal } from './ui.js'

/* A session shorter than this (e.g. started then reset almost immediately)
   is not real use — skip queuing it to Daybook. The session still appears in
   this app's own Recent sessions list either way. */
const MIN_JOURNAL_SESSION_SECONDS = 180
import { renderTimerScreen, updateRing } from './timer-screen.js'
import { renderSettingsScreen } from './settings-screen.js'
import { APP_BUILD } from './version.js'

let audioContext = null
let tickInterval = null
let wakeLock = null
let wakeLockVisibilityHandler = null
let startupSyncDone = false
let timerStorageWarning = false

// Existing sessions, settings and active timers survive every app update.

function primeAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    if (audioContext.state === 'suspended') audioContext.resume()
  } catch {
    audioContext = null
  }
}

function playChime() {
  if (!audioContext) return
  const now = audioContext.currentTime
  ;[660, 880].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    gain.gain.setValueAtTime(0.0001, now + index * 0.18)
    gain.gain.exponentialRampToValueAtTime(0.24, now + index * 0.18 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.32)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(now + index * 0.18)
    oscillator.stop(now + index * 0.18 + 0.34)
  })
}

async function notifySessionEnd(mode) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const title = mode === 'focus' ? 'Focus session finished' : 'Break finished'
  const body = mode === 'focus' ? 'Nice work. Time for a break.' : 'Break is over. Ready to focus again?'
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { body, icon: './icons/icon-192.png', tag: 'focus-session-end' })
      return
    }
  } catch {
    // Fall through to the page-level Notification below.
  }
  try {
    new Notification(title, { body })
  } catch {
    // Notifications are best-effort; sound/vibration already covered the alert.
  }
}

async function exportBackupFile(filename, content, mime) {
  try {
    const file = new File([content], filename, { type: mime })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Focus backup', text: 'Choose Save to Files to keep it in iCloud Drive.' })
      return true
    }
  } catch (error) {
    if (error?.name === 'AbortError') return false
  }
  try {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

// ---------- state ----------

const initialSettings = (() => {
  const loaded = loadSettings()
  if (loaded.notify && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    return { ...loaded, notify: false }
  }
  return loaded
})()

const state = {
  settings: initialSettings,
  timer: restoreTimer(initialSettings, loadActiveTimer()),
  sessions: [],
  subject: loadActiveTimer()?.subject ?? localStorage.getItem('focus-last-subject') ?? '',
  task: loadActiveTimer()?.task || '',
  screen: 'timer',
  confirmClearBusy: false,
  lastBackupAt: Number(localStorage.getItem('focus-last-backup')) || 0,
  storagePersisted: null,
  syncState: {
    enabled: SyncApi.isEnabled(),
    hasToken: Boolean(SyncApi.getToken()),
    contextId: SyncApi.getContextId(),
    contextLabel: SyncApi.getContextLabel(),
    lastSyncAt: SyncApi.getLastSyncAt(),
    lastRemoteBackupAt: SyncApi.getLastRemoteBackupAt(),
    pendingCount: SyncApi.pendingEventCount(),
    lastError: '',
    busy: false,
  },
  tokenDraft: '',
  labelDraft: SyncApi.getContextLabel(),
  journalState: JournalApi.getJournalState(),
  journalFrom: (() => {
    const start = new Date()
    start.setMonth(start.getMonth() - 3)
    return dateInputValue(start)
  })(),
  journalTo: dateInputValue(),
  journalPreview: null,
  pendingImportSettings: null,
}

let completing = false

function readSyncState(patch = {}) {
  state.syncState = {
    ...state.syncState,
    enabled: SyncApi.isEnabled(),
    hasToken: Boolean(SyncApi.getToken()),
    contextId: SyncApi.getContextId(),
    contextLabel: SyncApi.getContextLabel(),
    lastSyncAt: SyncApi.getLastSyncAt(),
    lastRemoteBackupAt: SyncApi.getLastRemoteBackupAt(),
    pendingCount: SyncApi.pendingEventCount(),
    ...patch,
  }
}

async function refreshSessions() {
  state.sessions = await getSessions()
}

// ---------- render ----------

function computeDerived() {
  return {
    today: getTodayStats(state.sessions),
    streak: getStreak(state.sessions),
    days: getRecentDays(state.sessions),
  }
}

function render() {
  const container = document.getElementById('root')
  if (state.screen === 'timer') {
    const derived = computeDerived()
    renderTimerScreen(container, { ...state, ...derived }, timerHandlers)
  } else {
    renderSettingsScreen(container, {
      settings: state.settings,
      lastBackupAt: state.lastBackupAt,
      storagePersisted: state.storagePersisted,
      sync: buildSyncViewModel(),
      journal: buildJournalViewModel(),
    }, settingsHandlers)
  }
}

function buildSyncViewModel() {
  const s = state.syncState
  return {
    ...s,
    appBuild: APP_BUILD,
    canSync: s.enabled && s.hasToken && Boolean(s.contextId),
    tokenDraft: state.tokenDraft,
    tokenHint: s.hasToken ? 'Saved token is in use' : '',
    onTokenDraft: (value) => { state.tokenDraft = value },
    onSaveToken: saveSyncToken,
    onClearToken: clearSyncToken,
    onToggleEnabled: toggleSync,
    labelDraft: state.labelDraft,
    onLabelDraft: (value) => { state.labelDraft = value },
    onSaveLabel: saveContextLabel,
    lastSyncLabel: formatMoment(s.lastSyncAt),
    remoteBackupLabel: s.lastRemoteBackupAt ? `Last backup ${formatMoment(s.lastRemoteBackupAt)}` : 'Keeps the last 12 daily backups',
    onSyncNow: () => runSync({ manual: true }),
    onBackupToGitHub: backupToGitHub,
  }
}

function buildJournalViewModel() {
  return {
    ...state.journalState,
    contentIncluded: JournalApi.isJournalContentEnabled(),
    from: state.journalFrom,
    to: state.journalTo,
    preview: state.journalPreview,
    onFrom: (value) => { state.journalFrom = value; state.journalPreview = null; render() },
    onTo: (value) => { state.journalTo = value; state.journalPreview = null; render() },
    onToggle: toggleJournal,
    onContentToggle: async (value) => { await JournalApi.setJournalContentEnabled(value); state.journalState = await JournalApi.refreshJournalState(); render() },
    onPreview: () => { previewJournalHistory(); render() },
    onImport: prepareJournalImport,
    onRedact: prepareJournalRedaction,
  }
}

// ---------- timer lifecycle ----------

function applyFontScale() {
  const scale = FONT_SCALES[state.settings.fontScale] || 1
  document.documentElement.style.setProperty('--scale', scale)
}

function persistTimer() {
  try {
    saveActiveTimer({ ...state.timer, subject: state.subject, task: state.task })
    timerStorageWarning = false
  } catch {
    if (!timerStorageWarning) toast('The timer could not be saved on this device. Keep Focus open until you can save your session.')
    timerStorageWarning = true
  }
  document.title = state.timer.status === 'idle' ? 'Focus' : `${formatTimer(state.timer.remainingSeconds)} · Focus`
}

function stopTicking() {
  if (tickInterval) { window.clearInterval(tickInterval); tickInterval = null }
}

function startTicking() {
  stopTicking()
  const tick = () => {
    if (state.timer.status !== 'running' || completing) return
    const remaining = Math.max(0, (state.timer.targetEnd - Date.now()) / 1000)
    if (Math.ceil(state.timer.remainingSeconds) !== Math.ceil(remaining)) {
      state.timer = { ...state.timer, remainingSeconds: remaining }
      persistTimer()
      updateRing(document.getElementById('root'), state.timer)
    }
    // A timer restored after its deadline already has zero remaining seconds.
    // Completion must not depend on the displayed second changing.
    if (remaining <= 0) finishSession(true)
  }
  tickInterval = window.setInterval(tick, 250)
  tick()
}

async function releaseWakeLock() {
  if (wakeLockVisibilityHandler) {
    document.removeEventListener('visibilitychange', wakeLockVisibilityHandler)
    wakeLockVisibilityHandler = null
  }
  if (wakeLock) { try { await wakeLock.release() } catch { /* already released */ } wakeLock = null }
}

async function acquireWakeLock() {
  if (!navigator.wakeLock?.request) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Wake Lock is optional; the wall-clock timer still stays accurate.
  }
}

function manageWakeLock() {
  if (state.timer.status === 'running') {
    acquireWakeLock()
    if (!wakeLockVisibilityHandler) {
      wakeLockVisibilityHandler = () => { if (document.visibilityState === 'visible') acquireWakeLock() }
      document.addEventListener('visibilitychange', wakeLockVisibilityHandler)
    }
  } else {
    releaseWakeLock()
  }
}

function setTimer(next) {
  state.timer = next
  persistTimer()
  if (state.timer.status === 'running') startTicking()
  else stopTicking()
  manageWakeLock()
}

async function finishSession(completed) {
  if (completing) return
  completing = true
  const timer = state.timer
  const liveRemaining = timer.status === 'running' && timer.targetEnd
    ? Math.max(0, (timer.targetEnd - Date.now()) / 1000)
    : timer.remainingSeconds
  const elapsedSeconds = Math.max(1, Math.round(timer.totalSeconds - liveRemaining))
  const session = timer.pendingSession || {
    id: makeId(),
    mode: timer.mode,
    startedAt: timer.startedAt || Date.now() - elapsedSeconds * 1000,
    endedAt: completed && timer.targetEnd ? Math.min(Date.now(), timer.targetEnd) : Date.now(),
    plannedSeconds: timer.totalSeconds,
    elapsedSeconds,
    subject: state.subject.trim(),
    task: state.task.trim(),
    completed,
  }
  completed = session.completed
  try {
    await addSession(session)
  } catch {
    completing = false
    setTimer({ ...timer, status: 'paused', remainingSeconds: liveRemaining, targetEnd: null, pendingSession: session })
    render()
    toast('Could not save this session. Free some storage, then use Retry save.')
    return
  }
  if (elapsedSeconds >= MIN_JOURNAL_SESSION_SECONDS) JournalApi.queueSession(session)
  const records = await getSessions()
  state.sessions = records
  clearActiveTimer()

  if (completed) {
    if (state.settings.sound) playChime()
    if (state.settings.vibration && navigator.vibrate) navigator.vibrate([180, 80, 180])
    if (state.settings.notify) notifySessionEnd(timer.mode)
  }

  let nextMode = timer.mode === 'focus' ? 'short' : 'focus'
  if (timer.mode === 'focus') {
    const completedFocusCount = records.filter((record) => record.mode === 'focus' && record.completed).length
    nextMode = nextModeAfter('focus', completedFocusCount, state.settings.longEvery)
  }
  const nextTimer = createTimer(nextMode, state.settings, completed && state.settings.autoStart)
  state.task = ''
  setTimer(nextTimer)
  if (completed && state.settings.autoStart) primeAudio()
  toast(completed ? 'Session complete — saved.' : 'Logged the time you finished.')
  completing = false
  render()

  const event = SyncApi.sessionToEvent(session)
  if (event) SyncApi.queueEvent(event)
  if (SyncApi.isReady()) {
    try {
      await SyncApi.flushEvents()
      await SyncApi.pushData({ settings: state.settings, sessions: records })
      readSyncState({ lastError: '' })
    } catch (error) {
      readSyncState({ lastError: SyncApi.describeError(error) })
    }
  } else {
    readSyncState()
  }
  if (state.screen === 'settings') render()
}

// ---------- sync ----------

function buildBackup() {
  return { app: 'Focus', version: 1, exportedAt: Date.now(), settings: state.settings, sessions: state.sessions }
}

async function runSync({ manual = false } = {}) {
  if (!SyncApi.isReady()) return
  state.syncState = { ...state.syncState, busy: true }
  if (state.screen === 'settings') render()
  try {
    await SyncApi.flushEvents()
    const local = await getSessions()
    const remote = await SyncApi.pullSessions()
    const merged = new Map(local.map((item) => [item.id, item]))
    if (Array.isArray(remote)) {
      remote.forEach((item) => {
        if (!item || typeof item.id !== 'string') return
        const previous = merged.get(item.id)
        if (!previous || Number(item.endedAt) > Number(previous.endedAt)) merged.set(item.id, item)
      })
    }
    const mergedSessions = [...merged.values()]
    if (mergedSessions.length > local.length) {
      await replaceSessions(mergedSessions)
      await refreshSessions()
    }
    await SyncApi.pushData({ settings: state.settings, sessions: mergedSessions })
    readSyncState({ lastError: '', busy: false })
    if (manual) toast('Synced.')
  } catch (error) {
    readSyncState({ lastError: SyncApi.describeError(error), busy: false })
    if (manual) toast(SyncApi.describeError(error))
  }
  if (state.screen === 'settings') render()
}

async function backupToGitHub() {
  if (!SyncApi.isReady()) return
  state.syncState = { ...state.syncState, busy: true }
  render()
  try {
    await SyncApi.backupNow(buildBackup())
    readSyncState({ lastError: '', busy: false })
    toast('Backed up to GitHub.')
  } catch (error) {
    readSyncState({ lastError: SyncApi.describeError(error), busy: false })
    toast(SyncApi.describeError(error))
  }
  render()
}

function saveSyncToken() {
  const value = state.tokenDraft.trim()
  if (!value) { toast('Paste a token first.'); return }
  SyncApi.saveToken(value)
  state.tokenDraft = ''
  readSyncState({ lastError: '' })
  toast('Token saved.')
  render()
}

async function clearSyncToken() {
  const ok = await confirmModal({ title: 'Clear the token?', message: 'Sync stops until a token is entered again. Nothing stored on this device is removed.', confirmLabel: 'Clear token', danger: true })
  if (!ok) return
  SyncApi.clearToken()
  SyncApi.setEnabled(false)
  state.tokenDraft = ''
  readSyncState({ lastError: '' })
  toast('Token cleared. Sync is off.')
  render()
}

async function toggleSync(enabled) {
  if (enabled && !SyncApi.getToken()) { toast('Save a GitHub token first.'); return }
  if (enabled) {
    await SyncApi.ensureContext(state.labelDraft)
    if (state.labelDraft.trim()) SyncApi.setContextLabel(state.labelDraft)
    state.labelDraft = SyncApi.getContextLabel() || state.labelDraft
  }
  SyncApi.setEnabled(enabled)
  readSyncState({ lastError: '' })
  render()
  if (enabled) runSync({ manual: true })
}

function saveContextLabel() {
  SyncApi.setContextLabel(state.labelDraft)
  readSyncState()
}

// ---------- backup / restore ----------

async function exportBackup() {
  const backup = JSON.stringify(buildBackup(), null, 2)
  const filename = `focus-backup-${new Date().toISOString().slice(0, 10)}.json`
  const saved = await exportBackupFile(filename, backup, 'application/json')
  if (!saved) return
  const timestamp = Date.now()
  localStorage.setItem('focus-last-backup', String(timestamp))
  state.lastBackupAt = timestamp
  toast('Backup file created.')
  render()
}

async function importBackupFile(file) {
  try {
    const backup = JSON.parse(await file.text())
    if (backup?.app !== 'Focus' || !Array.isArray(backup.sessions)) throw new Error('Invalid backup')
    const merged = new Map(state.sessions.map((session) => [session.id, session]))
    backup.sessions.forEach((session) => session?.id && merged.set(session.id, session))
    await replaceSessions([...merged.values()])
    JournalApi.queueSessions(backup.sessions)
    await refreshSessions()
    if (backup.settings && typeof backup.settings === 'object') {
      state.pendingImportSettings = backup.settings
      toast('Records imported. Confirm whether to overwrite settings.')
    } else {
      toast('Backup records imported.')
    }
    render()
    if (state.pendingImportSettings) {
      const ok = await confirmModal({ title: 'Overwrite settings too?', message: 'This backup file also contains settings. Replacing your current settings cannot be undone.', confirmLabel: 'Overwrite settings' })
      if (ok) {
        state.settings = { ...DEFAULT_SETTINGS, ...state.pendingImportSettings }
        saveSettings(state.settings)
        applyFontScale()
        toast('Settings replaced with the backup values.')
      }
      state.pendingImportSettings = null
      render()
    }
  } catch {
    toast('That is not a valid Focus backup file.')
  }
}

// ---------- journal ----------

async function toggleJournal(enabled) {
  const result = await JournalApi.toggleJournal(enabled, state.labelDraft)
  if (!result.ok) {
    toast(result.reason === 'token' ? 'Save a GitHub token first.' : 'Set a device name first.')
    state.journalState = JournalApi.getJournalState()
    render()
    return
  }
  state.labelDraft = SyncApi.getContextLabel() || state.labelDraft
  state.journalState = await JournalApi.refreshJournalState()
  toast(enabled ? 'New Focus and break sessions will be included in Daybook.' : 'Journal inclusion is off.')
  render()
}

function journalRecordsInRange() {
  return state.sessions.filter((session) => {
    try {
      const day = JournalApi.localDay(session.endedAt)
      return day >= state.journalFrom && day <= state.journalTo
    } catch {
      return false
    }
  })
}

function previewJournalHistory() {
  const days = daysInRange(state.journalFrom, state.journalTo)
  if (!days) { toast('Choose a valid history range.'); return null }
  const records = journalRecordsInRange()
  const preview = { from: state.journalFrom, to: state.journalTo, days, records }
  state.journalPreview = preview
  return preview
}

async function prepareJournalImport() {
  if (!state.journalState.enabled) { toast('Turn on Include in journal first.'); return }
  const preview = previewJournalHistory()
  render()
  if (!preview) return
  const ok = await confirmModal({ title: 'Add existing history?', message: `${preview.records.length} session(s) from ${preview.from} through ${preview.to} will be added to Daybook.`, confirmLabel: 'Import' })
  if (ok) await importJournalHistory()
}

async function importJournalHistory() {
  const preview = state.journalPreview
  if (!preview) return
  await JournalApi.reportJournalStatus({ backfill: { status: 'running', from: preview.from, to: preview.to, processedDates: 0, totalDates: preview.days, updatedAt: JournalApi.localIso() } })
  await JournalApi.queueSessions(preview.records)
  const result = await JournalApi.flushJournal()
  await JournalApi.reportJournalStatus({ backfill: { status: result.error ? 'partial' : 'complete', from: preview.from, to: preview.to, processedDates: result.error ? 0 : preview.days, totalDates: preview.days, updatedAt: JournalApi.localIso() } })
  state.journalState = await JournalApi.refreshJournalState()
  toast(result.error ? 'History queued. It will retry when online.' : 'Existing Focus history added.')
  render()
}

async function prepareJournalRedaction() {
  if (!state.journalState.enabled) return toast('Turn on Include in journal first.')
  if (JournalApi.isJournalContentEnabled()) return toast('Turn off Upload subject and task on every active installation first.')
  if (!daysInRange(state.journalFrom, state.journalTo)) return toast('Choose a valid history range.')
  const ok = await confirmModal({ title: 'Remove content from current Daybook records?', message: `Focus subject and task will be removed from this installation's current projections from ${state.journalFrom} through ${state.journalTo}. Focus data, normal Sync, and existing Git history stay unchanged.`, confirmLabel: 'Remove content' })
  if (ok) await redactJournalHistory()
}

async function redactJournalHistory() {
  const result = await JournalApi.redactJournalContent(state.journalFrom, state.journalTo)
  state.journalState = await JournalApi.refreshJournalState()
  toast(result.error
    ? `Content removal paused after ${result.processedDates || 0}/${result.totalDates || 0} day(s). Pending work will retry.`
    : `Content removed from ${result.redactedRecords} current record(s).`)
  render()
}

// ---------- today handoff ----------

// Sends a finished session to Today's Timeline (mirrors Today's own "Send to
// Focus" — see today's app.js sendToFocus). Today decides what to do with
// the handoff; Focus keeps its own record of the session either way.
function sendToToday(session) {
  const title = (session.task || session.subject || '').trim()
  if (!title) { toast('Add a subject or task first.'); return }
  const params = new URLSearchParams({
    add: title,
    from: 'focus',
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    durationSec: String(session.elapsedSeconds),
  })
  window.location.href = `../today/?${params.toString()}`
}

// ---------- URL intake (?task=) — used by Today's "Send to Focus" ----------

function handleUrlIntake() {
  let params
  try { params = new URLSearchParams(location.search) } catch { return }
  const task = params.get('task')
  const fromParam = params.get('from')
  try { history.replaceState({}, '', location.pathname + location.hash) } catch { /* ignore */ }
  if (fromParam !== 'today' || task == null || !task.trim()) return
  state.task = task.trim().slice(0, 100)
  persistTimer()
  toast('Task filled in from Today.')
}

// ---------- session removal ----------

async function removeSession(id) {
  const removed = state.sessions.find((session) => session.id === id)
  await deleteSession(id)
  if (removed) JournalApi.queueSession(removed, { deleted: true, updatedAt: Date.now() })
  await refreshSessions()
  toast('Record deleted.')
  render()
}

async function removeAllSessions() {
  const ok = await confirmModal({ title: 'Delete all records?', message: 'Focus records cannot be recovered. Save a backup first if you might need them.', confirmLabel: 'Delete all', danger: true })
  if (!ok) return
  const removed = state.sessions.slice()
  await clearSessions()
  removed.forEach((session) => JournalApi.queueSession(session, { deleted: true, updatedAt: Date.now() }))
  state.sessions = []
  toast('All records deleted.')
  render()
}

// ---------- timer screen handlers ----------

const timerHandlers = {
  onSubject: (value) => { state.subject = value; localStorage.setItem('focus-last-subject', value); persistTimer() },
  onTask: (value) => { state.task = value; persistTimer() },
  onMode: (mode) => { setTimer(createTimer(mode, state.settings)); render() },
  onAdjust: (delta) => {
    const minutes = adjustedMinutes(state.timer.totalSeconds, delta)
    state.timer = { ...state.timer, totalSeconds: minutes * 60, remainingSeconds: minutes * 60 }
    persistTimer()
    render()
  },
  onStart: () => {
    if (state.settings.sound) primeAudio()
    const now = Date.now()
    setTimer({ ...state.timer, status: 'running', startedAt: now, targetEnd: now + state.timer.remainingSeconds * 1000 })
    render()
  },
  onPause: () => {
    const remaining = Math.max(0, (state.timer.targetEnd - Date.now()) / 1000)
    setTimer({ ...state.timer, status: 'paused', remainingSeconds: remaining, targetEnd: null })
    render()
  },
  onResume: () => {
    if (state.settings.sound) primeAudio()
    setTimer({ ...state.timer, status: 'running', targetEnd: Date.now() + state.timer.remainingSeconds * 1000 })
    render()
  },
  onEnd: () => finishSession(false),
  onSettings: () => { state.screen = 'settings'; render() },
  onDeleteSession: removeSession,
  onSendToToday: sendToToday,
}

// ---------- settings screen handlers ----------

const settingsHandlers = {
  onChange: (nextSettings) => {
    state.settings = nextSettings
    saveSettings(state.settings)
    applyFontScale()
    if (state.timer.status === 'idle') {
      state.timer = { ...state.timer, totalSeconds: secondsFor(state.timer.mode, nextSettings), remainingSeconds: secondsFor(state.timer.mode, nextSettings) }
      persistTimer()
    }
    toast('Settings saved.')
    render()
  },
  onBack: () => { state.screen = 'timer'; render() },
  onExport: exportBackup,
  onImport: () => document.getElementById('import-input').click(),
  onClear: removeAllSessions,
}

// ---------- boot ----------

async function ensurePersistentStorage() {
  try {
    if (!navigator.storage?.persisted || !navigator.storage?.persist) return
    const already = await navigator.storage.persisted()
    if (already) { state.storagePersisted = true; return }
    state.storagePersisted = await navigator.storage.persist()
  } catch {
    // Persistent storage is best-effort; ignore failures on unsupported browsers.
  }
}

function attachStaticListeners() {
  document.getElementById('import-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) importBackupFile(file)
  })
  window.addEventListener('focus-journal-state', (event) => {
    state.journalState = { ...JournalApi.getJournalState(), ...(event.detail || {}) }
    if (state.screen === 'settings') render()
  })
}

async function boot() {
  applyFontScale()
  attachStaticListeners()
  handleUrlIntake()
  render()

  state.sessions = await getSessions()
  render()

  state.journalState = await JournalApi.refreshJournalState()
  if (state.screen === 'settings') render()

  ensurePersistentStorage().then(() => { if (state.screen === 'settings') render() })

  if (state.timer.status === 'running') { startTicking(); manageWakeLock() }

  if (!startupSyncDone && SyncApi.isReady() && navigator.onLine) {
    startupSyncDone = true
    window.setTimeout(() => runSync(), 0)
  }

  if ('serviceWorker' in navigator) {
    const registerWorker = () => navigator.serviceWorker.register('./sw.js')
      .then((registration) => registration?.update())
      .catch((error) => console.warn('Service worker registration failed:', error))
    // IndexedDB/journal startup can finish after window.load has already fired.
    if (document.readyState === 'complete') registerWorker()
    else window.addEventListener('load', registerWorker, { once: true })
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  }
}

boot()
