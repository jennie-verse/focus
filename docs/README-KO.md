# Focus

집중 시간과 휴식을 기록하는 iPhone/iPad용 오프라인 포커스 타이머 PWA입니다.

## 주요 기능

- 집중·짧은 휴식·긴 휴식 타이머와 분 단위 조절
- 시작, 일시정지, 계속하기, 종료 및 실제 사용 시간 저장
- 과목과 작업 이름 기록
- 오늘 집중 시간, 완료 세션, 연속 기록 일수
- 최근 7일 차트와 일별 기록, 최근 세션 목록
- 집중·휴식 기본 시간과 긴 휴식 주기 설정
- 완료 알림음, 진동, 자동 다음 세션
- **Minimal mode** — 타이머가 도는 동안 통계·설정·차트·최근 세션을 감추고 남은 시간과 정지 버튼만 남김(2026-08-26 추가)
- Settings → 화면에서 글자 크기 6단계 조절 (기본은 지금까지 쓰던 크기와 동일)
- 화면이 잠들지 않도록 지원되는 기기에서 Wake Lock 사용
- 기기 내부 자동 저장과 iCloud Drive용 JSON 백업·복원
- 베이비핑크 중심의 단일 라이트 테마, Lexend·Verdana, iPhone Safe Area
- Manifest, 버전 관리 서비스 워커, 오프라인 실행

## iCloud 저장 방식

iPhone Safari 웹앱은 사용자의 iCloud Drive를 데이터베이스처럼 자동으로 읽고 쓸 수 없습니다. Focus는 기록을 현재 기기의 IndexedDB에 자동 저장하고, **설정 → Save a backup file**에서 만든 JSON 파일을 공유 메뉴의 **파일에 저장**으로 iCloud Drive에 보관합니다. **Import a backup**으로 다른 기기에서도 기록을 복원하거나 합칠 수 있습니다.

## 파일 구조 (2026-08-26 정적 재작성 이후)

빌드 도구 없이 그대로 GitHub Pages에 배포되는 정적 ES module 구조입니다. quill과 같은 이유(공식 지시문 "빌드 도구 없이 배포 가능한 정적 앱", "Published는 배포된 실물과 같아야 한다")로 이전의 React/Vite 구현을 대체했습니다. 기능은 전부 그대로 옮겼고, Minimal mode만 새로 추가했습니다.

```text
focus/
├─ index.html                  앱 셸
├─ manifest.webmanifest
├─ sw.js                       Service Worker — 오프라인 캐시
├─ assets/
│  ├─ app.css                  기존 styles.css 그대로(폰트 경로만 수정)
│  └─ fonts/                   Lexend 400·700
├─ src/
│  ├─ version.js                APP_BUILD — sw.js의 VERSION과 반드시 같아야 함
│  ├─ model.js                  타이머 순수 로직 (기존 App.jsx에서 분리)
│  ├─ storage.js                IndexedDB·localStorage — 키 이름 전부 그대로
│  ├─ stats.js                  스트릭·오늘 통계·7일 차트 — 그대로
│  ├─ sync.js                   webapp-data 동기화 — 그대로(동적 import 방식만 단순화)
│  ├─ journal.js, journal-record.js  Daybook Journal — 그대로
│  ├─ ui.js                     토스트·확인창
│  ├─ icons.js                  기존 Icons.jsx의 SVG를 그대로 옮김
│  ├─ timer-screen.js           타이머+통계 화면 (기존 TimerScreen.jsx+StatsPanel.jsx)
│  ├─ settings-screen.js        설정 화면 (기존 SettingsScreen.jsx) + Minimal mode 토글
│  └─ app.js                    화면 전체를 연결하는 진입점 (기존 App.jsx+main.jsx)
├─ icons/, licenses/, docs/
└─ tests/focus.test.mjs
```

`import.meta.env`, JSX, 번들러가 전부 사라졌습니다. `<script type="module" src="./src/app.js">` 하나만 불러오고 나머지는 `import`로 연결됩니다.

## 개인정보

과목, 작업 이름과 시간 기록은 자동으로 외부 서버에 전송되지 않습니다. 백업 JSON에는 이 기록이 포함되므로 Public Repository에 업로드하지 마세요.

---

## 동기화와 백업 (2026-08-09 추가, 2026-08-26 정적 재작성에서도 동일)

focus는 비공개 저장소 `webapp-data`와 세 가지를 주고받습니다. **동기화는 기본으로 꺼져 있고**,
꺼진 상태에서도 앱은 완전히 동작합니다. 로컬 저장이 언제나 먼저입니다.

| 층 | 경로 | 내용 |
|---|---|---|
| A. 앱 데이터 | `focus/data.<기기>.json` | 설정 + 세션 전체. 기기 간 동기화 |
| B. 호환 이벤트 | `events/focus.<기기>.<YYYY-MM>.json` | 1분 이상 집중 세션. 보관된 Atlas·Trace 형식과의 호환용이며 현재 활성 소비 앱은 없음 |
| C. 백업 | `backups/focus/YYYY-MM-DD.json` | 복원용 스냅샷. 최근 12개 유지 |

관련 코드는 전부 `src/sync.js`에 있습니다. 화면 코드(`app.js`)는 이 모듈의 함수만 부르고
GitHub API를 직접 다루지 않습니다.

### 공용 모듈을 부르는 방법 — 이제 다른 정적 앱들과 동일

이전 React/Vite 버전은 번들링 때문에 `new URL('../shared/v1/sync.js', location.href)`로 절대 주소를
계산해 `vite.config.js`의 `external`로 번들에서 제외해야 했습니다. 정적 앱이 된 지금은
loom·quill·today와 똑같이 **상대 경로 동적 `import()`** 하나면 됩니다.

```js
const Shared = await import('../../shared/v1/sync.js')
```

같은 오리진의 형제 저장소이므로 외부 CDN이 아닙니다. `sw.js`가 이 파일을 선택적으로 캐시하므로
오프라인에서도 앱이 뜹니다.

### 이벤트 파일 이름 주의

이름은 보관된 Atlas·Trace 형식과의 호환을 위해 `<앱>.<기기>.<YYYY-MM>.json` 순서를 유지합니다.
공용 모듈의 `contextFilePath()`는 **마지막 점 앞에** 기기 ID를 넣기 때문에
`focus.2026-08.<기기>.json`이 되어 버립니다. `src/sync.js`에서 경로를 직접 만드는 이유입니다.

### 충돌 처리

이벤트 파일은 읽기-수정-쓰기입니다. 오프라인 중 쌓인 변경은 오래된 `sha`로 재전송되므로
409/422가 정상적으로 납니다. 이때 파일을 다시 읽어 `id` 기준으로 합친 뒤 다시 씁니다(3회까지).
이 처리를 빼면 오프라인 복귀 후 첫 전송에서 그 사이 이벤트가 사라집니다.

보내지 못한 이벤트는 공용 outbox 대신 `focus.pendingEvents`(localStorage)에 모읍니다.

### 이벤트에 넣는 세션 기준

`sessionToEvent()` 한 곳에서 정합니다.

| 조건 | 결과 |
|---|---|
| `mode !== 'focus'` | 제외 (휴식은 남기지 않음) |
| `elapsedSeconds < 60` | 제외 (실수로 눌렀다 끈 경우) |
| 완주 (`completed: true`) | `kind: session.completed` / `Finished a N-min focus session` |
| 중간 종료 | `kind: session.ended` / `Focused for N min` |

**중간 종료를 넣는 이유** — focus 앱 자신이 그 시간을 실제 집중 시간으로 셉니다
(`getTodayStats`의 합계와 `getStreak`에 들어갑니다). 완주만 올리면 20분씩 세 번 집중하고
매번 일찍 끝낸 날이 Trace에서 빈 날로 보입니다.

`detail`은 넣지 않습니다. 과목과 작업 이름은 개인적인 내용일 수 있어 공용 층으로 내보내지 않습니다.

### 컨텍스트 ID는 만들 때 정해집니다

파일 이름에 들어가므로 이후 바뀌지 않습니다. 그래서 **동기화를 켜기 전에** 받은 이름을
`ensureContext(name)`으로 넘겨 ID에 반영합니다.

공용 모듈은 이름에서 영문 소문자와 숫자만 남깁니다. 한글만 적으면 `context-…`가 됩니다.
사용자에게 보이는 이름(label)에는 한글이 그대로 남습니다.
