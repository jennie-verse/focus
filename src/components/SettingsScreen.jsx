import { BackIcon, ClockIcon, CloudDownIcon, TrashIcon, UploadIcon } from './Icons.jsx'
import { formatBackupAge } from '../stats.js'

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

const STORAGE_PROTECTION_LABEL = {
  true: '저장 공간 보호 켜짐 · 자동 정리로부터 보호됩니다',
  false: '저장 공간 보호 꺼짐',
  null: '저장 공간 보호 이 브라우저에서 지원되지 않음',
}

export default function SettingsScreen({ settings, onChange, onBack, onExport, onImport, onClear, lastBackupAt, storagePersisted }) {
  const update = (key, value) => onChange({ ...settings, [key]: value })
  const backupAge = formatBackupAge(lastBackupAt)

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

        <section className="settings-group display-group" aria-label="화면 설정">
          <div className="setting-row">
            <span className="setting-icon sky"><ClockIcon /></span>
            <strong>글자 크기</strong>
            <div className="stepper">
              <button type="button" aria-label="글자 작게" onClick={() => update('fontScale', Math.max(1, (settings.fontScale ?? 4) - 1))}>−</button>
              <span>{settings.fontScale ?? 4}</span>
              <button type="button" aria-label="글자 크게" onClick={() => update('fontScale', Math.min(6, (settings.fontScale ?? 4) + 1))}>＋</button>
            </div>
          </div>
          {(settings.fontScale ?? 4) !== 4 && (
            <button type="button" className="secondary-action" style={{ margin: '0 14px 14px' }} onClick={() => update('fontScale', 4)}>기본 크기로 되돌리기</button>
          )}
        </section>

        <section className="settings-group toggle-group" aria-label="알림 설정">
          <Toggle label="완료 알림음" checked={settings.sound} onChange={(value) => update('sound', value)} />
          <Toggle label="진동" checked={settings.vibration} onChange={(value) => update('vibration', value)} />
          <Toggle
            label="화면 알림 (잠금·백그라운드 포함)"
            checked={settings.notify}
            onChange={(value) => {
              if (value && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                Notification.requestPermission().then((permission) => update('notify', permission === 'granted'))
              } else {
                update('notify', value)
              }
            }}
          />
          {settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
            <p className="notify-blocked-hint">iOS 설정 &gt; 알림에서 Focus의 알림이 꺼져 있어요. 켜야 알림이 표시됩니다.</p>
          )}
          <Toggle label="자동으로 다음 세션 시작" checked={settings.autoStart} onChange={(value) => update('autoStart', value)} />
        </section>

        <section className="settings-group data-group">
          <h2>데이터</h2>
          <p>기록은 이 기기에 자동 저장됩니다. 백업 파일은 공유 메뉴에서 <b>파일에 저장</b>을 선택해 iCloud Drive에 보관할 수 있습니다.</p>
          <p className="storage-protection-line">{STORAGE_PROTECTION_LABEL[storagePersisted]}</p>
          <button className="data-button sky" type="button" onClick={onExport}>
            <CloudDownIcon />
            <span>
              iCloud 백업 저장
              <small className={backupAge?.overdue ? 'overdue' : ''}>
                {backupAge
                  ? `마지막 백업 ${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(lastBackupAt)} · ${backupAge.label}${backupAge.overdue ? ' · 백업 필요' : ''}`
                  : '공유 메뉴에서 파일에 저장'}
              </small>
            </span>
            <b>›</b>
          </button>
          <button className="data-button lilac" type="button" onClick={onImport}><UploadIcon /><span>백업 가져오기<small>기존 기록과 안전하게 합치기</small></span><b>›</b></button>
        </section>

        <button className="clear-button" type="button" onClick={onClear}><TrashIcon />모든 기록 삭제<span>›</span></button>
      </main>
    </div>
  )
}
