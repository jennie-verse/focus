import { BookIcon, GearIcon, TaskIcon } from './Icons.jsx'
import StatsPanel from './StatsPanel.jsx'
import { formatTimer } from '../stats.js'

const MODES = [
  { id: 'focus', label: '집중' },
  { id: 'short', label: '짧은 휴식' },
  { id: 'long', label: '긴 휴식' },
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
        <button className="icon-button" type="button" onClick={onSettings} aria-label="설정 열기"><GearIcon /></button>
      </header>

      <main className="app-main">
        <div className="mode-control" role="group" aria-label="타이머 종류">
          {MODES.map((mode) => (
            <button key={mode.id} type="button" className={timer.mode === mode.id ? 'active' : ''} disabled={locked} onClick={() => onMode(mode.id)}>{mode.label}</button>
          ))}
        </div>

        <section className="timer-section" aria-label="집중 타이머">
          <button className="minute-button" type="button" aria-label="1분 줄이기" disabled={locked} onClick={() => onAdjust(-1)}>−</button>
          <div className={`timer-ring ${timer.status}`}>
            <svg viewBox="0 0 250 250" aria-hidden="true">
              <circle className="ring-track" cx="125" cy="125" r={radius} />
              <circle className="ring-progress" cx="125" cy="125" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
            </svg>
            <div className="timer-copy">
              <strong>{formatTimer(timer.remainingSeconds)}</strong>
              <span>{timer.status === 'running' ? '집중하는 중' : timer.status === 'paused' ? '일시정지' : '준비됨'}</span>
            </div>
          </div>
          <button className="minute-button" type="button" aria-label="1분 늘리기" disabled={locked} onClick={() => onAdjust(1)}>＋</button>
        </section>

        <div className="session-fields">
          <label><BookIcon /><span>과목</span><input type="text" maxLength="50" placeholder="예: 영어" value={subject} onChange={(event) => onSubject(event.target.value)} disabled={locked && timer.mode !== 'focus'} /></label>
          <label><TaskIcon /><span>작업 이름</span><input type="text" maxLength="100" placeholder="예: 단어 복습" value={task} onChange={(event) => onTask(event.target.value)} disabled={locked && timer.mode !== 'focus'} /></label>
        </div>

        <div className="timer-actions">
          {timer.status === 'idle' ? <button className="primary-action" type="button" onClick={onStart}>시작</button> : null}
          {timer.status === 'running' ? <><button className="primary-action" type="button" onClick={onPause}>일시정지</button><button className="secondary-action" type="button" onClick={onEnd}>종료 및 기록</button></> : null}
          {timer.status === 'paused' ? <><button className="primary-action" type="button" onClick={onResume}>계속하기</button><button className="secondary-action" type="button" onClick={onEnd}>종료 및 기록</button></> : null}
        </div>

        <StatsPanel today={today} streak={streak} days={days} sessions={sessions} onDeleteSession={onDeleteSession} />
      </main>
    </div>
  )
}
