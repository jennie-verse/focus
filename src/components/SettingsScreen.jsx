import { BackIcon, ClockIcon, CloudDownIcon, TrashIcon, UploadIcon } from './Icons.jsx'

const STEPPERS = [
  { key: 'focusMinutes', label: '집중 시간', suffix: '분', min: 1, max: 180, tone: 'pink' },
  { key: 'shortMinutes', label: '짧은 휴식', suffix: '분', min: 1, max: 60, tone: 'sky' },
  { key: 'longMinutes', label: '긴 휴식', suffix: '분', min: 1, max: 90, tone: 'lilac' },
  { key: 'longEvery', label: '긴 휴식 주기', suffix: '회', min: 2, max: 12, tone: 'pink' },
]

function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

export default function SettingsScreen({ settings, onChange, onBack, onExport, onImport, onClear, lastBackupAt }) {
  const update = (key, value) => onChange({ ...settings, [key]: value })

  return (
    <div className="settings-screen">
      <header className="settings-header">
        <button className="icon-button back-button" type="button" onClick={onBack} aria-label="타이머로 돌아가기"><BackIcon /></button>
        <h1>설정</h1>
        <span className="header-spacer" />
      </header>

      <main className="settings-main">
        <section className="settings-group duration-group" aria-label="시간 설정">
          {STEPPERS.map((item) => (
            <div className="setting-row" key={item.key}>
              <span className={`setting-icon ${item.tone}`}><ClockIcon /></span>
              <strong>{item.label}</strong>
              <div className="stepper">
                <button type="button" aria-label={`${item.label} 줄이기`} onClick={() => update(item.key, Math.max(item.min, settings[item.key] - 1))}>−</button>
                <span>{settings[item.key]}{item.suffix}</span>
                <button type="button" aria-label={`${item.label} 늘리기`} onClick={() => update(item.key, Math.min(item.max, settings[item.key] + 1))}>＋</button>
              </div>
            </div>
          ))}
        </section>

        <section className="settings-group toggle-group" aria-label="알림 설정">
          <Toggle label="완료 알림음" checked={settings.sound} onChange={(value) => update('sound', value)} />
          <Toggle label="진동" checked={settings.vibration} onChange={(value) => update('vibration', value)} />
          <Toggle label="자동으로 다음 세션 시작" checked={settings.autoStart} onChange={(value) => update('autoStart', value)} />
        </section>

        <section className="settings-group data-group">
          <h2>데이터</h2>
          <p>기록은 이 기기에 자동 저장됩니다. 백업 파일은 공유 메뉴에서 <b>파일에 저장</b>을 선택해 iCloud Drive에 보관할 수 있습니다.</p>
          <button className="data-button sky" type="button" onClick={onExport}><CloudDownIcon /><span>iCloud 백업 저장<small>{lastBackupAt ? `마지막 백업 ${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(lastBackupAt)}` : '공유 메뉴에서 파일에 저장'}</small></span><b>›</b></button>
          <button className="data-button lilac" type="button" onClick={onImport}><UploadIcon /><span>백업 가져오기<small>기존 기록과 안전하게 합치기</small></span><b>›</b></button>
        </section>

        <button className="clear-button" type="button" onClick={onClear}><TrashIcon />모든 기록 삭제<span>›</span></button>
      </main>
    </div>
  )
}
