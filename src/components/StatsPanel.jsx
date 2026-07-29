import { formatDuration } from '../stats.js'

export default function StatsPanel({ today, streak, days, sessions, onDeleteSession }) {
  const maxSeconds = Math.max(3600, ...days.map((day) => day.seconds))

  return (
    <section className="stats-panel" aria-labelledby="today-heading">
      <h2 id="today-heading">오늘</h2>
      <div className="today-stats">
        <div><span>집중 시간</span><strong>{formatDuration(today.seconds, true)}</strong></div>
        <div><span>완료 세션</span><strong>{today.completed}</strong></div>
        <div><span>연속 기록</span><strong>{streak}일</strong></div>
      </div>

      <div className="chart-heading">
        <h3>최근 7일</h3>
        <span>{formatDuration(days.reduce((sum, day) => sum + day.seconds, 0), true)}</span>
      </div>
      <div className="bar-chart" role="img" aria-label="최근 7일 집중 시간 막대 차트">
        {days.map((day) => {
          const height = day.seconds ? Math.max(8, Math.round((day.seconds / maxSeconds) * 100)) : 3
          return (
            <div className="bar-column" key={day.key} title={`${day.dateLabel} · ${formatDuration(day.seconds, true)} · ${day.completed}회 완료`}>
              <span className="bar-value">{day.seconds ? formatDuration(day.seconds, true) : ''}</span>
              <span className="bar-track"><i style={{ height: `${height}%` }} /></span>
              <span className="bar-label">{day.weekday}</span>
            </div>
          )
        })}
      </div>

      <details className="daily-details">
        <summary>일별 집중 기록</summary>
        <div className="daily-list">
          {[...days].reverse().map((day) => (
            <div className="daily-row" key={day.key}>
              <span>{day.dateLabel} ({day.weekday})</span>
              <span>{formatDuration(day.seconds, true)} · {day.completed}회 완료</span>
            </div>
          ))}
        </div>
      </details>

      <div className="recent-heading"><h3>최근 세션</h3><span>{sessions.length}개 기록</span></div>
      {sessions.length ? (
        <div className="session-list">
          {sessions.slice(0, 8).map((session) => (
            <div className="session-row" key={session.id}>
              <span className={`session-dot ${session.mode}`} aria-hidden="true" />
              <div>
                <strong>{session.subject || (session.mode === 'focus' ? '집중' : '휴식')}</strong>
                <span>{session.task || new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(session.endedAt)}</span>
              </div>
              <span className="session-duration">{formatDuration(session.elapsedSeconds, true)}</span>
              <button className="delete-session" type="button" aria-label="이 기록 삭제" onClick={() => onDeleteSession(session.id)}>×</button>
            </div>
          ))}
        </div>
      ) : <p className="empty-records">첫 집중 세션을 완료하면 여기에 기록됩니다.</p>}
    </section>
  )
}
