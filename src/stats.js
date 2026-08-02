const DAY_MS = 86_400_000

export function localDayKey(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDuration(totalSeconds, compact = false) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (compact) {
    if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
    if (seconds > 0 && minutes === 0) return '<1분'
    return `${minutes}분`
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds || 0))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function getRecentDays(sessions, count = 7) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const totals = new Map()

  for (const session of sessions) {
    if (session.mode !== 'focus') continue
    const key = localDayKey(session.endedAt)
    const current = totals.get(key) || { seconds: 0, sessions: 0, completed: 0 }
    current.seconds += Math.max(0, Number(session.elapsedSeconds) || 0)
    current.sessions += 1
    if (session.completed) current.completed += 1
    totals.set(key, current)
  }

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() - (count - 1 - index) * DAY_MS)
    const key = localDayKey(date)
    const total = totals.get(key) || { seconds: 0, sessions: 0, completed: 0 }
    return {
      key,
      date,
      weekday: new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date),
      dateLabel: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date),
      ...total,
    }
  })
}

export function getStreak(sessions) {
  const activeDays = new Set(
    sessions
      .filter((session) => session.mode === 'focus' && Number(session.elapsedSeconds) > 0)
      .map((session) => localDayKey(session.endedAt)),
  )
  if (!activeDays.size) return 0

  const date = new Date()
  date.setHours(12, 0, 0, 0)
  if (!activeDays.has(localDayKey(date))) date.setTime(date.getTime() - DAY_MS)

  let streak = 0
  while (activeDays.has(localDayKey(date))) {
    streak += 1
    date.setTime(date.getTime() - DAY_MS)
  }
  return streak
}

export function formatBackupAge(lastBackupAt) {
  if (!lastBackupAt) return null
  const days = Math.max(0, Math.floor((Date.now() - lastBackupAt) / DAY_MS))
  const label = days === 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`
  return { days, label, overdue: days > 7 }
}

export function getTodayStats(sessions) {
  const today = localDayKey(Date.now())
  return sessions.reduce(
    (total, session) => {
      if (session.mode !== 'focus' || localDayKey(session.endedAt) !== today) return total
      total.seconds += Math.max(0, Number(session.elapsedSeconds) || 0)
      total.sessions += 1
      if (session.completed) total.completed += 1
      return total
    },
    { seconds: 0, sessions: 0, completed: 0 },
  )
}
