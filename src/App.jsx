import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TimerScreen from './components/TimerScreen.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import {
  DEFAULT_SETTINGS,
  FONT_SCALES,
  addSession,
  clearActiveTimer,
  clearSessions,
  deleteSession,
  getSessions,
  loadActiveTimer,
  loadSettings,
  replaceSessions,
  saveActiveTimer,
  saveSettings,
} from './storage.js'
import * as SyncApi from './sync.js'
import * as JournalApi from './journal.js'
import { formatTimer, getRecentDays, getStreak, getTodayStats } from './stats.js'

// 화면에 보여 주는 빌드 이름입니다. public/sw.js 의 VERSION 과 반드시 같아야 합니다
// (테스트가 두 값이 어긋나면 실패합니다).
//
// 왜 화면에 띄우는가: Service Worker 가 캐시를 먼저 돌려주기 때문에, 새 버전을 배포해도
// 앱을 처음 열 때는 **옛 코드가 그대로 돕니다.** 2026-08-09 에 이미 고친 버그가 이 때문에
// 한 번 더 데이터를 지웠습니다. 지금 무엇이 돌고 있는지 눈으로 확인할 수 있어야 합니다.
const APP_BUILD = '2026.08.21-resilient-sync'

const MODE_SETTING = {
  focus: 'focusMinutes',
  short: 'shortMinutes',
  long: 'longMinutes',
}

let audioContext = null

function secondsFor(mode, settings) {
  return settings[MODE_SETTING[mode]] * 60
}

function createTimer(mode, settings, running = false) {
  const totalSeconds = secondsFor(mode, settings)
  return {
    status: running ? 'running' : 'idle',
    mode,
    totalSeconds,
    remainingSeconds: totalSeconds,
    startedAt: running ? Date.now() : null,
    targetEnd: running ? Date.now() + totalSeconds * 1000 : null,
  }
}

function restoreTimer(settings) {
  const stored = loadActiveTimer()
  if (!stored || !MODE_SETTING[stored.mode] || !['running', 'paused'].includes(stored.status)) {
    return createTimer('focus', settings)
  }
  if (stored.status === 'running' && stored.targetEnd) {
    return { ...stored, remainingSeconds: Math.max(0, (stored.targetEnd - Date.now()) / 1000) }
  }
  return stored
}

function makeId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatMoment(timestamp) {
  if (!timestamp) return 'Never'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

function dateInputValue(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysInRange(from, to) {
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0
  return Math.floor((end - start) / 86400000) + 1
}

function primeAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    if (audioContext.state === 'suspended') audioContext.resume()
  } catch {
    audioContext = null
  }
}

async function notifySessionEnd(mode) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const title = mode === 'focus' ? 'Focus session finished' : 'Break finished'
  const body = mode === 'focus' ? 'Nice work. Time for a break.' : 'Break is over. Ready to focus again?'
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'focus-session-end' })
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

function ConfirmModal({ title, message, confirmLabel, danger = false, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div><button type="button" className="secondary-action" onClick={onCancel}>Cancel</button><button type="button" className={danger ? 'danger-action' : 'primary-action'} onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  )
}

export default function App() {
  const [settings, setSettings] = useState(() => {
    const loaded = loadSettings()
    if (loaded.notify && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return { ...loaded, notify: false }
    }
    return loaded
  })
  const [timer, setTimer] = useState(() => restoreTimer(settings))
  const [sessions, setSessions] = useState([])
  const [subject, setSubject] = useState(() => localStorage.getItem('focus-last-subject') || '')
  const [task, setTask] = useState('')
  const [screen, setScreen] = useState('timer')
  const [toast, setToast] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmJournalImport, setConfirmJournalImport] = useState(false)
  const [pendingImportSettings, setPendingImportSettings] = useState(null)
  const [lastBackupAt, setLastBackupAt] = useState(() => Number(localStorage.getItem('focus-last-backup')) || 0)
  const [storagePersisted, setStoragePersisted] = useState(null)
  const [syncState, setSyncState] = useState(() => ({
    enabled: SyncApi.isEnabled(),
    hasToken: Boolean(SyncApi.getToken()),
    contextId: SyncApi.getContextId(),
    contextLabel: SyncApi.getContextLabel(),
    lastSyncAt: SyncApi.getLastSyncAt(),
    lastRemoteBackupAt: SyncApi.getLastRemoteBackupAt(),
    pendingCount: SyncApi.pendingEventCount(),
    lastError: '',
    busy: false,
  }))
  const [tokenDraft, setTokenDraft] = useState('')
  const [labelDraft, setLabelDraft] = useState(() => SyncApi.getContextLabel())
  const [journalState, setJournalState] = useState(() => JournalApi.getJournalState())
  const [journalFrom, setJournalFrom] = useState(() => {
    const start = new Date()
    start.setMonth(start.getMonth() - 3)
    return dateInputValue(start)
  })
  const [journalTo, setJournalTo] = useState(() => dateInputValue())
  const [journalPreview, setJournalPreview] = useState(null)
  const importRef = useRef(null)
  const completionRef = useRef(false)
  const toastTimerRef = useRef(null)
  const startupSyncRef = useRef(false)

  const readSyncState = useCallback((patch = {}) => {
    setSyncState((current) => ({
      ...current,
      enabled: SyncApi.isEnabled(),
      hasToken: Boolean(SyncApi.getToken()),
      contextId: SyncApi.getContextId(),
      contextLabel: SyncApi.getContextLabel(),
      lastSyncAt: SyncApi.getLastSyncAt(),
      lastRemoteBackupAt: SyncApi.getLastRemoteBackupAt(),
      pendingCount: SyncApi.pendingEventCount(),
      ...patch,
    }))
  }, [])

  const showToast = useCallback((message) => {
    setToast(message)
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const refreshSessions = useCallback(async () => {
    const records = await getSessions()
    setSessions(records)
  }, [])

  useEffect(() => {
    let cancelled = false
    getSessions().then((records) => {
      if (!cancelled) setSessions(records)
    })
    return () => {
      cancelled = true
      window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const update = (event) => setJournalState({ ...JournalApi.getJournalState(), ...(event.detail || {}) })
    window.addEventListener('focus-journal-state', update)
    JournalApi.refreshJournalState().then(setJournalState)
    return () => window.removeEventListener('focus-journal-state', update)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function ensurePersistentStorage() {
      try {
        if (!navigator.storage?.persisted || !navigator.storage?.persist) return
        const already = await navigator.storage.persisted()
        if (cancelled) return
        if (already) {
          setStoragePersisted(true)
          return
        }
        const granted = await navigator.storage.persist()
        if (!cancelled) setStoragePersisted(granted)
      } catch {
        // Persistent storage is best-effort; ignore failures on unsupported browsers.
      }
    }
    ensurePersistentStorage()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const scale = FONT_SCALES[settings.fontScale] || 1
    document.documentElement.style.setProperty('--scale', scale)
  }, [settings.fontScale])

  useEffect(() => {
    saveActiveTimer(timer)
    document.title = timer.status === 'idle' ? 'Focus' : `${formatTimer(timer.remainingSeconds)} · Focus`
  }, [timer])

  useEffect(() => {
    localStorage.setItem('focus-last-subject', subject)
  }, [subject])

  const finishSession = useCallback(async (completed) => {
    if (completionRef.current) return
    completionRef.current = true
    const liveRemaining = timer.status === 'running' && timer.targetEnd
      ? Math.max(0, (timer.targetEnd - Date.now()) / 1000)
      : timer.remainingSeconds
    const elapsedSeconds = Math.max(1, Math.round(timer.totalSeconds - liveRemaining))
    const session = {
      id: makeId(),
      mode: timer.mode,
      startedAt: timer.startedAt || Date.now() - elapsedSeconds * 1000,
      endedAt: Date.now(),
      plannedSeconds: timer.totalSeconds,
      elapsedSeconds,
      subject: subject.trim(),
      task: task.trim(),
      completed,
    }
    await addSession(session)
    JournalApi.queueSession(session)
    const records = await getSessions()
    setSessions(records)
    clearActiveTimer()

    if (completed) {
      if (settings.sound) playChime()
      if (settings.vibration && navigator.vibrate) navigator.vibrate([180, 80, 180])
      if (settings.notify) notifySessionEnd(timer.mode)
    }

    let nextMode = timer.mode === 'focus' ? 'short' : 'focus'
    if (timer.mode === 'focus') {
      const completedFocusCount = records.filter((record) => record.mode === 'focus' && record.completed).length
      if (completedFocusCount > 0 && completedFocusCount % settings.longEvery === 0) nextMode = 'long'
    }
    const nextTimer = createTimer(nextMode, settings, completed && settings.autoStart)
    setTimer(nextTimer)
    if (completed && settings.autoStart) primeAudio()
    setTask('')
    showToast(completed ? 'Session complete — saved.' : 'Logged the time you finished.')
    completionRef.current = false

    // 기록은 이미 기기에 저장됐습니다. 동기화는 그 뒤에 조용히 따라갑니다.
    // 실패해도 화면 흐름을 막지 않고, 보내지 못한 이벤트는 큐에 남습니다.
    const event = SyncApi.sessionToEvent(session)
    if (event) SyncApi.queueEvent(event)
    if (SyncApi.isReady()) {
      try {
        await SyncApi.flushEvents()
        await SyncApi.pushData({ settings, sessions: records })
        readSyncState({ lastError: '' })
      } catch (error) {
        readSyncState({ lastError: SyncApi.describeError(error) })
      }
    } else {
      readSyncState()
    }
  }, [readSyncState, settings, showToast, subject, task, timer])

  useEffect(() => {
    if (timer.status !== 'running') return undefined
    const tick = () => {
      const remaining = Math.max(0, (timer.targetEnd - Date.now()) / 1000)
      setTimer((current) => Math.ceil(current.remainingSeconds) === Math.ceil(remaining) ? current : { ...current, remainingSeconds: remaining })
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [timer.status, timer.targetEnd])

  useEffect(() => {
    if (timer.status === 'running' && timer.remainingSeconds <= 0) finishSession(true)
  }, [finishSession, timer.remainingSeconds, timer.status])

  useEffect(() => {
    if (timer.status !== 'running' || !navigator.wakeLock?.request) return undefined
    let lock = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) await lock.release()
      } catch {
        // Wake Lock is optional; the wall-clock timer still stays accurate.
      }
    }
    acquire()
    const handleVisibility = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      lock?.release().catch(() => {})
    }
  }, [timer.status])

  const today = useMemo(() => getTodayStats(sessions), [sessions])
  const days = useMemo(() => getRecentDays(sessions), [sessions])
  const streak = useMemo(() => getStreak(sessions), [sessions])

  const changeMode = (mode) => setTimer(createTimer(mode, settings))
  const adjustMinutes = (delta) => setTimer((current) => {
    const minutes = Math.max(1, Math.min(180, Math.round(current.totalSeconds / 60) + delta))
    return { ...current, totalSeconds: minutes * 60, remainingSeconds: minutes * 60 }
  })
  const start = () => {
    if (settings.sound) primeAudio()
    const now = Date.now()
    setTimer((current) => ({ ...current, status: 'running', startedAt: now, targetEnd: now + current.remainingSeconds * 1000 }))
  }
  const pause = () => setTimer((current) => {
    const remaining = Math.max(0, (current.targetEnd - Date.now()) / 1000)
    return { ...current, status: 'paused', remainingSeconds: remaining, targetEnd: null }
  })
  const resume = () => {
    if (settings.sound) primeAudio()
    setTimer((current) => ({ ...current, status: 'running', targetEnd: Date.now() + current.remainingSeconds * 1000 }))
  }

  const handleSettingsChange = async (nextSettings) => {
    setSettings(nextSettings)
    setTimer((current) => current.status === 'idle'
      ? { ...current, totalSeconds: secondsFor(current.mode, nextSettings), remainingSeconds: secondsFor(current.mode, nextSettings) }
      : current)
    showToast('Settings saved.')
  }

  const buildBackup = useCallback(() => ({
    app: 'Focus', version: 1, exportedAt: Date.now(), settings, sessions,
  }), [settings, sessions])

  const runSync = useCallback(async ({ manual = false } = {}) => {
    if (!SyncApi.isReady()) return
    setSyncState((current) => ({ ...current, busy: true }))
    try {
      await SyncApi.flushEvents()

      // 로컬 기록은 화면 상태가 아니라 저장소에서 새로 읽습니다.
      // 화면 상태(sessions)는 앱을 막 열었을 때 아직 비어 있습니다. 그 빈 배열을 올려서
      // 원격에 있던 기록 3건이 실제로 지워졌습니다. 같은 실수를 구조적으로 막습니다.
      const local = await getSessions()

      // 받아오기를 먼저 합니다. 올리기가 먼저면 아직 받지 못한 기록을 덮어씁니다.
      const remote = await SyncApi.pullSessions()

      // 합집합만 만듭니다. 같은 id 는 endedAt 이 최신인 쪽이 이깁니다.
      // 이 자리에서 항목이 줄어드는 경우는 없습니다.
      const merged = new Map(local.map((item) => [item.id, item]))
      if (Array.isArray(remote)) {
        remote.forEach((item) => {
          if (!item || typeof item.id !== 'string') return
          const previous = merged.get(item.id)
          if (!previous || Number(item.endedAt) > Number(previous.endedAt)) merged.set(item.id, item)
        })
      }
      const mergedSessions = [...merged.values()]

      // 늘어났을 때만 로컬을 다시 씁니다. replaceSessions 는 저장소를 비우고 새로 쓰므로
      // 줄어든 목록을 넘기면 그대로 유실됩니다.
      if (mergedSessions.length > local.length) {
        await replaceSessions(mergedSessions)
        await refreshSessions()
      }

      await SyncApi.pushData({ settings, sessions: mergedSessions })
      readSyncState({ lastError: '', busy: false })
      if (manual) showToast('Synced.')
    } catch (error) {
      readSyncState({ lastError: SyncApi.describeError(error), busy: false })
      if (manual) showToast(SyncApi.describeError(error))
    }
    // sessions(화면 상태)는 일부러 쓰지 않습니다. 저장소에서 새로 읽기 때문입니다.
  }, [readSyncState, refreshSessions, settings, showToast])

  // 앱을 열 때 한 번 원격을 받아 옵니다.
  //
  // 예전에는 동기화를 켜는 순간과 Sync now 를 누를 때만 받아왔습니다. 그런데 세션을 끝낼 때는
  // 올리기만 하고 받아오지 않아서, 켜는 순간의 통신이 한 번 실패하면 그 기기는 원격에 있는
  // 기록을 영영 따라잡지 못했습니다(홈 화면 앱을 지웠다 다시 깐 뒤 실제로 그렇게 됐습니다).
  // 앱을 열 때마다 한 번 맞춰 주면 스스로 회복합니다. 실패해도 조용히 넘어갑니다.
  useEffect(() => {
    if (startupSyncRef.current) return
    if (!SyncApi.isReady() || !navigator.onLine) return
    startupSyncRef.current = true
    // 첫 화면이 그려진 뒤에 시작합니다. 이펙트 본문에서 바로 부르면 상태 변경이
    // 렌더와 겹쳐 불필요한 연쇄 렌더가 생깁니다.
    const timer = window.setTimeout(() => runSync(), 0)
    return () => window.clearTimeout(timer)
  }, [runSync])

  const backupToGitHub = async () => {
    if (!SyncApi.isReady()) return
    setSyncState((current) => ({ ...current, busy: true }))
    try {
      await SyncApi.backupNow(buildBackup())
      readSyncState({ lastError: '', busy: false })
      showToast('Backed up to GitHub.')
    } catch (error) {
      readSyncState({ lastError: SyncApi.describeError(error), busy: false })
      showToast(SyncApi.describeError(error))
    }
  }

  const saveSyncToken = () => {
    const value = tokenDraft.trim()
    if (!value) {
      showToast('Paste a token first.')
      return
    }
    SyncApi.saveToken(value)
    setTokenDraft('')
    readSyncState({ lastError: '' })
    showToast('Token saved.')
  }

  const clearSyncToken = () => {
    SyncApi.clearToken()
    SyncApi.setEnabled(false)
    setTokenDraft('')
    readSyncState({ lastError: '' })
    showToast('Token cleared. Sync is off.')
  }

  const toggleSync = async (enabled) => {
    if (enabled && !SyncApi.getToken()) {
      showToast('Save a GitHub token first.')
      return
    }
    if (enabled) {
      // 켜기 전에 입력한 이름을 넘겨야 파일 이름이 알아볼 수 있게 만들어집니다.
      // ID 는 이때 정해지고 이후 바뀌지 않습니다.
      await SyncApi.ensureContext(labelDraft)
      if (labelDraft.trim()) SyncApi.setContextLabel(labelDraft)
      setLabelDraft(SyncApi.getContextLabel() || labelDraft)
    }
    SyncApi.setEnabled(enabled)
    readSyncState({ lastError: '' })
    if (enabled) runSync({ manual: true })
  }

  const saveContextLabel = () => {
    SyncApi.setContextLabel(labelDraft)
    readSyncState()
  }

  const exportBackup = async () => {
    const backup = JSON.stringify(buildBackup(), null, 2)
    const filename = `focus-backup-${new Date().toISOString().slice(0, 10)}.json`
    const saved = await exportBackupFile(filename, backup, 'application/json')
    if (!saved) return
    const timestamp = Date.now()
    localStorage.setItem('focus-last-backup', String(timestamp))
    setLastBackupAt(timestamp)
    showToast('Backup file created.')
  }

  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      if (backup?.app !== 'Focus' || !Array.isArray(backup.sessions)) throw new Error('Invalid backup')
      const merged = new Map(sessions.map((session) => [session.id, session]))
      backup.sessions.forEach((session) => session?.id && merged.set(session.id, session))
      await replaceSessions([...merged.values()])
      JournalApi.queueSessions(backup.sessions)
      await refreshSessions()
      if (backup.settings && typeof backup.settings === 'object') {
        setPendingImportSettings(backup.settings)
        showToast('Records imported. Confirm whether to overwrite settings.')
      } else {
        showToast('Backup records imported.')
      }
    } catch {
      showToast('That is not a valid Focus backup file.')
    }
  }

  const applyImportedSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS, ...pendingImportSettings })
    setPendingImportSettings(null)
    showToast('Settings replaced with the backup values.')
  }

  const removeSession = async (id) => {
    const removed = sessions.find((session) => session.id === id)
    await deleteSession(id)
    if (removed) JournalApi.queueSession(removed, { deleted: true, updatedAt: Date.now() })
    await refreshSessions()
    showToast('Record deleted.')
  }

  const removeAll = async () => {
    const removed = sessions.slice()
    await clearSessions()
    removed.forEach((session) => JournalApi.queueSession(session, { deleted: true, updatedAt: Date.now() }))
    setSessions([])
    setConfirmClear(false)
    showToast('All records deleted.')
  }

  const toggleJournal = async (enabled) => {
    const result = await JournalApi.toggleJournal(enabled, labelDraft)
    if (!result.ok) {
      showToast(result.reason === 'token' ? 'Save a GitHub token first.' : 'Set a device name first.')
      setJournalState(JournalApi.getJournalState())
      return
    }
    setLabelDraft(SyncApi.getContextLabel() || labelDraft)
    setJournalState(await JournalApi.refreshJournalState())
    showToast(enabled ? 'New Focus and break sessions will be included in Daybook.' : 'Journal inclusion is off.')
  }

  const journalRecordsInRange = useCallback(() => sessions.filter((session) => {
    try {
      const day = JournalApi.localDay(session.endedAt)
      return day >= journalFrom && day <= journalTo
    } catch {
      return false
    }
  }), [journalFrom, journalTo, sessions])

  const previewJournalHistory = () => {
    const days = daysInRange(journalFrom, journalTo)
    if (!days) {
      showToast('Choose a valid history range.')
      return null
    }
    const records = journalRecordsInRange()
    const preview = { from: journalFrom, to: journalTo, days, records }
    setJournalPreview(preview)
    return preview
  }

  const prepareJournalImport = () => {
    if (!journalState.enabled) {
      showToast('Turn on Include in journal first.')
      return
    }
    const preview = previewJournalHistory()
    if (preview) setConfirmJournalImport(true)
  }

  const importJournalHistory = async () => {
    const preview = journalPreview
    setConfirmJournalImport(false)
    if (!preview) return
    await JournalApi.reportJournalStatus({ backfill: {
      status: 'running', from: preview.from, to: preview.to,
      processedDates: 0, totalDates: preview.days, updatedAt: JournalApi.localIso(),
    } })
    await JournalApi.queueSessions(preview.records)
    const result = await JournalApi.flushJournal()
    await JournalApi.reportJournalStatus({ backfill: {
      status: result.error ? 'partial' : 'complete', from: preview.from, to: preview.to,
      processedDates: result.error ? 0 : preview.days, totalDates: preview.days,
      updatedAt: JournalApi.localIso(),
    } })
    setJournalState(await JournalApi.refreshJournalState())
    showToast(result.error ? 'History queued. It will retry when online.' : 'Existing Focus history added.')
  }

  return (
    <>
      {screen === 'timer' ? (
        <TimerScreen
          timer={timer}
          subject={subject}
          task={task}
          onSubject={setSubject}
          onTask={setTask}
          onMode={changeMode}
          onAdjust={adjustMinutes}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onEnd={() => finishSession(false)}
          onSettings={() => setScreen('settings')}
          today={today}
          streak={streak}
          days={days}
          sessions={sessions}
          onDeleteSession={removeSession}
        />
      ) : (
        <SettingsScreen
          settings={settings}
          onChange={handleSettingsChange}
          onBack={() => setScreen('timer')}
          onExport={exportBackup}
          onImport={() => importRef.current?.click()}
          onClear={() => setConfirmClear(true)}
          lastBackupAt={lastBackupAt}
          storagePersisted={storagePersisted}
          sync={{
            ...syncState,
            appBuild: APP_BUILD,
            canSync: syncState.enabled && syncState.hasToken && Boolean(syncState.contextId),
            tokenDraft,
            tokenHint: syncState.hasToken ? 'Saved token is in use' : '',
            onTokenDraft: setTokenDraft,
            onSaveToken: saveSyncToken,
            onClearToken: clearSyncToken,
            onToggleEnabled: toggleSync,
            labelDraft,
            onLabelDraft: setLabelDraft,
            onSaveLabel: saveContextLabel,
            lastSyncLabel: formatMoment(syncState.lastSyncAt),
            remoteBackupLabel: syncState.lastRemoteBackupAt
              ? `Last backup ${formatMoment(syncState.lastRemoteBackupAt)}`
              : 'Keeps the last 12 daily backups',
            onSyncNow: () => runSync({ manual: true }),
            onBackupToGitHub: backupToGitHub,
          }}
          journal={{
            ...journalState,
            from: journalFrom,
            to: journalTo,
            preview: journalPreview,
            onFrom: (value) => { setJournalFrom(value); setJournalPreview(null) },
            onTo: (value) => { setJournalTo(value); setJournalPreview(null) },
            onToggle: toggleJournal,
            onPreview: previewJournalHistory,
            onImport: prepareJournalImport,
          }}
        />
      )}
      <input ref={importRef} className="hidden-file" type="file" accept=".json,application/json" onChange={importBackup} />
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
      {confirmClear ? <ConfirmModal title="Delete all records?" message="Focus records cannot be recovered. Save a backup first if you might need them." confirmLabel="Delete all" danger onCancel={() => setConfirmClear(false)} onConfirm={removeAll} /> : null}
      {confirmJournalImport ? <ConfirmModal title="Add existing history?" message={`${journalPreview?.records.length || 0} session(s) from ${journalPreview?.from} through ${journalPreview?.to} will be added to Daybook.`} confirmLabel="Import" onCancel={() => setConfirmJournalImport(false)} onConfirm={importJournalHistory} /> : null}
      {pendingImportSettings ? <ConfirmModal title="Overwrite settings too?" message="This backup file also contains settings. Replacing your current settings cannot be undone." confirmLabel="Overwrite settings" onCancel={() => setPendingImportSettings(null)} onConfirm={applyImportedSettings} /> : null}
    </>
  )
}
