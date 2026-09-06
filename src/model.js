// model.js — pure timer/session logic. No DOM, no storage.

export const MODE_SETTING = Object.freeze({
  focus: 'focusMinutes',
  short: 'shortMinutes',
  long: 'longMinutes',
})

export const MODES = Object.freeze([
  { id: 'focus', label: 'Focus' },
  { id: 'short', label: 'Short break' },
  { id: 'long', label: 'Long break' },
])

export function secondsFor(mode, settings) {
  return settings[MODE_SETTING[mode]] * 60
}

export function createTimer(mode, settings, running = false) {
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

export function restoreTimer(settings, stored) {
  if (!stored || !MODE_SETTING[stored.mode] || !['running', 'paused'].includes(stored.status)) {
    return createTimer('focus', settings)
  }
  if (stored.status === 'running' && stored.targetEnd) {
    return { ...stored, remainingSeconds: Math.max(0, (stored.targetEnd - Date.now()) / 1000) }
  }
  return stored
}

export function makeId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function formatMoment(timestamp) {
  if (!timestamp) return 'Never'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

export function dateInputValue(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function daysInRange(from, to) {
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0
  return Math.floor((end - start) / 86400000) + 1
}

// Next mode after a session ends, given how many focus sessions have
// completed so far (including the one that just finished).
export function nextModeAfter(finishedMode, completedFocusCount, longEvery) {
  let nextMode = finishedMode === 'focus' ? 'short' : 'focus'
  if (finishedMode === 'focus' && completedFocusCount > 0 && completedFocusCount % longEvery === 0) nextMode = 'long'
  return nextMode
}

export function adjustedMinutes(currentTotalSeconds, delta) {
  return Math.max(1, Math.min(180, Math.round(currentTotalSeconds / 60) + delta))
}
