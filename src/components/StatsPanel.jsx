import { formatDuration } from '../stats.js'

export default function StatsPanel({ today, streak, days, sessions, onDeleteSession }) {
  const maxSeconds = Math.max(3600, ...days.map((day) => day.seconds))

  return (
    <section className="stats-panel" aria-labelledby="today-heading">
      <h2 id="today-heading">Today</h2>
      <div className="today-stats">
        <div><span>Focus time</span><strong>{formatDuration(today.seconds, true)}</strong></div>
        <div><span>Completed</span><strong>{today.completed}</strong></div>
        <div><span>Streak</span><strong>{streak}d</strong></div>
      </div>

      <div className="chart-heading">
        <h3>Last 7 days</h3>
        <span>{formatDuration(days.reduce((sum, day) => sum + day.seconds, 0), true)}</span>
      </div>
      <div className="bar-chart" role="img" aria-label="Focus time over the last 7 days">
        {days.map((day) => {
          const height = day.seconds ? Math.max(8, Math.round((day.seconds / maxSeconds) * 100)) : 3
          return (
            <div className="bar-column" key={day.key} title={`${day.dateLabel} · ${formatDuration(day.seconds, true)} · ${day.completed} completed`}>
              <span className="bar-value">{day.seconds ? formatDuration(day.seconds, true) : ''}</span>
              <span className="bar-track"><i style={{ height: `${height}%` }} /></span>
              <span className="bar-label">{day.weekday}</span>
            </div>
          )
        })}
      </div>

      <details className="daily-details">
        <summary>Daily focus records</summary>
        <div className="daily-list">
          {[...days].reverse().map((day) => (
            <div className="daily-row" key={day.key}>
              <span>{day.dateLabel} ({day.weekday})</span>
              <span>{formatDuration(day.seconds, true)} · {day.completed} completed</span>
            </div>
          ))}
        </div>
      </details>

      <div className="recent-heading"><h3>Recent sessions</h3><span>{sessions.length} logged</span></div>
      {sessions.length ? (
        <div className="session-list">
          {sessions.slice(0, 8).map((session) => (
            <div className="session-row" key={session.id}>
              <span className={`session-dot ${session.mode}`} aria-hidden="true" />
              <div>
                <strong>{session.subject || (session.mode === 'focus' ? 'Focus' : 'Break')}</strong>
                <span>{session.task || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(session.endedAt)}</span>
              </div>
              <span className="session-duration">{formatDuration(session.elapsedSeconds, true)}</span>
              <button className="delete-session" type="button" aria-label="Delete this record" onClick={() => onDeleteSession(session.id)}>×</button>
            </div>
          ))}
        </div>
      ) : <p className="empty-records">Finish your first focus session and it will show up here.</p>}
    </section>
  )
}
