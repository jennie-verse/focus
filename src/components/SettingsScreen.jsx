import { BackIcon, ClockIcon, CloudDownIcon, TrashIcon, UploadIcon } from './Icons.jsx'
import { formatBackupAge } from '../stats.js'

const STEPPERS = [
  { key: 'focusMinutes', label: 'Focus length', suffix: ' min', min: 1, max: 180, tone: 'pink' },
  { key: 'shortMinutes', label: 'Short break', suffix: ' min', min: 1, max: 60, tone: 'sky' },
  { key: 'longMinutes', label: 'Long break', suffix: ' min', min: 1, max: 90, tone: 'lilac' },
  { key: 'longEvery', label: 'Long break every', suffix: '×', min: 2, max: 12, tone: 'pink' },
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
  true: 'Storage protection on — safe from automatic cleanup',
  false: 'Storage protection off',
  null: 'Storage protection is not supported in this browser',
}

export default function SettingsScreen({
  settings,
  onChange,
  onBack,
  onExport,
  onImport,
  onClear,
  lastBackupAt,
  storagePersisted,
  sync,
}) {
  const update = (key, value) => onChange({ ...settings, [key]: value })
  const backupAge = formatBackupAge(lastBackupAt)

  return (
    <div className="settings-screen">
      <header className="settings-header">
        <button className="icon-button back-button" type="button" onClick={onBack} aria-label="Back to timer"><BackIcon /></button>
        <h1>Settings</h1>
        <span className="header-spacer" />
      </header>

      <main className="settings-main">
        <section className="settings-group duration-group" aria-label="Durations">
          {STEPPERS.map((item) => (
            <div className="setting-row" key={item.key}>
              <span className={`setting-icon ${item.tone}`}><ClockIcon /></span>
              <strong>{item.label}</strong>
              <div className="stepper">
                <button type="button" aria-label={`Decrease ${item.label}`} onClick={() => update(item.key, Math.max(item.min, settings[item.key] - 1))}>−</button>
                <span>{settings[item.key]}{item.suffix}</span>
                <button type="button" aria-label={`Increase ${item.label}`} onClick={() => update(item.key, Math.min(item.max, settings[item.key] + 1))}>＋</button>
              </div>
            </div>
          ))}
        </section>

        <section className="settings-group display-group" aria-label="Display">
          <div className="setting-row">
            <span className="setting-icon sky"><ClockIcon /></span>
            <strong>Text size</strong>
            <div className="stepper">
              <button type="button" aria-label="Smaller text" onClick={() => update('fontScale', Math.max(1, (settings.fontScale ?? 4) - 1))}>−</button>
              <span>{settings.fontScale ?? 4}</span>
              <button type="button" aria-label="Larger text" onClick={() => update('fontScale', Math.min(6, (settings.fontScale ?? 4) + 1))}>＋</button>
            </div>
          </div>
          {(settings.fontScale ?? 4) !== 4 && (
            <button type="button" className="secondary-action" style={{ margin: '0 14px 14px' }} onClick={() => update('fontScale', 4)}>Reset to default size</button>
          )}
        </section>

        <section className="settings-group toggle-group" aria-label="Alerts">
          <Toggle label="Chime when a session ends" checked={settings.sound} onChange={(value) => update('sound', value)} />
          <Toggle label="Vibration" checked={settings.vibration} onChange={(value) => update('vibration', value)} />
          <Toggle
            label="Notifications (including locked or background)"
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
            <p className="notify-blocked-hint">Notifications for Focus are turned off in iOS Settings &gt; Notifications. Turn them on to see alerts.</p>
          )}
          <Toggle label="Start the next session automatically" checked={settings.autoStart} onChange={(value) => update('autoStart', value)} />
        </section>

        <section className="settings-group sync-group" aria-label="Sync">
          <h2>Sync</h2>
          <p>Off by default. Everything works without it — sync only adds a copy in your private <b>webapp-data</b> repository so other devices and Atlas or Trace can see it.</p>

          <label className="sync-field">
            <span>GitHub token</span>
            <input
              type="password"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder={sync.tokenHint || 'Paste a token with Contents: Read and write'}
              value={sync.tokenDraft}
              onChange={(event) => sync.onTokenDraft(event.target.value)}
            />
          </label>
          <div className="sync-actions">
            <button type="button" className="secondary-action" onClick={sync.onSaveToken}>Save token</button>
            <button type="button" className="secondary-action" onClick={sync.onClearToken} disabled={!sync.hasToken}>Clear</button>
          </div>

          <label className="sync-field">
            <span>Name for this device</span>
            <input
              type="text"
              maxLength="40"
              placeholder="e.g. iPhone Home Screen"
              value={sync.labelDraft}
              onChange={(event) => sync.onLabelDraft(event.target.value)}
              onBlur={sync.onSaveLabel}
            />
          </label>
          <p className="sync-hint">
            {sync.contextId
              ? 'The file name below was fixed when sync was first turned on. Renaming changes the display name only.'
              : 'Set this before turning sync on — letters and numbers from this name become part of the file name.'}
          </p>

          <Toggle label="Sync this device" checked={sync.enabled} onChange={sync.onToggleEnabled} />

          <dl className="sync-status">
            <div>
              <dt>App version</dt>
              <dd>{sync.appBuild}</dd>
            </div>
            <div>
              <dt>File name</dt>
              <dd>{sync.contextId || 'Not set up yet'}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{sync.lastSyncLabel}</dd>
            </div>
            <div>
              <dt>Waiting to send</dt>
              <dd>{sync.pendingCount === 0 ? 'Nothing' : `${sync.pendingCount} event${sync.pendingCount === 1 ? '' : 's'}`}</dd>
            </div>
            <div>
              <dt>Last error</dt>
              <dd className={sync.lastError ? 'has-error' : ''}>{sync.lastError || 'No errors'}</dd>
            </div>
          </dl>

          <button type="button" className="secondary-action" onClick={sync.onSyncNow} disabled={!sync.canSync || sync.busy}>
            {sync.busy ? 'Syncing…' : 'Sync now'}
          </button>
        </section>

        <section className="settings-group data-group">
          <h2>Data</h2>
          <p>Your records are saved on this device automatically. In the share sheet choose <b>Save to Files</b> to keep a backup in iCloud Drive.</p>
          <p className="storage-protection-line">{STORAGE_PROTECTION_LABEL[storagePersisted]}</p>
          <button className="data-button sky" type="button" onClick={onExport}>
            <CloudDownIcon />
            <span>
              Save a backup file
              <small className={backupAge?.overdue ? 'overdue' : ''}>
                {backupAge
                  ? `Last backup ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(lastBackupAt)} · ${backupAge.label}${backupAge.overdue ? ' · back up soon' : ''}`
                  : 'Choose Save to Files in the share sheet'}
              </small>
            </span>
            <b>›</b>
          </button>
          <button className="data-button pink" type="button" onClick={sync.onBackupToGitHub} disabled={!sync.canSync || sync.busy}>
            <CloudDownIcon />
            <span>
              Back up to GitHub
              <small>{sync.remoteBackupLabel}</small>
            </span>
            <b>›</b>
          </button>
          <button className="data-button lilac" type="button" onClick={onImport}><UploadIcon /><span>Import a backup<small>Merges safely with what is already here</small></span><b>›</b></button>
        </section>

        <button className="clear-button" type="button" onClick={onClear}><TrashIcon />Delete all records<span>›</span></button>
      </main>
    </div>
  )
}
