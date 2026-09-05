# Focus — 테스트 결과 (2026-08-08, 글자 크기 6단계 + docs 추가 + 폰트 404 수정)

## 이번 변경

- WebApp_House_Style.md 기준 미달 2건 보완: 글자 크기 6단계 조절, `docs/` 4종 문서
- 기존 기능·저장 데이터(IndexedDB 세션 기록, localStorage 설정)는 변경하지 않음
- 글자 크기 기본(4단계)은 지금까지 써 온 화면 크기와 동일하게 유지 (사용자 승인 사항)
- `public/sw.js` 캐시 버전을 `2026.08.04-focus5` → `2026.08.08-fontscale1`로 올림
- **배포 후 발견된 기존 버그 수정**: `@font-face`의 `src: url('./fonts/...')`가 `./` 상대경로였는데, Vite가 CSS를 `dist/assets/index-*.css`로 번들링하면서 실제 폰트 파일(`dist/fonts/`)과 위치가 어긋나 매번 404였습니다. `../fonts/...`로 고쳐 `dist/assets/`에서 한 단계 위인 `dist/fonts/`를 정확히 가리키도록 했습니다. 글자 크기 기능과는 무관한 별개 수정입니다.

## 통과 항목 (코드 검토·빌드로 확인)

- `npm run build` 정상 완료, 콘솔 오류 없음
- 폰트 경로 수정 후 `dist/assets/index-*.css`의 `url(../fonts/lexend-400.woff2)`가 실제 `dist/fonts/lexend-400.woff2` 위치와 일치함을 빌드 결과물로 직접 확인
- `src/styles.css`의 `font-size` 규칙 38곳을 `calc(원래값 * var(--scale))`로 전환. 실제 시간 입력창(`.session-fields input`)만 15px 고정으로 남겨 iOS 자동 확대를 유발하지 않음
- 타이머 큰 숫자(`.timer-copy strong`)는 `clamp()`의 최소·최대값에도 배율을 반영해, 화면 폭 반응형과 글자 크기 설정이 함께 작동
- 버튼류(`.stepper button`, `.mode-control button` 등)는 글자만 `calc(...)`로 줄고 `width`/`min-height`는 원래 px 값 그대로라 44×44px 이상 터치 영역이 유지됨
- `DEFAULT_SETTINGS.fontScale` 추가(기본 4) — 기존 사용자의 저장된 설정에 이 키가 없어도 `loadSettings()`의 스프레드 병합으로 자동으로 4가 채워짐 (기존 데이터 호환)
- 설정 화면에 "글자 크기" 스테퍼(1~6, −/＋) 추가, 기본이 아닐 때만 "기본 크기로 되돌리기" 버튼 표시
- `--scale` CSS 변수는 `App.jsx`의 `useEffect`가 `settings.fontScale`이 바뀔 때마다 `document.documentElement`에 반영

## 실기기에서 직접 확인 필요 (Pending)

- iPhone 세로·가로, iPad 세로·가로에서 1~6단계 전체 확인 — 버튼 겹침, 글자 잘림 여부
- 6px·8px 대응 단계(1~2)에서 통계 화면의 막대 차트·요일 라벨이 겹치지 않는지
- 6단계(가장 큰 글자)에서 헤더 타이틀과 통계 숫자가 잘리지 않는지
- 새로고침·앱 재실행 후 글자 크기 설정이 유지되는지
- GitHub Actions 빌드·배포 성공 여부 및 실제 배포 URL에서의 콘솔 오류 0건 확인
- 홈 화면에 이미 설치된 기존 앱에서, 이번 배포 후 캐시가 정상적으로 갱신되고 기존 세션 기록이 그대로 유지되는지
- 실제 배포 URL에서 Lexend 폰트가 (시스템 폰트 폴백이 아니라) 정상적으로 로드되는지, 콘솔에 폰트 404가 더 이상 없는지

## 손대지 않은 부분

- 타이머 로직, 알림·진동·Wake Lock, 백업/복원 형식은 글자 크기와 무관하므로 수정하지 않음

---

# 2026-08-09 추가 검토 — 동기화·백업·영문화

변경 내용: `src/sync.js` 추가(events 쓰기 / focus 데이터 동기화 / GitHub 백업),
설정 화면에 Sync 항목 추가, **화면 문구 전체 영문화**, Service Worker `2026.08.09-round2a` → `2026.08.09-sync1`.

검토 방식: 의존성을 새로 설치해 `npm run build` 를 실제로 돌리고, 공용 모듈을 가짜로 바꾼 뒤
`src/sync.js` 단위 검사와 **빌드 결과물**의 jsdom 실행 검사를 함께 했습니다. 검사 42건 전부 통과했습니다.

## 1. 검토 중 발견해 고친 문제

| 문제 | 내용 |
|---|---|
| **이벤트 파일 이름이 규격과 달랐음** | 공용 `contextFilePath()` 는 마지막 점 앞에 기기 ID를 넣어 `focus.2026-08.<기기>.json` 이 됩니다. atlas·trace 파서는 `<앱>.<기기>.<YYYY-MM>.json` 만 인식하므로 **focus 가 남긴 이벤트가 두 앱에 아예 보이지 않는 상태**였습니다. 경로를 직접 만들도록 고쳤습니다. |
| SW 설치가 통째로 실패할 수 있었음 | 공용 모듈을 `cache.addAll` 에 넣으면 그 파일 하나가 안 열릴 때 설치 전체가 실패합니다. 선택 자산으로 분리해 개별 `catch` 로 담습니다. |

## 2. 통과한 항목

| 항목 | 결과 |
|---|---|
| 빌드 | `npm run build` 성공. 오류 0건, 새 경고 0건 |
| 번들 출력 | 공용 모듈이 `import*as e from"https://jennie-verse.github.io/shared/v1/sync.js"` 로 남고 번들에 포함되지 않음 |
| Lint | 오류 0건 (기존 경고 1건은 이번 변경과 무관) |
| 세션 → 이벤트 | 완료한 집중 세션만 이벤트가 됨. 휴식·미완료는 만들지 않음 |
| 시각 표기 | `at` 이 로컬 오프셋을 유지 (`2026-08-09T09:05:00-05:00`) |
| 파일 이름 | `events/focus.<기기>.<YYYY-MM>.json` 규격 일치 |
| 동기화 꺼짐 기본값 | 꺼진 상태에서 GitHub 요청이 **한 건도 나가지 않음** |
| 중복 방지 | 같은 `id` 를 다시 보내도 파일에 하나만 남음 |
| **충돌(409) 재시도** | 다른 기기가 먼저 쓴 이벤트가 보존되고 내 이벤트도 함께 남음. 재읽기 후 병합 확인 |
| 네트워크 실패 | 오류가 그대로 전달되고 이벤트는 큐에 남음. 복귀 후 재시도로 전송됨 |
| 백업 정리 | 오래된 것부터 지워 12개 유지. 같은 날 다시 눌러도 개수가 늘지 않음 |
| 1MB 한도 | 초과 시 올리지 않고 파일 내보내기를 안내 |
| 여러 기기 병합 | 같은 `id` 는 `endedAt` 이 최신인 쪽이 이김. `data.<기기>.json` 이 아닌 파일은 읽지 않음 |
| 빌드된 앱 실행 | jsdom 에서 콘솔 오류 0건, 타이머 화면 정상 |
| 영문화 | 타이머·설정 화면 모두 한글 0자 |
| 입력창 확대 방지 | 새 토큰 입력창 `font-size: 16px` |

## 3. 실기기(iPhone/iPad Safari)에서 직접 확인해야 할 항목 (Pending)

- [ ] 실제 토큰으로 동기화를 켜고 집중 세션을 완료했을 때 `webapp-data` 에 파일이 실제로 생기는지
- [ ] 그 기록이 **Atlas 검색과 Trace 하루 타임라인에 나타나는지** (1단계와 함께 검증됨)
- [ ] `Back up to GitHub` 후 `backups/focus/` 에 오늘 날짜 파일이 생기는지
- [ ] 비행기 모드에서 세션을 완료하고 온라인 복귀 후 `Waiting to send` 가 0이 되는지
- [ ] Safari 탭과 홈 화면 앱을 각각 켰을 때 기기 이름이 따로 잡히고 파일이 분리되는지
- [ ] 글자 크기 6단계 각각에서 새 Sync 항목이 겹치거나 잘리지 않는지, 터치 영역 44px 이상인지
- [ ] Service Worker 가 `focus-2026.08.09-sync1` 로 갱신된 뒤 다른 앱 캐시가 남아 있는지
- [ ] 오프라인에서 앱을 다시 열었을 때 공용 모듈이 캐시에서 로드되어 화면이 뜨는지

---

# 2026-08-09 재검토 — CSP 가 GitHub API 를 막고 있었음

실기기에서 동기화를 켜자 focus 만 `Network unavailable. Changes are queued.` 가 떴습니다.
같은 기기에서 Atlas 는 `No errors` 였습니다.

## 원인

`index.html` 의 CSP 가 `connect-src 'self'` 였습니다. api.github.com 이 빠져 있어
브라우저가 요청 자체를 막았고, `fetch()` 가 거부되어 공용 모듈이 network 오류로 보고했습니다.

```
이전:  connect-src 'self'
이후:  connect-src 'self' https://api.github.com
```

Atlas·Tide·Trace 는 처음부터 api.github.com 이 들어 있었습니다. focus 는 2026-08-09 에 CSP 를
새로 넣으면서 그때 동기화 계획이 없어 빠진 것으로 보입니다.

## 왜 자동 검사에서 못 잡았는가

**jsdom 은 meta 태그 CSP 를 강제하지 않습니다.** 그래서 42건이 전부 통과했는데도 실기기에서만 드러났습니다.
같은 실수를 막기 위해 테스트에 **CSP 정적 검사**를 넣었습니다. 앞으로 GitHub API 를 쓰는 앱은
`connect-src` 에 `api.github.com` 이 있는지 파일에서 직접 확인합니다. 현재 44건 전부 통과합니다.

## 다른 앱 점검 결과

| 앱 | connect-src | 비고 |
|---|---|---|
| atlas · tide · trace | `'self' https://api.github.com` | 정상 |
| **focus** | `'self'` → **고침** | 이번 수정 |
| grove · loom · petal · quill | `'self'` | 아직 동기화를 쓰지 않아 문제 없음. **연결할 때 함께 고쳐야 함** |
| vault | CSP 없음 | 연결할 때 CSP 를 새로 넣어야 함 |

Service Worker 캐시: `2026.08.09-sync1` → `2026.08.09-sync2`

---

# 2026-08-09 개선 — 중간 종료 세션 포함 · 컨텍스트 이름

실기기에서 A·B·C 세 층이 모두 동작하는 것을 확인한 뒤, 그 과정에서 드러난 두 가지를 고쳤습니다.
Service Worker 캐시: `2026.08.09-sync2` → `2026.08.09-sync3`. 검사 52건 + 통합 12건 전부 통과.

## 1. 중간에 끝낸 집중 세션이 기록에서 빠지던 문제

처음 설계는 완주한 세션만 이벤트로 남겼습니다. 그런데 focus 앱 자신은 중간에 끝낸 집중도
실제 집중 시간으로 셉니다(`getTodayStats` 합계, `getStreak`). 앱의 기준과 공용 층의 기준이 어긋나
**20분씩 세 번 집중하고 매번 일찍 끝낸 날이 Trace 에서 빈 날로 보이는 상태**였습니다.

| 조건 | 이전 | 이후 |
|---|---|---|
| 완주 | `Finished a N-min focus session` | 동일 |
| 중간 종료 | **기록 없음** | `Focused for N min` (`kind: session.ended`) |
| 1분 미만 | 기록 없음 | 기록 없음 (실수 방지) |

## 2. 컨텍스트 ID 가 `context-…` 로만 만들어지던 문제

ID 는 **만들 때 정해지고 파일 이름에 들어가므로 이후 바뀌지 않습니다.** 그런데 이름을 묻지 않고
먼저 ID 를 만든 뒤 나중에 이름을 붙이게 해 두어, 붙인 이름은 화면에만 보이고 파일 이름은
영영 `context-7f2ba4ea` 로 남았습니다. clip 의 `iphone-safari-…` 와 달리 어느 기기 파일인지
구분할 수 없었습니다.

수정: 이름 칸을 스위치 **위로** 옮기고, 켤 때 그 이름을 `ensureContext(name)` 으로 넘깁니다.
설정에 **File name** 줄을 추가해 이 기기의 파일 이름을 확인할 수 있게 했습니다.

이미 만들어진 `context-7f2ba4ea`, `context-e32c42a1` 두 컨텍스트는 그대로 둡니다.
ID 를 바꾸면 기존 파일이 고아가 되는데, 얻는 것이 이름 가독성뿐이라 그대로 두는 편이 낫습니다.

## 3. 새로 추가한 검사

| 항목 | 결과 |
|---|---|
| 중간에 끝낸 집중 세션도 이벤트가 됨 | 통과 |
| 중간 종료는 제목과 kind 가 다름 | 통과 (`Focused for 12 min` / `session.ended`) |
| 1분 미만은 완주 여부와 무관하게 제외 | 통과 |
| 휴식은 길어도 제외 | 통과 |
| 영문 이름이 파일 이름 ID 에 반영됨 | 통과 (`iPhone Home Screen` → `iphone-home-screen-…`) |
| 한글만 적으면 `context-` 로 대체됨 | 통과 (화면에서 영문 입력을 안내) |
| ID 가 파일 이름 규칙(a-z0-9-)만 씀 | 통과 |

## 4. 실기기에서 확인된 항목 (2026-08-09 완료)

- [x] 동기화를 켜고 세션을 완주하면 `events/focus.*.json` 이 실제로 생김
- [x] 그 기록이 Atlas 검색과 Trace 하루 타임라인에 나타남
- [x] `focus/data.<기기ID>.json` 이 컨텍스트별로 분리되어 저장됨
- [x] CSP 수정 후 `Last error` 가 `No errors`, `Waiting to send` 가 `Nothing`

## 5. 아직 확인하지 못한 항목 (Pending)

- [ ] 중간 종료 세션이 `Focused for N min` 으로 실제로 올라가는지
- [ ] 새로 만드는 컨텍스트의 파일 이름이 읽기 쉽게 나오는지
- [ ] `Back up to GitHub` 로 `backups/focus/` 에 파일이 생기는지 (아직 눌러 본 적 없음)
- [ ] 비행기 모드에서 세션 완료 후 온라인 복귀 시 `Waiting to send` 가 0이 되는지

---

# 2026-08-09 수정 — 기기가 원격 기록을 따라잡지 못하던 문제

실기기에서 홈 화면 앱을 지웠다 다시 추가한 뒤, **옛 컨텍스트의 세션 1건이 새 기기로 넘어오지
않았습니다.** `focus/` 에 스냅샷 3개가 쌓였고 서로 겹치는 세션이 하나도 없었습니다.

## 원인 — 받아오는 시점이 두 곳뿐이었습니다

| 동작 | 올리기 | 받아오기 |
|---|---|---|
| 동기화 켜기 | O | O |
| Sync now | O | O |
| **세션 끝내기** | O | **X** |
| **앱 열기** | X | **X** |

세션을 끝낼 때는 올리기만 했습니다. 그래서 **동기화를 켜는 그 한 번의 통신이 실패하면
그 기기는 원격에 있는 기록을 영영 따라잡지 못했습니다.** 이후 세션을 끝낼 때마다
빠진 상태 그대로 덮어써 원격에도 반영되지 않았습니다.

## 수정

1. **앱을 열 때 한 번 받아옵니다.** 동기화가 켜져 있고 온라인이면 시작 직후 1회 실행합니다.
   실패해도 조용히 넘어가고, 다음에 열 때 다시 시도하므로 스스로 회복합니다.
2. **받아와서 합쳐지면 그 자리에서 내 파일에도 올립니다.** 예전에는 다음 세션을 끝낼 때까지
   원격에 반영되지 않아, 그 사이 다른 기기가 읽으면 기록이 없어 보였습니다.

시작 동기화는 첫 화면이 그려진 뒤(`setTimeout 0`)에 시작해 렌더를 막지 않습니다.

Service Worker 캐시: `2026.08.09-sync3` → `2026.08.09-sync4`

## 새로 만든 재현 검사

빌드된 앱을 그대로 띄워 실제 상황을 재현합니다. IndexedDB 도 실제 구현을 넣어
아이폰과 같은 조건으로 맞췄습니다.

| 시나리오 | 확인 |
|---|---|
| 앱을 지웠다 다시 깔고 동기화를 켬 | 옛 컨텍스트 파일을 읽고, 세션이 이 기기로 넘어오고, 화면에 나타남 |
| 이미 켜진 기기를 **열기만** 함 | 아무것도 누르지 않아도 다른 기기 기록을 받아오고 내 파일에도 반영함 |

검사 결과: 재현 10건 + 단위 52건 + 통합 12건, 전부 통과.

## 이 문제가 남긴 것

`focus/` 에 스냅샷 3개가 남아 있습니다. 이번 수정을 배포하고 앱을 한 번 열면
옛 세션이 현재 기기로 합쳐지고, 그때 옛 파일 2개는 안전하게 지울 수 있습니다.
`events/` 파일은 과거 기록이므로 지우지 않습니다.

---

# 2026-08-09 사고와 수정 — 동기화가 원격 기록을 지웠음

`sync4`(앱을 열 때 받아오기)를 배포한 뒤 기기에서 앱을 열자, 원격의 세션이 **3건에서 1건으로
줄었습니다.** 제가 넣은 변경이 만든 회귀입니다.

## 원인 — 화면 상태를 올렸습니다

`runSync()` 가 올릴 목록으로 React 상태 `sessions` 를 썼습니다. 그런데 세션은 앱이 열린 뒤
IndexedDB 에서 **비동기로** 읽어 옵니다. 시작 동기화는 그보다 먼저 돌기 때문에 `sessions` 가
아직 빈 배열이었고, **빈 목록이 그대로 원격 파일을 덮어썼습니다.**

이어서 `replaceSessions(빈 배열 + 원격 1건)` 이 로컬 저장소까지 비우고 1건만 남겼습니다.

```
올리기(빈 목록) → 원격 3건이 0건이 됨
받아오기        → 옛 컨텍스트의 1건만 발견
replaceSessions → 로컬도 1건으로 축소
```

## 수정 — 두 겹으로 막았습니다

**1. `runSync()` 가 저장소에서 직접 읽고, 받아오기를 먼저 합니다.**

| | 이전 | 이후 |
|---|---|---|
| 올릴 목록의 출처 | React 상태 `sessions` | `getSessions()` (저장소) |
| 순서 | 올리기 → 받아오기 | **받아오기 → 합치기 → 올리기** |
| 로컬 덮어쓰기 | 조건이 `!==` 라 줄어도 실행 | **늘어났을 때만** 실행 |

**2. `pushData()` 자체가 기록을 줄이지 못하게 했습니다.**

올리기 전에 원격 파일을 읽어 **합집합**을 만들어 씁니다. 화면 상태가 비었든, IndexedDB 가
잠깐 안 열리든, 어떤 경로로 빈 목록이 들어와도 원격 기록이 사라지지 않습니다.

이 규칙의 대가로 **한 기기에서 지운 세션은 원격에서 사라지지 않습니다.** 기기 간 삭제를
맞추려면 tide 처럼 tombstone 을 따로 둬야 합니다. 지금은 데이터 유실을 막는 쪽을 택했습니다.

## 회귀 검사 추가

빌드된 앱을 실제로 띄워 사고 상황을 그대로 재현합니다.

| 시나리오 | 확인 |
|---|---|
| 동기화가 켜진 기기를 로컬이 빈 상태로 열기 | **원격 세션 3건이 그대로 남는가** + 다른 기기 기록도 합쳐지는가 |

검사 결과: 재현 14건 + 단위 52건 + 통합 12건, 전부 통과.

## 잃어버린 기록

세션 3건(`3d8fc817`, `0cc55e0e`, `537997ac`)이 `focus/` 에서 사라졌습니다.
`backups/focus/2026-08-09.json` 에 4건 모두 남아 있어 복구 가능합니다.
백업 버튼을 눌러 둔 것이 결과적으로 데이터를 지켰습니다.

Service Worker 캐시: `2026.08.09-sync4` → `2026.08.09-sync5`

---

# 2026-08-09 재발 — 고친 코드가 실제로는 돌지 않았음

`sync5`(합집합 보장) 배포 후에도 기기에서 원격 세션이 **4건 → 2건**으로 줄었습니다.
그런데 커밋 기록을 보면 첫 쓰기가 **세션 0건**이었습니다.

```
52a78ff  01:36  4건  (백업에서 복구)
8578908  01:56  0건  ← 여기
c0d119a  01:56  1건
e0c5e89  01:56  2건
```

## 이것이 알려 주는 것

`sync5` 의 `pushData()` 는 올리기 전에 원격 파일을 읽어 합집합을 만듭니다.
**원격에 4건이 있는 상태에서 0건이 써지는 것은 구조적으로 불가능합니다.**
따라서 그 시각에 돌아간 코드는 `sync5` 가 아니라 **캐시에 남아 있던 이전 빌드**입니다.

`public/sw.js` 의 fetch 핸들러는 캐시를 먼저 돌려주고 갱신은 뒤에서 합니다.

```js
if (cached) { event.waitUntil(refresh); return cached }
```

새 버전을 배포해도 **앱을 처음 열 때 화면에 뜨는 것은 이전 빌드**이고, 새 것은 그다음에
열 때부터 적용됩니다. 즉 이미 고친 버그가 한 번 더 데이터를 지울 수 있습니다.

## 수정 — 지금 무엇이 돌고 있는지 보이게 했습니다

설정 → Sync 에 **App version** 줄을 넣었습니다. `src/App.jsx` 의 `APP_BUILD` 와
`public/sw.js` 의 `VERSION` 이 같은 값이어야 하고, 어긋나면 테스트가 실패합니다.

이제 배포 후 화면에서 버전을 직접 확인한 뒤에 다음 단계로 넘어갈 수 있습니다.

## 이번 일에서 배운 것

- 배포 확인(URL 에 새 버전이 있는지)과 **기기 적용 확인은 다른 문제**입니다
- 데이터를 건드리는 수정은 **버전이 실제로 바뀐 것을 확인한 뒤에** 검증해야 합니다
- 위험한 검증 전에는 **동기화를 꺼 두는 것**이 가장 확실한 안전장치입니다

Service Worker 캐시: `2026.08.09-sync5` → `2026.08.09-sync6`

## 2026-08-26 Journal content/redaction

- **Pass:** 10개 회귀 검사, ESLint, clean production build, diff-check; 종료일 배치, content-off payload/pending 정제와 범위 redaction.
- **Pass:** production `dist` desktop·390×844 Settings, overflow 0, console warning/error 0, 새 Service Worker 등록.
- **Pending:** 실제 private write/read/offline flush 및 iPhone/iPad Home Screen 문맥.

## 2026-08-26 정적 재작성 + Minimal mode (C-1)

계획서: `Plan/webapp-benchmark/Productivity_App_Benchmark_Plan_2026-08-26.md` C-1. 왜 재작성하는지는 `docs/README-KO.md`·`docs/GITHUB-PAGES-KO.md` 상단 참고. **이 커밋은 아직 `main`에 병합·배포하지 않았습니다** — 아래 "배포와 실기기 확인" 절 참고.

### 기능 인벤토리 — 옛 파일 → 새 파일 대조

| 기능 | 이전 위치 | 새 위치 | 확인 |
|---|---|---|---|
| 집중/짧은 휴식/긴 휴식 3모드, 원형 링 타이머 | `App.jsx`+`TimerScreen.jsx` | `model.js`(`MODES`,`createTimer`)+`timer-screen.js`(`buildRing`) | 실측 |
| −/＋ 1분 조절 버튼 | `App.jsx`(`adjustMinutes`) | `model.js`(`adjustedMinutes`)+`timer-screen.js` | 실측(24회 감소 → 1분에서 정지) |
| Start/Pause/Resume/End and log, 실제 사용 시간 저장 | `App.jsx` | `app.js`(`timerHandlers`, `finishSession`) | 실측 |
| 과목·작업 이름 입력 | `TimerScreen.jsx` | `timer-screen.js`(`session-fields`) | 실측(한글 입력 확인) |
| 오늘 집중시간·완료세션·streak | `StatsPanel.jsx`+`stats.js` | `timer-screen.js`(`buildStatsPanel`)+`stats.js`(그대로) | 실측 |
| 7일 차트·일별상세·최근세션 | `StatsPanel.jsx` | `timer-screen.js` | 실측 |
| 긴 휴식 주기 설정 | `SettingsScreen.jsx` | `settings-screen.js` | 코드 대조 |
| 알림음·진동·화면알림·자동다음 | `App.jsx`(`playChime`,`notifySessionEnd`) | `app.js`(동일 함수 그대로 이동) | 코드 대조(Web Audio/Notification API는 헤드리스에서 재생 확인 불가 — Pending) |
| Wake Lock | `App.jsx` `useEffect` | `app.js`(`acquireWakeLock`/`manageWakeLock`, `setTimer`가 호출) | 코드 대조(헤드리스는 `navigator.wakeLock` 미지원 환경일 수 있어 Pending) |
| JSON 백업·복원 | `App.jsx` | `app.js`(`exportBackup`/`importBackupFile`) | **실측 — 구버전 형식 백업 실제 왕복 확인(아래)** |
| Sync, Journal(`session` kind), 본문 업로드 토글 | `sync.js`,`journal.js`,`journal-record.js` | 동일 파일, 동적 import 경로만 단순화 | 코드 대조 + 회귀 테스트 |
| 글자 크기 6단계(`FONT_SCALES` 1~6, 기본 4) | `storage.js` | `storage.js`(그대로) | 실측(6단계에서 `--scale: 1.417` 확인) |
| **Minimal mode(신규)** | 없음 | `settings-screen.js`(토글)+`timer-screen.js`(`minimal` 분기) | 실측 |

### 데이터 호환 — 실패하면 안 되는 부분

- IndexedDB `focus-timer-v1`(v1) / store `sessions`(keyPath `id`, index `endedAt`) — **완전히 그대로**, `storage.js`를 한 글자도 바꾸지 않고 그대로 옮김.
- localStorage 키 전부 동일: `focus-sessions-v1`(fallback), `focus-settings-v1`, `focus-active-v1`, `focus-last-subject`, `focus-last-backup`, `sync.token.v1`, `focus.syncEnabled`, `focus.lastSyncAt`, `focus.lastRemoteBackupAt`, `focus.pendingEvents`, `focus.syncContextId`, `focus.syncContextLabel`, `focus.journalEnabled.v1`, `focus.journalContent.v1`.
- 백업 JSON 형식 동일: `{app:'Focus', version:1, exportedAt, settings, sessions}`.
- Journal `session` kind의 payload(`journal-record.js`)는 파일 자체를 그대로 복사했습니다 — 필드 변경 없음.
- **재작성 전 안전망**: 이 재작성은 실제 사용자 데이터가 있는 기기의 백업을 이 세션에서 직접 만들 수 없습니다(에이전트가 사용자의 실제 브라우저에 접근할 수 없음). **사용자가 실기기에서 Settings → Save a backup file로 현재 기록을 먼저 내려받아 두어야 합니다.** 아래 Pending 목록 최상단에 있습니다.

### Minimal mode — 정한 것

- **켜고 끄는 방법**: Settings → Display 아래 "Minimal mode while a timer is running" 토글. 다른 설정과 같은 방식(`settings.minimalMode`, `focus-settings-v1`)으로 저장되어 **다음에 앱을 열어도 기억됩니다.**
- **적용 범위**: `timer.status !== 'idle'`(즉 실행 중 또는 일시정지 중) + 설정이 켜져 있을 때만 적용. Idle 상태에서는 켜 두어도 평소 화면 그대로 — 가릴 대상이 없기 때문입니다.
- **숨기는 것**: 모드 선택(Focus/Short/Long), 과목·작업 입력칸, 오늘 통계+7일 차트+최근 세션(StatsPanel 전체), Settings 진입 버튼(⚙).
- **남기는 것**: 원형 링+남은 시간, −/＋ 1분 조절, Pause/Resume, End and log.
- 다중 카운트다운 타이머는 계획대로 이번 범위에 넣지 않았습니다.

### 배포 방식 전환

- 지금까지는 Actions가 `npm run build`(Vite)로 `dist/`를 만들어 배포했습니다. 전환 후에는 `Published/focus/` **폴더 자체가 배포물**입니다 — loom·quill과 동일한 allowlist 방식으로 `.github/workflows/deploy.yml`을 다시 썼습니다(`npm test` → `npm run test:syntax` → allowlist만 Pages에 업로드).
- `.nojekyll` 포함. `node_modules`(설치한 적 없음)·`dist/`(삭제함)는 `.gitignore`와 배포 allowlist 양쪽에서 제외됩니다.
- 저장소 이름(`focus`)과 배포 주소(`https://jennie-verse.github.io/focus/`)는 바꾸지 않았습니다.
- `src/App.jsx`, `src/main.jsx`, `src/components/`, `src/styles.css`, `vite.config.js`, `eslint.config.js`, `package-lock.json`, `public/`, `INSTALL-GUIDE-KO.md`(옛 ZIP 배포 안내, docs/로 이미 대체됨)를 삭제했습니다. 전부 git 이력에 남아 있어 필요하면 이전 커밋에서 복구할 수 있습니다.

### 통과 — 자동 (Node, 빌드 도구 없이)

`npm test` **22/22 통과**, `npm run test:syntax` 통과. 새 테스트 파일 `tests/focus.test.mjs`가 옛 `tests/journal.test.mjs`(Vite 전용 assertion 포함)를 대체합니다.

- journal-record.js 5건 — 기존과 동일(파일을 그대로 복사했으므로 당연히 통과)
- model.js 신규 6건 — `createTimer`/`restoreTimer`/`nextModeAfter`/`adjustedMinutes`/`secondsFor`/`MODES`+`FONT_SCALES` 형태 고정
- stats.js 1건 — streak/오늘 통계/7일 버킷 그대로
- 정적 계약 9건 — 세션 종료→Journal 큐잉 순서, `@vite-ignore` 완전 제거, 동적 import가 `../../shared/...` 상대 경로인지, 빌드 도구 의존성 0개, `sw.js`/`version.js` 버전 일치, Minimal mode 설정 존재, localStorage/IndexedDB 키 불변, 백업 형식 불변

### 통과 — 실제 브라우저(2026-08-26, 이 세션에서 헤드리스 Chrome + DevTools Protocol로 실제 조작 재현)

`WebApp/Published/`를 정적 서버로 띄워 `/focus/`와 `/shared/`가 배포와 동일한 형제 경로가 되도록 재현하고, 실제 클릭·입력을 재현했습니다.

- [x] 최초 로드 — 헤더 "Focus", 링 "25:00"(기본 25분), 오늘 통계 0, 콘솔 오류 0건
- [x] Settings → Focus length를 24회 감소 → 1분에서 멈춤(하한 클램프 확인), 뒤로 가기
- [x] 과목 "영어", 작업 "단어 복습"(한글) 입력 → Start → 링이 "24:00"로 감소, 상태 "Focusing", **집중 모드 중에는 과목 입력칸이 잠기지 않음**(기존 동작과 동일: `locked && mode !== 'focus'`일 때만 잠김)
- [x] Pause → "Paused" → End and log → "Ready", 세션 1건 로그(과목 "영어" 그대로 한글 표시)
- [x] End and log(미완주)도 짧은 휴식으로 전환됨 — 기존 `nextMode` 로직과 동일(완주 여부와 무관하게 전환)
- [x] Settings에서 Focus length를 1분까지 낮춘 뒤 뒤로 가기 → 다시 Focus 모드로 전환 → 링 "01:00"
- [x] Minimal mode 토글 ON → **Idle 상태에서는 평소 화면 그대로**(모드 선택·통계·설정 버튼 전부 보임)
- [x] Start 누르자 **모드 선택·과목/작업칸·오늘 통계·7일차트·최근세션·설정 버튼이 전부 사라지고**, 원형 링과 Pause/End and log만 남음
- [x] **페이지 새로고침 후에도** 링 "01:00"(설정 유지), 세션 2건 로그, Minimal mode 토글 체크 상태 유지 — IndexedDB+localStorage 영속성 확인
- [x] **구버전(재작성 전) 형식의 백업 JSON을 실제로 가져오기** — `{app:'Focus', version:1, settings, sessions}` 모양의 픽스처(한글 과목 "옛날 백업 과목" 포함)를 `import-input`에 주입 → "Records imported. Confirm whether to overwrite settings." 토스트 → 설정 덮어쓰기 확인창 → 확인 → 세션이 2건에서 4건으로 병합(유실 없음), 한글 과목 정상 표시, 설정값(Focus length 30분)이 정확히 적용됨 — **재작성 전 백업이 재작성 후 버전에서 그대로 복원됨을 실측 확인**
- [x] Settings 7개 섹션(Durations/Display/Minimal mode/Alerts/Sync/Journal/Data) 전부 오류 없이 렌더링
- [x] Delete all records → 확인창 "Delete all records?" → Cancel → 기록 그대로 유지(삭제 안 됨)
- [x] 글자 크기를 6단계까지 올림 → `--scale` CSS 변수 `1.417`(FONT_SCALES 그대로)
- [x] 위 전체 시나리오에서 콘솔 오류·경고·미처리 예외 **0건**

### 검증하지 못한 것(이 환경의 한계)

- 알림음(Web Audio 실제 재생), 진동, 알림 권한 프롬프트, Wake Lock 실제 화면 유지 — 헤드리스 브라우저는 소리를 재생하지 않고 일부 기기 API가 없어 코드 경로 대조까지만 했습니다.
- GitHub 토큰을 넣은 실제 Sync/Journal 왕복(private E2E) — 사용자 credential이 필요합니다.
- Web Share(공유 시트)를 통한 백업 내보내기 — 헤드리스 환경에는 공유 대상 앱이 없어 다운로드 폴백 코드 경로만 확인했습니다.

## 배포와 실기기 확인 — 진행 중

**이 재작성은 아직 `main`에 병합·배포하지 않았습니다.** 계획서와 이번 작업 지시 모두 "재작성본이 실기기에서 검증되기 전에는 기존 배포를 내리지 않는다"를 요구했고, 에이전트는 iPhone/iPad 실기기에 접근할 수 없으므로 이 전환의 마지막 단계(실기기 확인 → main 병합 → 배포 전환)는 **사용자 확인이 필요한 지점**입니다.

- 코드는 `focus` 저장소의 `static-rewrite` 브랜치에 push되어 있고, 위의 모든 자동 검사와 헤드리스 브라우저 검사를 통과했습니다.
- `main`과 실제 배포 주소(`https://jennie-verse.github.io/focus/`)는 **기존 Vite/React 빌드 그대로**입니다. 이 문서의 내용을 근거로 먼저 위험을 판단할 수 있게 하기 위해서입니다.
- 실기기 확인 후 병합·배포를 진행해도 좋다고 알려주시면, `static-rewrite`를 `main`에 병합해 배포를 전환하고 이 문서를 최종본으로 갱신하겠습니다.
