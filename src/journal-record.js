const MODE_LABEL = Object.freeze({
  focus: 'Focus session',
  short: 'Short break',
  long: 'Long break',
})

function pad(value) {
  return String(Math.abs(value)).padStart(2, '0')
}

export function localIso(timestamp = Date.now()) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid session timestamp')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `.${String(date.getMilliseconds()).padStart(3, '0')}`
    + `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}

export function localDay(timestamp) {
  return localIso(timestamp).slice(0, 10)
}

export function sessionToJournalRecord(session, options = {}) {
  if (!session || typeof session.id !== 'string' || !MODE_LABEL[session.mode]) {
    throw new Error('Invalid Focus session')
  }
  const endedAt = Number(session.endedAt)
  const startedAt = Number(session.startedAt)
  const updatedAt = options.updatedAt || endedAt
  const includeContent = options.includeContent !== false
  return {
    id: session.id,
    kind: 'session',
    at: localIso(endedAt),
    updatedAt: localIso(updatedAt),
    deleted: options.deleted === true,
    title: MODE_LABEL[session.mode],
    data: {
      mode: session.mode,
      startedAt: localIso(startedAt),
      endedAt: localIso(endedAt),
      plannedSeconds: Math.max(0, Number(session.plannedSeconds) || 0),
      elapsedSeconds: Math.max(0, Number(session.elapsedSeconds) || 0),
      ...(includeContent ? { subject: String(session.subject || ''), task: String(session.task || '') } : {}),
      completed: session.completed === true,
      contentIncluded: includeContent,
    },
  }
}
