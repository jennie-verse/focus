# Focus — GitHub Pages 재배포 안내

Focus는 이미 배포되어 있습니다. 이 문서는 **코드를 고친 뒤 다시 배포하는 방법**을 설명합니다. focus는 Vite/React 빌드 앱이라 다른 정적 HTML 앱과 순서가 다릅니다.

## 배포 방식

GitHub Actions가 `main` 브랜치 push를 감지해 자동으로 `npm run build`를 실행하고 결과물(`dist/`)을 Pages에 올립니다. `dist/`는 저장소에 커밋하지 않습니다(`.gitignore` 처리됨) — 매번 Actions가 새로 빌드합니다.

GitHub 저장소 → **Settings → Pages → Source**가 **GitHub Actions**로 되어 있는지 확인하세요.

## 로컬에서 미리 확인하기

1. `Published/focus/` 폴더에서 의존성을 설치합니다.

   ```sh
   cd Published/focus
   npm install
   ```

2. 코드를 수정합니다 (`src/` 안의 `.jsx`, `.css` 등).
3. 빌드가 되는지, 콘솔에 오류가 없는지 확인합니다.

   ```sh
   npm run build
   ```

4. `public/sw.js`의 `VERSION` 값을 **반드시** 올립니다. 올리지 않으면 기기에 저장된 이전 캐시가 계속 보일 수 있습니다.
5. 확인이 끝나면 `node_modules/`와 `dist/`는 지워도 됩니다 (재빌드 시 자동으로 다시 생성되며, 둘 다 Git에는 포함되지 않습니다).

## 재배포 순서

```sh
cd Published/focus
git add -A
git commit -m "설명"
git push
```

GitHub 저장소의 **Actions** 탭에서 빌드·배포 워크플로가 성공했는지 확인한 뒤, 실제 배포 주소를 열어 반영을 확인합니다.

## 홈 화면 앱 업데이트 반영

이미 홈 화면에 추가해 쓰고 계신 경우, 새 배포는 다음에 앱을 열 때 백그라운드에서 자동으로 받아옵니다. 즉시 반영하고 싶으면 앱을 완전히 종료(위로 스와이프)했다가 다시 여세요.
