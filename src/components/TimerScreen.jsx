import { BookIcon, GearIcon, TaskIcon } from './Icons.jsx'
import StatsPanel from './StatsPanel.jsx'
import { formatTimer } from '../stats.js'

const MODES = [
  { id: 'focus', label: 'Focus' },
  { id: 'short', label: 'Short break' },
  { id: 'long', label: 'Long break' },
]

export default function TimerScreen({
  timer,
  subject,
  task,
  onSubject,
  onTask,
  onMode,
  onAdjust,
  onStart,
  onPause,
  onResume,
  onEnd,
  onSettings,
  today,
  streak,
  days,
  sessions,
  onDeleteSession,
}) {
  const progress = timer.totalSeconds ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.totalSeconds)) : 1
  const radius = 108
  const circumference = 2 * Math.PI * radius
  const locked = timer.status !== 'idle'

  return (
    <div className="timer-screen">
      <header className="app-header">
        <h1>Focus</h1>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Open settings"><GearIcon /></button>
      </header>

      <main className="app-main">
        <div className="mode-control" role="group" aria-label="Timer mode">
          {MODES.map((mode) => (
            <button key={mode.id} type="button" className={timer.mode === mode.id ? 'active' : ''} disabled={locked} onClick={() => onMode(mode.id)}>{mode.label}</button>
          ))}
        </div>

        <section className="timer-section" aria-label="Focus timer">
          <button className="minute-button" type="button" aria-label="One minute less" disabled={locked} onClick={() => onAdjust(-1)}>−</button>
          <div className={`timer-ring ${timer.status}`}>
            <svg viewBox="0 0 250 250" aria-hidden="true">
              <circle className="ring-track" cx="125" cy="125" r={radius} />
              <circle className="ring-progress" cx="125" cy="125" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
            </svg>
            <div className="timer-copy">
              <strong>{formatTimer(timer.remainingSeconds)}</strong>
              <span>{timer.status === 'running' ? 'Focusing' : timer.status === 'paused' ? 'Paused' : 'Ready'}</span>
            </div>
          </div>
          <button className="minute-button" type="button" aria-label="One minute more" disabled={locked} onClick={() => onAdjust(1)}>＋</button>
        </section>

        <div className="session-fields">
          <label><BookIcon /><span>Subject</span><input type="text" maxLength="50" placeholder="e.g. English" value={subject} onChange={(event) => onSubject(event.target.value)} disabled={locked && timer.mode !== 'focus'} /></label>
          <label><TaskIcon /><span>Task</span><input type="text" maxLength="100" placeholder="e.g. Review vocabulary" value={task} onChange={(event) => onTask(event.target.value)} disabled={locked && timer.mode !== 'focus'} /></label>
        </div>

        <div className="timer-actions">
          {timer.status === 'idle' ? <button className="primary-action" type="button" onClick={onStart}>Start</button> : null}
          {timer.status === 'running' ? <><button className="primary-action" type="button" onClick={onPause}>Pause</button><button className="secondary-action" type="button" onClick={onEnd}>End and log</button></> : null}
          {timer.status === 'paused' ? <><button className="primary-action" type="button" onClick={onResume}>Resume</button><button className="secondary-action" type="button" onClick={onEnd}>End and log</button></> : null}
        </div>

        <StatsPanel today={today} streak={streak} days={days} sessions={sessions} onDeleteSession={onDeleteSession} />
      </main>
    </div>
  )
}
