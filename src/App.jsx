import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TimerScreen from './components/TimerScreen.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import {
  DEFAULT_SETTINGS,
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
import { formatTimer, getRecentDays, getStreak, getTodayStats } from './stats.js'

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

function ConfirmModal({ title, message, confirmLabel, danger = false, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div><button type="button" className="secondary-action" onClick={onCancel}>취소</button><button type="button" className={danger ? 'danger-action' : 'primary-action'} onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  )
}

export default function App() {
  const [settings, setSettings] = useState(() => loadSettings())
  const [timer, setTimer] = useState(() => restoreTimer(settings))
  const [sessions, setSessions] = useState([])
  const [subject, setSubject] = useState(() => localStorage.getItem('focus-last-subject') || '')
  const [task, setTask] = useState('')
  const [screen, setScreen] = useState('timer')
  const [toast, setToast] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState(() => Number(localStorage.getItem('focus-last-backup')) || 0)
  const [storagePersisted, setStoragePersisted] = useState(null)
  const importRef = useRef(null)
  const completionRef = useRef(false)
  const toastTimerRef = useRef(null)

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
    const records = await getSessions()
    setSessions(records)
    clearActiveTimer()

    if (completed) {
      if (settings.sound) playChime()
      if (settings.vibration && navigator.vibrate) navigator.vibrate([180, 80, 180])
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
    showToast(completed ? '세션 완료 · 기록을 저장했습니다.' : '종료한 시간을 기록했습니다.')
    completionRef.current = false
  }, [settings, showToast, subject, task, timer])

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

  const handleSettingsChange = (nextSettings) => {
    setSettings(nextSettings)
    setTimer((current) => current.status === 'idle'
      ? { ...current, totalSeconds: secondsFor(current.mode, nextSettings), remainingSeconds: secondsFor(current.mode, nextSettings) }
      : current)
    showToast('설정이 저장되었습니다.')
  }

  const exportBackup = async () => {
    const backup = JSON.stringify({ app: 'Focus', version: 1, exportedAt: Date.now(), settings, sessions }, null, 2)
    const filename = `focus-backup-${new Date().toISOString().slice(0, 10)}.json`
    let saved = false
    try {
      const file = new File([backup], filename, { type: 'application/json' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Focus 백업', text: '파일에 저장을 선택하면 iCloud Drive에 보관할 수 있습니다.' })
        saved = true
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
    if (!saved) {
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    const timestamp = Date.now()
    localStorage.setItem('focus-last-backup', String(timestamp))
    setLastBackupAt(timestamp)
    showToast('백업 파일을 만들었습니다.')
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
      if (backup.settings && typeof backup.settings === 'object') {
        setSettings({ ...DEFAULT_SETTINGS, ...backup.settings })
      }
      await refreshSessions()
      showToast('백업 기록을 가져왔습니다.')
    } catch {
      showToast('올바른 Focus 백업 파일이 아닙니다.')
    }
  }

  const removeSession = async (id) => {
    await deleteSession(id)
    await refreshSessions()
    showToast('기록을 삭제했습니다.')
  }

  const removeAll = async () => {
    await clearSessions()
    setSessions([])
    setConfirmClear(false)
    showToast('모든 기록을 삭제했습니다.')
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
        />
      )}
      <input ref={importRef} className="hidden-file" type="file" accept=".json,application/json" onChange={importBackup} />
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
      {confirmClear ? <ConfirmModal title="모든 기록을 삭제할까요?" message="집중 기록은 복구할 수 없습니다. 필요한 경우 먼저 iCloud 백업을 저장하세요." confirmLabel="모두 삭제" danger onCancel={() => setConfirmClear(false)} onConfirm={removeAll} /> : null}
    </>
  )
}
