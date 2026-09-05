# Focus — GitHub Pages 배포 안내

2026-08-26부터 focus는 빌드 도구 없는 정적 앱입니다(quill과 같은 이유의 재작성). 이전 Vite/React 버전과 달리 **`Published/focus/` 폴더 자체가 배포되는 실물**입니다.

1. authoritative source인 `WebApp/Published/focus/`에서 수정·테스트·commit·push합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 둡니다.
3. `.github/workflows/deploy.yml`이 `npm test`와 `npm run test:syntax`를 통과한 뒤 runtime allowlist만 Pages에 올립니다. 빌드 단계가 없습니다.
4. workflow가 성공하면 `https://jennie-verse.github.io/focus/`를 열어 화면과 Service Worker version을 확인합니다.

배포 allowlist에는 `.nojekyll`, `README.md`, `index.html`, manifest, `sw.js`, `assets/`, `docs/`, `icons/`, `licenses/`, `src/`만 포함합니다. `tests/`, `package.json`, `.github/`, `node_modules/`는 배포하지 않습니다.

모든 코드 경로가 `./` 상대 경로이므로 `/focus/` 하위 경로에서 그대로 동작합니다. `../shared/v1/`, `../shared/v2/`도 상대 경로로 참조합니다 — GitHub Pages 사용자 사이트는 모든 저장소가 같은 오리진의 다른 경로이므로 이 참조가 성립합니다.

## 로컬에서 미리 확인하기

빌드 도구가 없으므로 `npm install`이 필요 없습니다.

```sh
cd Published/focus
npm test          # Node 회귀 검사
npm run test:syntax
python3 -m http.server 8080   # WebApp/Published/ 에서 실행 — shared/도 같이 접근 가능하게
```

브라우저에서 `http://localhost:8080/focus/`를 엽니다.

## 업데이트할 때

1. 수정한 파일을 commit해 `main`에 push합니다.
2. `sw.js`를 고쳤다면 맨 위 `VERSION`을 반드시 올리고, `src/version.js`의 `APP_BUILD`도 같은 값으로 맞춥니다.
3. `CORE_ASSETS` 목록에 새 파일을 추가했거나 파일 이름을 바꿨다면 목록도 함께 고칩니다.
4. Actions의 test와 Pages deployment가 모두 성공했는지 확인합니다.

## 정적 재작성 전환 기록 (2026-08-26)

- 저장소 이름(`focus`)과 배포 주소(`https://jennie-verse.github.io/focus/`)는 바꾸지 않았습니다.
- 기존 `localStorage`/`IndexedDB` 키, 백업 JSON 형식, Journal `session` kind payload를 전부 그대로 유지했습니다 — 재작성 전 백업 JSON이 재작성 후에도 그대로 복원됩니다.
- **재작성본이 실기기에서 확인되기 전에는 기존 배포(Vite 빌드본)를 그대로 두었습니다.** 이 전환은 `main`에 병합해 실제로 배포하기 전, 별도 브랜치에서 완성하고 자동 테스트와 헤드리스 브라우저로 먼저 검증했습니다.
- Service Worker 캐시 이름이 `focus-<VERSION>`으로 바뀌므로, 배포 직후 기존에 설치된 홈 화면 앱은 다음에 열 때 새 캐시로 자동 전환됩니다(활성화 시 이전 `focus-` 접두 캐시를 전부 정리).
