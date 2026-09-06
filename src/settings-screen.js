// settings-screen.js — settings view. Full rebuild on every change; nothing
// here ticks, so this is simpler than timer-screen.js.

import { formatBackupAge } from './stats.js'
import { backIcon, clockIcon, cloudDownIcon, trashIcon, uploadIcon } from './icons.js'

const STEPPERS = [
  { key: 'focusMinutes', label: 'Focus length', suffix: ' min', min: 1, max: 180, tone: 'pink' },
  { key: 'shortMinutes', label: 'Short break', suffix: ' min', min: 1, max: 60, tone: 'sky' },
  { key: 'longMinutes', label: 'Long break', suffix: ' min', min: 1, max: 90, tone: 'lilac' },
  { key: 'longEvery', label: 'Long break every', suffix: '×', min: 2, max: 12, tone: 'pink' },
]

const STORAGE_PROTECTION_LABEL = {
  true: 'Storage protection on — safe from automatic cleanup',
  false: 'Storage protection off',
  null: 'Storage protection is not supported in this browser',
}

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

function toggle(label, checked, onChange) {
  const wrap = el('label', { class: 'toggle' })
  const input = el('input', { type: 'checkbox' })
  input.checked = checked
  input.addEventListener('change', (event) => onChange(event.target.checked))
  wrap.append(el('span', { text: label }), input, el('i', { 'aria-hidden': 'true' }))
  return wrap
}

function statusList(rows) {
  const dl = el('dl', { class: 'sync-status' })
  rows.forEach(([term, value, errorClass]) => {
    dl.appendChild(el('div', {}, [
      el('dt', { text: term }),
      el('dd', { class: errorClass || undefined, text: value }),
    ]))
  })
  return dl
}

export function renderSettingsScreen(container, state, handlers) {
  const { settings, lastBackupAt, storagePersisted, sync, journal } = state
  const update = (key, value) => handlers.onChange({ ...settings, [key]: value })
  const backupAge = formatBackupAge(lastBackupAt)

  const screen = el('div', { class: 'settings-screen' })
  const backBtn = el('button', { class: 'icon-button back-button', type: 'button', 'aria-label': 'Back to timer' }, [backIcon()])
  backBtn.addEventListener('click', handlers.onBack)
  screen.appendChild(el('header', { class: 'settings-header' }, [backBtn, el('h1', { text: 'Settings' }), el('span', { class: 'header-spacer' })]))

  const main = el('main', { class: 'settings-main' })

  // ── Durations ──
  const durationGroup = el('section', { class: 'settings-group duration-group', 'aria-label': 'Durations' })
  STEPPERS.forEach((item) => {
    const minusBtn = el('button', { type: 'button', 'aria-label': `Decrease ${item.label}`, text: '−' })
    minusBtn.addEventListener('click', () => update(item.key, Math.max(item.min, settings[item.key] - 1)))
    const plusBtn = el('button', { type: 'button', 'aria-label': `Increase ${item.label}`, text: '＋' })
    plusBtn.addEventListener('click', () => update(item.key, Math.min(item.max, settings[item.key] + 1)))
    durationGroup.appendChild(el('div', { class: 'setting-row' }, [
      el('span', { class: `setting-icon ${item.tone}` }, [clockIcon()]),
      el('strong', { text: item.label }),
      el('div', { class: 'stepper' }, [minusBtn, el('span', { text: `${settings[item.key]}${item.suffix}` }), plusBtn]),
    ]))
  })
  main.appendChild(durationGroup)

  // ── Display (text size) ──
  const displayGroup = el('section', { class: 'settings-group display-group', 'aria-label': 'Display' })
  const fontScale = settings.fontScale ?? 4
  const fontMinus = el('button', { type: 'button', 'aria-label': 'Smaller text', text: '−' })
  fontMinus.addEventListener('click', () => update('fontScale', Math.max(1, fontScale - 1)))
  const fontPlus = el('button', { type: 'button', 'aria-label': 'Larger text', text: '＋' })
  fontPlus.addEventListener('click', () => update('fontScale', Math.min(6, fontScale + 1)))
  displayGroup.appendChild(el('div', { class: 'setting-row' }, [
    el('span', { class: 'setting-icon sky' }, [clockIcon()]),
    el('strong', { text: 'Text size' }),
    el('div', { class: 'stepper' }, [fontMinus, el('span', { text: String(fontScale) }), fontPlus]),
  ]))
  if (fontScale !== 4) {
    const resetBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Reset to default size' })
    resetBtn.style.margin = '0 14px 14px'
    resetBtn.addEventListener('click', () => update('fontScale', 4))
    displayGroup.appendChild(resetBtn)
  }
  main.appendChild(displayGroup)

  // ── Minimal mode ──
  const minimalGroup = el('section', { class: 'settings-group toggle-group', 'aria-label': 'Minimal mode' })
  minimalGroup.appendChild(toggle('Minimal mode while a timer is running', settings.minimalMode === true, (value) => update('minimalMode', value)))
  minimalGroup.appendChild(el('p', { class: 'sync-hint', text: 'Hides stats, settings and the mode picker while a session runs or is paused. Only the ring, time, and Pause/End remain.' }))
  main.appendChild(minimalGroup)

  // ── Alerts ──
  const toggleGroup = el('section', { class: 'settings-group toggle-group', 'aria-label': 'Alerts' })
  toggleGroup.appendChild(toggle('Chime when a session ends', settings.sound, (value) => update('sound', value)))
  toggleGroup.appendChild(toggle('Vibration', settings.vibration, (value) => update('vibration', value)))
  toggleGroup.appendChild(toggle('Notifications (including locked or background)', settings.notify, (value) => {
    if (value && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => update('notify', permission === 'granted'))
    } else {
      update('notify', value)
    }
  }))
  if (settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    toggleGroup.appendChild(el('p', { class: 'notify-blocked-hint', text: 'Notifications for Focus are turned off in iOS Settings > Notifications. Turn them on to see alerts.' }))
  }
  toggleGroup.appendChild(toggle('Start the next session automatically', settings.autoStart, (value) => update('autoStart', value)))
  main.appendChild(toggleGroup)

  // ── Sync ──
  const syncGroup = el('section', { class: 'settings-group sync-group', 'aria-label': 'Sync' })
  syncGroup.append(
    el('h2', { text: 'Sync' }),
    el('p', {}, ['Off by default. Everything works without it — sync only adds a copy in your private ', el('b', { text: 'webapp-data' }), ' repository so your other devices can see it.']),
  )
  const tokenInput = el('input', {
    type: 'password', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    placeholder: sync.tokenHint || 'Paste a token with Contents: Read and write',
  })
  tokenInput.value = sync.tokenDraft
  tokenInput.addEventListener('input', (event) => sync.onTokenDraft(event.target.value))
  syncGroup.appendChild(el('label', { class: 'sync-field' }, [el('span', { text: 'GitHub token' }), tokenInput]))
  const saveTokenBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Save token' })
  saveTokenBtn.addEventListener('click', sync.onSaveToken)
  const clearTokenBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Clear', disabled: !sync.hasToken })
  clearTokenBtn.addEventListener('click', sync.onClearToken)
  syncGroup.appendChild(el('div', { class: 'sync-actions' }, [saveTokenBtn, clearTokenBtn]))

  const labelInput = el('input', { type: 'text', maxlength: '40', placeholder: 'iphone-home' })
  labelInput.value = sync.labelDraft
  labelInput.addEventListener('input', (event) => sync.onLabelDraft(event.target.value))
  labelInput.addEventListener('blur', sync.onSaveLabel)
  syncGroup.appendChild(el('label', { class: 'sync-field' }, [el('span', { text: 'Name for this device' }), labelInput]))
  syncGroup.appendChild(el('p', {
    class: 'sync-hint',
    text: sync.contextId
      ? 'The file name below was fixed when sync was first turned on. Renaming changes the display name only.'
      : 'Set this before turning sync on — letters and numbers from this name become part of the file name.',
  }))
  syncGroup.appendChild(toggle('Sync this device', sync.enabled, sync.onToggleEnabled))
  syncGroup.appendChild(statusList([
    ['App version', sync.appBuild],
    ['File name', sync.contextId || 'Not set up yet'],
    ['Last synced', sync.lastSyncLabel],
    ['Waiting to send', sync.pendingCount === 0 ? 'Nothing' : `${sync.pendingCount} event${sync.pendingCount === 1 ? '' : 's'}`],
    ['Last error', sync.lastError || 'No errors', sync.lastError ? 'has-error' : undefined],
  ]))
  const syncNowBtn = el('button', { type: 'button', class: 'secondary-action', text: sync.busy ? 'Syncing…' : 'Sync now', disabled: !sync.canSync || sync.busy })
  syncNowBtn.addEventListener('click', sync.onSyncNow)
  syncGroup.appendChild(syncNowBtn)
  main.appendChild(syncGroup)

  // ── Journal ──
  const journalGroup = el('section', { class: 'settings-group sync-group journal-group', 'aria-label': 'Journal' })
  journalGroup.append(
    el('h2', { text: 'Journal' }),
    el('p', { text: 'Optionally send complete Focus, Short break, and Long break sessions to Daybook. This stays off until you choose it, even when Sync is on.' }),
  )
  journalGroup.appendChild(toggle('Include in journal', journal.enabled, journal.onToggle))
  journalGroup.appendChild(toggle('Upload subject and task to private Journal', journal.contentIncluded, journal.onContentToggle))
  journalGroup.appendChild(el('p', { class: 'sync-hint', text: 'When off, new records keep timing and completion metadata only. This is separate from Daybook Compact and does not erase content already present in Git history.' }))
  journalGroup.appendChild(statusList([
    ['Status', journal.errorCode || journal.status, journal.errorCode ? 'has-error' : undefined],
    ['Waiting to send', journal.pendingCount ? `${journal.pendingCount} record${journal.pendingCount === 1 ? '' : 's'}` : 'Nothing'],
  ]))
  journalGroup.appendChild(el('h3', { text: 'Add existing history' }))
  journalGroup.appendChild(el('p', { class: 'sync-hint', text: 'Runs only when you request it. Deleted sessions cannot be recovered.' }))
  const fromInput = el('input', { type: 'date' }); fromInput.value = journal.from
  fromInput.addEventListener('change', (event) => journal.onFrom(event.target.value))
  const toInput = el('input', { type: 'date' }); toInput.value = journal.to
  toInput.addEventListener('change', (event) => journal.onTo(event.target.value))
  journalGroup.appendChild(el('div', { class: 'journal-range' }, [
    el('label', { class: 'sync-field' }, [el('span', { text: 'From' }), fromInput]),
    el('label', { class: 'sync-field' }, [el('span', { text: 'To' }), toInput]),
  ]))
  const previewBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Preview' })
  previewBtn.addEventListener('click', journal.onPreview)
  const importBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Import' })
  importBtn.addEventListener('click', journal.onImport)
  const redactBtn = el('button', { type: 'button', class: 'secondary-action', text: 'Remove content' })
  redactBtn.addEventListener('click', journal.onRedact)
  journalGroup.appendChild(el('div', { class: 'sync-actions' }, [previewBtn, importBtn, redactBtn]))
  journalGroup.appendChild(el('p', { class: 'sync-hint', text: 'Before removing content, turn content upload off on every active installation. This changes the current Daybook projection, not Focus data, normal Sync, or existing Git history.' }))
  journalGroup.appendChild(el('p', {
    class: 'sync-hint journal-preview', 'aria-live': 'polite',
    text: journal.preview ? `${journal.preview.days} day(s) · ${journal.preview.records.length} session(s) available` : 'Default range: recent 3 months',
  }))
  main.appendChild(journalGroup)

  // ── Data ──
  const dataGroup = el('section', { class: 'settings-group data-group' })
  dataGroup.append(
    el('h2', { text: 'Data' }),
    el('p', {}, ['Your records are saved on this device automatically. In the share sheet choose ', el('b', { text: 'Save to Files' }), ' to keep a backup in iCloud Drive.']),
    el('p', { class: 'storage-protection-line', text: STORAGE_PROTECTION_LABEL[storagePersisted] }),
  )
  const exportBtn = el('button', { class: 'data-button sky', type: 'button' }, [
    cloudDownIcon(),
    el('span', {}, [
      'Save a backup file',
      el('small', {
        class: backupAge?.overdue ? 'overdue' : undefined,
        text: backupAge
          ? `Last backup ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(lastBackupAt)} · ${backupAge.label}${backupAge.overdue ? ' · back up soon' : ''}`
          : 'Choose Save to Files in the share sheet',
      }),
    ]),
    el('b', { text: '›' }),
  ])
  exportBtn.addEventListener('click', handlers.onExport)
  const githubBackupBtn = el('button', { class: 'data-button pink', type: 'button', disabled: !sync.canSync || sync.busy }, [
    cloudDownIcon(),
    el('span', {}, ['Back up to GitHub', el('small', { text: sync.remoteBackupLabel })]),
    el('b', { text: '›' }),
  ])
  githubBackupBtn.addEventListener('click', sync.onBackupToGitHub)
  const importFileBtn = el('button', { class: 'data-button lilac', type: 'button' }, [
    uploadIcon(),
    el('span', {}, ['Import a backup', el('small', { text: 'Merges safely with what is already here' })]),
    el('b', { text: '›' }),
  ])
  importFileBtn.addEventListener('click', handlers.onImport)
  dataGroup.append(exportBtn, githubBackupBtn, importFileBtn)
  main.appendChild(dataGroup)

  const clearBtn = el('button', { class: 'clear-button', type: 'button' }, [trashIcon(), 'Delete all records', el('span', { text: '›' })])
  clearBtn.addEventListener('click', handlers.onClear)
  main.appendChild(clearBtn)

  screen.appendChild(main)
  container.replaceChildren(screen)
}
