# Focus — 테스트 결과 (2026-08-08, 글자 크기 6단계 + docs 추가 + 폰트 404 수정)

## 이번 변경

- webapp-standard.md 기준 미달 2건 보완: 글자 크기 6단계 조절, `docs/` 4종 문서
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
