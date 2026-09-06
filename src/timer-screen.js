// timer-screen.js — timer + stats view. Full rebuild on discrete actions;
// updateRing() is the only thing called on every 250ms tick, so an actively
// focused Subject/Task input never loses focus while a session is running.

import { MODES } from './model.js'
import { formatTimer, formatDuration } from './stats.js'
import { gearIcon, bookIcon, taskIcon } from './icons.js'

const RADIUS = 108
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'text') node.textContent = String(value)
    else if (key === 'class') node.className = String(value)
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

function buildRing(timer) {
  const progress = timer.totalSeconds ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.totalSeconds)) : 1
  const wrap = el('div', { class: `timer-ring ${timer.status} mode-${timer.mode}` })
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', '0 0 250 250')
  svg.setAttribute('aria-hidden', 'true')
  const track = document.createElementNS(svgNS, 'circle')
  track.setAttribute('class', 'ring-track')
  track.setAttribute('cx', '125'); track.setAttribute('cy', '125'); track.setAttribute('r', String(RADIUS))
  const ring = document.createElementNS(svgNS, 'circle')
  ring.setAttribute('class', 'ring-progress')
  ring.setAttribute('cx', '125'); ring.setAttribute('cy', '125'); ring.setAttribute('r', String(RADIUS))
  ring.setAttribute('stroke-dasharray', String(CIRCUMFERENCE))
  ring.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - progress)))
  svg.append(track, ring)
  const copy = el('div', { class: 'timer-copy' }, [
    el('strong', { text: formatTimer(timer.remainingSeconds) }),
    el('span', { text: timer.status === 'running' ? 'Focusing' : timer.status === 'paused' ? 'Paused' : 'Ready' }),
  ])
  wrap.append(svg, copy)
  return wrap
}

// Called every 250ms while running. Only touches the ring — never rebuilds
// the screen, so a focused Subject/Task input keeps its focus and caret.
export function updateRing(container, timer) {
  const ring = container.querySelector('.timer-ring')
  if (!ring) return
  ring.className = `timer-ring ${timer.status} mode-${timer.mode}`
  const progress = timer.totalSeconds ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.totalSeconds)) : 1
  ring.querySelector('.ring-progress')?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - progress)))
  const copy = ring.querySelector('.timer-copy')
  if (copy) {
    copy.querySelector('strong').textContent = formatTimer(timer.remainingSeconds)
    copy.querySelector('span').textContent = timer.status === 'running' ? 'Focusing' : timer.status === 'paused' ? 'Paused' : 'Ready'
  }
}

function buildStatsPanel(today, streak, days, sessions, handlers) {
  const maxSeconds = Math.max(3600, ...days.map((day) => day.seconds))
  const section = el('section', { class: 'stats-panel', 'aria-labelledby': 'today-heading' })
  section.append(
    el('h2', { id: 'today-heading', text: 'Today' }),
    el('div', { class: 'today-stats' }, [
      el('div', {}, [el('span', { text: 'Focus time' }), el('strong', { text: formatDuration(today.seconds, true) })]),
      el('div', {}, [el('span', { text: 'Completed' }), el('strong', { text: String(today.completed) })]),
      el('div', {}, [el('span', { text: 'Streak' }), el('strong', { text: `${streak}d` })]),
    ]),
  )

  section.append(el('div', { class: 'chart-heading' }, [
    el('h3', { text: 'Last 7 days' }),
    el('span', { text: formatDuration(days.reduce((sum, day) => sum + day.seconds, 0), true) }),
  ]))

  const chart = el('div', { class: 'bar-chart', role: 'img', 'aria-label': 'Focus time over the last 7 days' })
  days.forEach((day) => {
    const height = day.seconds ? Math.max(8, Math.round((day.seconds / maxSeconds) * 100)) : 3
    const track = el('span', { class: 'bar-track' })
    const bar = el('i')
    bar.style.height = `${height}%`
    track.appendChild(bar)
    chart.appendChild(el('div', {
      class: 'bar-column',
      title: `${day.dateLabel} · ${formatDuration(day.seconds, true)} · ${day.completed} completed`,
    }, [
      el('span', { class: 'bar-value', text: day.seconds ? formatDuration(day.seconds, true) : '' }),
      track,
      el('span', { class: 'bar-label', text: day.weekday }),
    ]))
  })
  section.appendChild(chart)

  const details = el('details', { class: 'daily-details' })
  details.appendChild(el('summary', { text: 'Daily focus records' }))
  const list = el('div', { class: 'daily-list' })
  ;[...days].reverse().forEach((day) => {
    list.appendChild(el('div', { class: 'daily-row' }, [
      el('span', { text: `${day.dateLabel} (${day.weekday})` }),
      el('span', { text: `${formatDuration(day.seconds, true)} · ${day.completed} completed` }),
    ]))
  })
  details.appendChild(list)
  section.appendChild(details)

  section.appendChild(el('div', { class: 'recent-heading' }, [
    el('h3', { text: 'Recent sessions' }),
    el('span', { text: `${sessions.length} logged` }),
  ]))

  if (sessions.length) {
    const sessionList = el('div', { class: 'session-list' })
    sessions.slice(0, 8).forEach((session) => {
      const label = session.subject || MODES.find((mode) => mode.id === session.mode)?.label || 'Break'
      const sub = session.task || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(session.endedAt)
      const deleteBtn = el('button', { class: 'delete-session', type: 'button', 'aria-label': 'Delete this record', text: '×' })
      deleteBtn.addEventListener('click', () => handlers.onDeleteSession(session.id))
      sessionList.appendChild(el('div', { class: 'session-row' }, [
        el('span', { class: `session-dot ${session.mode}`, 'aria-hidden': 'true' }),
        el('div', {}, [el('strong', { text: label }), el('span', { text: sub })]),
        el('span', { class: 'session-duration', text: formatDuration(session.elapsedSeconds, true) }),
        deleteBtn,
      ]))
    })
    section.appendChild(sessionList)
  } else {
    section.appendChild(el('p', { class: 'empty-records', text: 'Finish your first focus session and it will show up here.' }))
  }

  return section
}

export function renderTimerScreen(container, state, handlers) {
  const { timer, subject, task, today, streak, days, sessions, settings } = state
  const locked = timer.status !== 'idle'
  const minimal = settings.minimalMode && locked

  const screen = el('div', { class: 'timer-screen' })
  const header = el('header', { class: 'app-header' }, [el('h1', { text: 'Focus' })])
  if (!minimal) {
    const gearBtn = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Open settings' }, [gearIcon()])
    gearBtn.addEventListener('click', handlers.onSettings)
    header.appendChild(gearBtn)
  }
  screen.appendChild(header)

  const main = el('main', { class: 'app-main' })

  if (!minimal) {
    const modeControl = el('div', { class: 'mode-control', role: 'group', 'aria-label': 'Timer mode' })
    MODES.forEach((mode) => {
      // Each mode gets its own family color when active (focus=pink, short=sky,
      // long=lilac) — matches the tone already used for these in Settings
      // (settings-screen.js MODE_ROWS), so the tab you're on and its minutes
      // stepper read as the same category at a glance.
      const cls = ['mode-' + mode.id, timer.mode === mode.id ? 'active' : ''].filter(Boolean).join(' ')
      const btn = el('button', { type: 'button', class: cls, disabled: locked, text: mode.label })
      btn.addEventListener('click', () => handlers.onMode(mode.id))
      modeControl.appendChild(btn)
    })
    main.appendChild(modeControl)
  }

  const timerSection = el('section', { class: 'timer-section', 'aria-label': 'Focus timer' })
  const minusBtn = el('button', { class: 'minute-button', type: 'button', 'aria-label': 'One minute less', disabled: locked, text: '−' })
  minusBtn.addEventListener('click', () => handlers.onAdjust(-1))
  const plusBtn = el('button', { class: 'minute-button', type: 'button', 'aria-label': 'One minute more', disabled: locked, text: '＋' })
  plusBtn.addEventListener('click', () => handlers.onAdjust(1))
  timerSection.append(minusBtn, buildRing(timer), plusBtn)
  main.appendChild(timerSection)

  if (!minimal) {
    const fields = el('div', { class: 'session-fields' })
    const subjectInput = el('input', { type: 'text', maxlength: '50', placeholder: 'e.g. English', value: subject, disabled: locked && timer.mode !== 'focus' })
    subjectInput.value = subject
    subjectInput.addEventListener('input', (event) => handlers.onSubject(event.target.value))
    const taskInput = el('input', { type: 'text', maxlength: '100', placeholder: 'e.g. Review vocabulary', disabled: locked && timer.mode !== 'focus' })
    taskInput.value = task
    taskInput.addEventListener('input', (event) => handlers.onTask(event.target.value))
    fields.append(
      el('label', {}, [bookIcon(), el('span', { text: 'Subject' }), subjectInput]),
      el('label', {}, [taskIcon(), el('span', { text: 'Task' }), taskInput]),
    )
    main.appendChild(fields)
  }

  const actions = el('div', { class: 'timer-actions' })
  if (timer.status === 'idle') {
    const startBtn = el('button', { class: 'primary-action', type: 'button', text: 'Start' })
    startBtn.addEventListener('click', handlers.onStart)
    actions.appendChild(startBtn)
  } else if (timer.status === 'running') {
    const pauseBtn = el('button', { class: 'primary-action', type: 'button', text: 'Pause' })
    pauseBtn.addEventListener('click', handlers.onPause)
    const endBtn = el('button', { class: 'secondary-action', type: 'button', text: 'End and log' })
    endBtn.addEventListener('click', handlers.onEnd)
    actions.append(pauseBtn, endBtn)
  } else if (timer.status === 'paused') {
    const resumeBtn = el('button', { class: 'primary-action', type: 'button', text: 'Resume' })
    resumeBtn.addEventListener('click', handlers.onResume)
    const endBtn = el('button', { class: 'secondary-action', type: 'button', text: 'End and log' })
    endBtn.addEventListener('click', handlers.onEnd)
    actions.append(resumeBtn, endBtn)
  }
  main.appendChild(actions)

  if (!minimal) main.appendChild(buildStatsPanel(today, streak, days, sessions, handlers))

  screen.appendChild(main)
  container.replaceChildren(screen)
}
