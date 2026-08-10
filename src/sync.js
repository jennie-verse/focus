/* sync.js — webapp-data(비공개 저장소)와 주고받는 부분만 모아 둔 모듈.
   화면 코드(App.jsx)는 여기 함수만 부르고 GitHub API를 직접 다루지 않습니다.

   공용 모듈은 다른 앱과 같은 파일을 씁니다. focus 는 Vite 로 빌드하므로
   상대 경로로는 저장소 밖 파일을 부를 수 없어 절대 주소로 가져오고,
   vite.config.js 에서 external 로 지정해 번들에 넣지 않습니다.

   다루는 것 세 가지입니다.
     A. focus/data.<ctx>.json          기기 간 동기화 (설정 + 세션)
     B. events/focus.<ctx>.YYYY-MM.json 공용 활동 기록 (atlas·trace 가 읽음)
     C. backups/focus/YYYY-MM-DD.json   복원용 스냅샷 (최근 12개 유지)

   동기화는 기본으로 꺼져 있습니다. 꺼진 상태에서도 앱은 완전히 동작해야 하고,
   로컬 저장이 언제나 먼저입니다. */

import * as Shared from 'https://jennie-verse.github.io/shared/v1/sync.js'

const NAMESPACE = 'focus'

const REPO = Object.freeze({
  owner: 'jennie-verse',
  repo: 'webapp-data',
  branch: 'main',
})

export const KEYS = Object.freeze({
  token: 'sync.token.v1',
  enabled: 'focus.syncEnabled',
  lastSyncAt: 'focus.lastSyncAt',
  lastRemoteBackupAt: 'focus.lastRemoteBackupAt',
  pendingEvents: 'focus.pendingEvents',
})

const BACKUP_KEEP = 12
// GitHub Contents API 는 1MB 를 넘으면 읽기가 느려지고 커밋도 무거워집니다.
const MAX_FILE_BYTES = 1000000
// 오프라인 중 쌓인 변경은 오래된 sha 로 재전송되므로 충돌이 정상적으로 납니다.
const CONFLICT_RETRY = 3
// 1분 미만 집중은 이벤트로 남기지 않습니다(실수로 눌렀다 끈 경우).
const MIN_EVENT_SECONDS = 60

function readItem(key, fallback = '') {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

function writeItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

/* ── 토큰과 켜짐 여부 ──────────────────────────────────────────────────── */

export function getToken() {
  return readItem(KEYS.token, '')
}

export function saveToken(token) {
  const trimmed = String(token || '').trim()
  if (!trimmed) return false
  return writeItem(KEYS.token, trimmed)
}

export function clearToken() {
  removeItem(KEYS.token)
}

export function isEnabled() {
  return readItem(KEYS.enabled) === '1'
}

export function setEnabled(enabled) {
  writeItem(KEYS.enabled, enabled ? '1' : '0')
}

export function getContextId() {
  return Shared.getContextId(NAMESPACE) || ''
}

export function getContextLabel() {
  return Shared.getContextLabel(NAMESPACE) || ''
}

/** 컨텍스트 ID 를 만듭니다.

    **ID 는 만들 때 정해지고 이후 바뀌지 않습니다.** 파일 이름에 들어가기 때문입니다.
    그래서 동기화를 켜기 전에 받은 이름을 여기로 넘겨 ID 에 반영합니다.
    이름 없이 만들면 `context-3f2a1b9c` 처럼 되어 어느 기기 파일인지 알아볼 수 없습니다.

    공용 모듈은 이름에서 영문 소문자와 숫자만 남깁니다(파일 이름 규칙).
    한글만 적으면 전부 걸러져 `context-…` 가 되므로, 화면에서 영문 입력을 안내합니다.
    사용자에게 보이는 이름(label)에는 한글이 그대로 남습니다. */
export async function ensureContext(preferredName) {
  return Shared.ensureContextId(NAMESPACE, () => String(preferredName || '').trim())
}

/** 사용자가 붙이는 이름입니다. 한글도 그대로 저장됩니다. 파일 이름과는 무관합니다. */
export function setContextLabel(label) {
  Shared.setContextLabel(NAMESPACE, String(label || '').trim())
}

export function getLastSyncAt() {
  return Number(readItem(KEYS.lastSyncAt, '0')) || 0
}

export function getLastRemoteBackupAt() {
  return Number(readItem(KEYS.lastRemoteBackupAt, '0')) || 0
}

/** 동기화가 실제로 동작할 수 있는 상태인지. 셋 중 하나라도 없으면 조용히 쉽니다. */
export function isReady() {
  return Boolean(isEnabled() && getToken() && getContextId())
}

function config() {
  return { ...REPO, token: getToken() }
}

/** 화면에 그대로 보여 줄 수 있는 영문 한 줄로 바꿉니다. */
export function describeError(error) {
  if (!error) return 'Sync failed.'
  if (error.type === 'auth') return 'Token may be expired or lacks permission.'
  if (error.type === 'network') return 'Network unavailable. Changes are queued.'
  if (error.type === 'notfound') return 'The repository path was not found.'
  if (error.type === 'conflict') return 'Another device wrote first. Queued to send again.'
  if (error.type === 'toolarge') return 'The file is too large to sync. Export a backup file instead.'
  return 'Sync failed. Check the token and repository access.'
}

function tooLarge(message) {
  const error = new Error(message)
  error.type = 'toolarge'
  return error
}

/* ── B. 공용 활동 기록 ─────────────────────────────────────────────────── */

function monthKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 로컬 오프셋을 살린 ISO 문자열. 하루 경계를 보는 앱들이 있어 UTC 로 바꾸지 않습니다. */
function localIso(timestamp) {
  const date = new Date(timestamp)
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const pad = (value) => String(Math.abs(value)).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`
}

/** 집중 세션 하나를 공용 이벤트 모양으로 바꿉니다. 휴식은 넘기지 않습니다.

    중간에 끝낸 세션도 올립니다. focus 앱 자신이 그 시간을 실제 집중 시간으로 세기
    때문입니다(오늘 집중 시간 합계와 연속 기록에 들어갑니다). 완주만 올리면
    20분씩 세 번 집중하고 매번 일찍 끝낸 날이 Trace 에서 빈 날로 보입니다.

    다만 실수로 눌렀다 끈 것까지 남기지 않도록 1분 미만은 제외합니다. */
export function sessionToEvent(session) {
  if (!session || session.mode !== 'focus') return null

  const seconds = Number(session.elapsedSeconds) || 0
  if (seconds < MIN_EVENT_SECONDS) return null

  const minutes = Math.max(1, Math.round(seconds / 60))
  const completed = session.completed === true

  return {
    v: 1,
    id: `focus:${session.id}`,
    app: 'focus',
    kind: completed ? 'session.completed' : 'session.ended',
    at: localIso(session.endedAt),
    title: completed ? `Finished a ${minutes}-min focus session` : `Focused for ${minutes} min`,
    ref: '../focus/',
  }
}

function pendingEvents() {
  const value = parseJson(readItem(KEYS.pendingEvents, '[]'), [])
  return Array.isArray(value) ? value : []
}

/** 아직 보내지 못한 이벤트를 로컬에 쌓아 둡니다.
    공용 outbox 는 보낼 본문을 통째로 저장하는데, 이벤트 파일은 보낼 때마다
    원격과 다시 합쳐야 해서 본문을 미리 굳히면 안 됩니다. 그래서 이벤트만 모읍니다. */
export function queueEvent(event) {
  if (!event) return
  const queue = pendingEvents().filter((item) => item.id !== event.id)
  queue.push(event)
  writeItem(KEYS.pendingEvents, JSON.stringify(queue))
}

export function pendingEventCount() {
  return pendingEvents().length
}

function mergeEventsById(current, incoming) {
  const merged = new Map()
  current.forEach((event) => event?.id && merged.set(event.id, event))
  let changed = false
  incoming.forEach((event) => {
    if (!event?.id) return
    const previous = merged.get(event.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(event)) return
    merged.set(event.id, event)
    changed = true
  })
  return { list: [...merged.values()], changed }
}

async function writeEventMonth(cfg, path, incoming) {
  for (let attempt = 0; attempt < CONFLICT_RETRY; attempt += 1) {
    const existing = await Shared.readFile(cfg, path)
    const current = existing.exists ? parseJson(existing.content, []) : []
    const merged = mergeEventsById(Array.isArray(current) ? current : [], incoming)
    if (!merged.changed) return

    const body = `${JSON.stringify(merged.list, null, 2)}\n`
    if (body.length > MAX_FILE_BYTES) {
      throw tooLarge('The monthly event file is too large.')
    }

    try {
      await Shared.writeFile(cfg, path, body, {
        sha: existing.sha || undefined,
        message: `focus: add ${incoming.length} event(s) to ${path}`,
      })
      return
    } catch (error) {
      // 다른 기기가 먼저 썼습니다. 최신 sha 로 다시 읽어 합친 뒤 재시도합니다.
      if (error?.type === 'conflict' && attempt < CONFLICT_RETRY - 1) continue
      throw error
    }
  }
}

/** 쌓인 이벤트를 달별로 나눠 보냅니다. 성공한 달의 것만 큐에서 뺍니다. */
export async function flushEvents() {
  if (!isReady()) return { sent: 0, remaining: pendingEventCount() }
  const queue = pendingEvents()
  if (queue.length === 0) return { sent: 0, remaining: 0 }

  const cfg = config()
  const contextId = getContextId()
  const byMonth = new Map()
  queue.forEach((event) => {
    const key = monthKey(Date.parse(event.at))
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(event)
  })

  let sent = 0
  let firstError = null
  const stillPending = []

  for (const [month, events] of byMonth) {
    // 이름 순서가 <앱>.<기기>.<YYYY-MM>.json 이어야 atlas·trace 파서가 알아봅니다.
    // Shared.contextFilePath 는 마지막 점 앞에 기기 ID를 넣기 때문에
    // focus.2026-08.<ctx>.json 이 되어 버립니다. 그래서 직접 만듭니다.
    const path = `events/${NAMESPACE}.${contextId}.${month}.json`
    try {
      await writeEventMonth(cfg, path, events)
      sent += events.length
    } catch (error) {
      firstError ||= error
      stillPending.push(...events)
    }
  }

  writeItem(KEYS.pendingEvents, JSON.stringify(stillPending))
  if (firstError && sent === 0) throw firstError
  return { sent, remaining: stillPending.length }
}

/* ── A. 기기 간 동기화 ─────────────────────────────────────────────────── */

function dataPath(contextId) {
  return Shared.contextFilePath(`${NAMESPACE}/data.json`, contextId)
}

/** 이 기기의 설정·세션 전체를 한 파일로 올립니다. 기기마다 파일이 분리됩니다. */
export async function pushData({ settings, sessions }) {
  if (!isReady()) return false
  const cfg = config()
  const path = dataPath(getContextId())
  const body = `${JSON.stringify({
    v: 1,
    app: NAMESPACE,
    context: getContextId(),
    updatedAt: new Date().toISOString(),
    data: { settings, sessions },
  }, null, 2)}\n`

  if (body.length > MAX_FILE_BYTES) {
    throw tooLarge('The focus data file is too large to sync.')
  }

  const existing = await Shared.readFile(cfg, path)
  await Shared.writeFile(cfg, path, body, {
    sha: existing.sha || undefined,
    message: `focus: update ${path}`,
  })
  writeItem(KEYS.lastSyncAt, String(Date.now()))
  return true
}

/** 모든 기기의 파일을 읽어 세션을 합칩니다. 같은 id 는 endedAt 이 최신인 쪽이 이깁니다. */
export async function pullSessions() {
  if (!isReady()) return null
  const cfg = config()
  const entries = await Shared.listDir(cfg, NAMESPACE)
  const files = entries.filter((entry) => (
    entry.type === 'file' && /^data\.[a-z0-9-]+\.json$/i.test(entry.name)
  ))
  if (files.length === 0) return []

  const merged = new Map()
  for (const entry of files) {
    const file = await Shared.readFile(cfg, entry.path)
    if (!file.exists) continue
    const payload = parseJson(file.content, null)
    const sessions = payload?.data?.sessions
    if (!Array.isArray(sessions)) continue
    sessions.forEach((session) => {
      if (!session || typeof session.id !== 'string') return
      const previous = merged.get(session.id)
      if (!previous || Number(session.endedAt) > Number(previous.endedAt)) {
        merged.set(session.id, session)
      }
    })
  }
  writeItem(KEYS.lastSyncAt, String(Date.now()))
  return [...merged.values()]
}

/* ── C. 백업 ───────────────────────────────────────────────────────────── */

function backupDayKey(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 백업 본문은 기기 파일 내보내기와 같은 모양입니다. 기존 가져오기가 그대로 읽습니다. */
export async function backupNow(backupPayload) {
  if (!isReady()) return false
  const cfg = config()
  const path = `backups/${NAMESPACE}/${backupDayKey(Date.now())}.json`
  const body = `${JSON.stringify(backupPayload, null, 2)}\n`

  if (body.length > MAX_FILE_BYTES) {
    throw tooLarge('The backup is too large to upload. Export it to Files instead.')
  }

  const existing = await Shared.readFile(cfg, path)
  await Shared.writeFile(cfg, path, body, {
    sha: existing.sha || undefined,
    message: `focus: back up ${path}`,
  })
  writeItem(KEYS.lastRemoteBackupAt, String(Date.now()))
  await pruneBackups(cfg)
  return true
}

/** 최근 12개만 남기고 오래된 것부터 지웁니다. 실패해도 백업 자체는 성공으로 둡니다. */
async function pruneBackups(cfg) {
  try {
    const entries = await Shared.listDir(cfg, `backups/${NAMESPACE}`)
    const files = entries
      .filter((entry) => entry.type === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
    const extra = files.slice(0, Math.max(0, files.length - BACKUP_KEEP))
    for (const entry of extra) {
      await Shared.deleteFile(cfg, entry.path, entry.sha, `focus: prune ${entry.path}`)
    }
  } catch {
    // 정리는 부가 작업입니다. 실패해도 다음 백업에서 다시 시도합니다.
  }
}
