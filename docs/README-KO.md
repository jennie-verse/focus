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
- Settings → 화면에서 글자 크기 6단계 조절 (기본은 지금까지 쓰던 크기와 동일)
- 화면이 잠들지 않도록 지원되는 기기에서 Wake Lock 사용
- 기기 내부 자동 저장과 iCloud Drive용 JSON 백업·복원
- 베이비핑크 중심의 단일 라이트 테마, Lexend·Verdana, iPhone Safe Area
- Manifest, 버전 관리 서비스 워커, 오프라인 실행

## iCloud 저장 방식

iPhone Safari 웹앱은 사용자의 iCloud Drive를 데이터베이스처럼 자동으로 읽고 쓸 수 없습니다. Focus는 기록을 현재 기기의 IndexedDB에 자동 저장하고, **설정 → iCloud 백업 저장**에서 만든 JSON 파일을 공유 메뉴의 **파일에 저장**으로 iCloud Drive에 보관합니다. **백업 가져오기**로 다른 기기에서도 기록을 복원하거나 합칠 수 있습니다.

## 빌드 방식

Focus는 Vite/React로 만든 앱이라, 다른 정적 HTML 앱과 달리 **배포 전에 빌드 과정을 거칩니다**. GitHub Actions가 push 시 자동으로 `npm run build`를 실행해 Pages에 올립니다. 코드 수정 후 로컬에서 미리 확인하려면 아래 GITHUB-PAGES-KO.md를 참고하세요.

## 개인정보

과목, 작업 이름과 시간 기록은 자동으로 외부 서버에 전송되지 않습니다. 백업 JSON에는 이 기록이 포함되므로 Public Repository에 업로드하지 마세요.

---

## 동기화와 백업 (2026-08-09 추가)

focus는 비공개 저장소 `webapp-data`와 세 가지를 주고받습니다. **동기화는 기본으로 꺼져 있고**,
꺼진 상태에서도 앱은 완전히 동작합니다. 로컬 저장이 언제나 먼저입니다.

| 층 | 경로 | 내용 |
|---|---|---|
| A. 앱 데이터 | `focus/data.<기기>.json` | 설정 + 세션 전체. 기기 간 동기화 |
| B. 공용 이벤트 | `events/focus.<기기>.<YYYY-MM>.json` | 완료한 집중 세션. atlas·trace가 읽음 |
| C. 백업 | `backups/focus/YYYY-MM-DD.json` | 복원용 스냅샷. 최근 12개 유지 |

관련 코드는 전부 `src/sync.js`에 있습니다. 화면 코드(`App.jsx`)는 이 모듈의 함수만 부르고
GitHub API를 직접 다루지 않습니다.

### 다른 앱과 다른 점 — 빌드 앱입니다

focus는 React + Vite로 빌드해 GitHub Actions로 배포합니다. 공용 모듈이 다른 저장소에 있어
atlas·trace처럼 상대 경로로 부를 수 없습니다. 그래서 절대 주소로 가져오고,
`vite.config.js`의 `build.rollupOptions.external`로 번들에서 제외합니다.

```js
import * as Shared from 'https://jennie-verse.github.io/shared/v1/sync.js'
```

빌드 결과에 이 import가 그대로 남고, 진입 스크립트가 `type="module"`이라 브라우저가 직접 불러옵니다.
같은 오리진이므로 외부 CDN을 쓰는 것이 아닙니다. `public/sw.js`가 이 파일을 캐시하므로
오프라인에서도 앱이 뜹니다.

### 이벤트 파일 이름 주의

이름은 반드시 `<앱>.<기기>.<YYYY-MM>.json` 순서여야 atlas·trace 파서가 알아봅니다.
공용 모듈의 `contextFilePath()`는 **마지막 점 앞에** 기기 ID를 넣기 때문에
`focus.2026-08.<기기>.json`이 되어 버립니다. `src/sync.js`에서 경로를 직접 만드는 이유입니다.

### 충돌 처리

이벤트 파일은 읽기-수정-쓰기입니다. 오프라인 중 쌓인 변경은 오래된 `sha`로 재전송되므로
409/422가 정상적으로 납니다. 이때 파일을 다시 읽어 `id` 기준으로 합친 뒤 다시 씁니다(3회까지).
이 처리를 빼면 오프라인 복귀 후 첫 전송에서 그 사이 이벤트가 사라집니다.

보내지 못한 이벤트는 공용 outbox 대신 `focus.pendingEvents`(localStorage)에 모읍니다.
공용 outbox는 보낼 본문을 통째로 저장하는데, 이벤트 파일은 보낼 때마다 원격과 다시 합쳐야 해서
본문을 미리 굳히면 안 되기 때문입니다.
