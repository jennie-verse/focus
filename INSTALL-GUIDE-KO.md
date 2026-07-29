# Focus 설치 및 iCloud 백업 안내

## 1. 완성 파일 찾기

최종 ZIP은 다음 위치에 있습니다.

Finder에서 `문서 → ChatGPT → WebApp → deliverables → focus-timer-final.zip`을 찾습니다.

파일이 보이지 않으면 Finder 검색창에 `focus-timer-final.zip`을 입력해 찾으세요.

## 2. GitHub Public Repository 만들기

1. GitHub에서 **New repository**를 누릅니다.
2. 이름을 `focus`로 입력합니다.
3. **Public**을 선택합니다.
4. README 등의 추가 옵션은 선택하지 않고 저장소를 만듭니다.

## 3. 파일 업로드

1. ZIP을 더블 클릭해 압축을 풉니다.
2. 압축을 푼 `focus-timer` 폴더를 엽니다.
3. `Command + Shift + .`으로 숨김 파일을 표시합니다.
4. 폴더 자체가 아니라 폴더 안의 내용 전체를 GitHub 업로드 화면에 끌어 놓습니다.
5. 최상위에 `index.html`, `package.json`, `src`, `public`, `.github`가 있는지 확인하고 Commit합니다.

`node_modules`, `dist`, `.git`, 백업 JSON 파일은 올리지 마세요.

## 4. GitHub Pages 켜기

1. 저장소의 **Settings → Pages**로 이동합니다.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. **Actions** 탭에서 `Deploy Focus to GitHub Pages`가 초록색으로 완료될 때까지 기다립니다.
4. Pages 주소는 보통 `https://사용자이름.github.io/focus/` 형식입니다.

## 5. iPhone/iPad 홈 화면에 설치

1. Safari에서 Pages 주소를 엽니다.
2. 화면이 완전히 열린 뒤 몇 초 기다립니다.
3. **공유 → 홈 화면에 추가**를 선택합니다.
4. **웹 앱으로 열기**가 보이면 켭니다.
5. 이름이 `Focus`인지 확인하고 **추가**를 누릅니다.

## 6. 첫 사용 확인

1. 집중 시간을 `1분`으로 바꿔 짧게 시험합니다.
2. 과목과 작업 이름을 입력합니다.
3. **시작 → 일시정지 → 계속하기 → 종료 및 기록**을 확인합니다.
4. 오늘 통계와 최근 세션에 기록이 추가되는지 확인합니다.
5. 비행기 모드에서 앱을 다시 열어 기본 화면이 표시되는지 확인합니다.

## 7. iCloud Drive 백업

1. 앱의 톱니바퀴를 눌러 **설정**을 엽니다.
2. **iCloud 백업 저장**을 누릅니다.
3. iPhone 공유 메뉴에서 **파일에 저장**을 선택합니다.
4. 위치를 **iCloud Drive**로 선택하고 저장합니다.

Focus는 평소 기록을 현재 기기에 자동 저장합니다. iCloud Drive에는 사용자가 위 단계를 실행할 때 백업 JSON이 저장됩니다.

## 8. 백업 복원

1. **설정 → 백업 가져오기**를 누릅니다.
2. iCloud Drive에서 `focus-backup-날짜.json` 파일을 선택합니다.
3. 백업 기록은 현재 기록과 ID를 기준으로 안전하게 합쳐집니다.

## 9. 업데이트

새 ZIP의 내용 전체를 GitHub 저장소에 다시 업로드하고 Commit합니다. Actions가 끝난 뒤 Safari에서 Pages 주소를 새로고침하고 홈 화면 앱을 완전히 닫았다가 다시 여세요. 서비스 워커가 이전 캐시를 정리하고 새 버전을 적용합니다.

## 주의

- iOS가 브라우저 저장공간을 정리하거나 사용자가 웹사이트 데이터를 지우면 로컬 기록이 사라질 수 있습니다.
- 중요한 기록은 정기적으로 iCloud 백업을 만드세요.
- 백업 JSON에는 과목과 작업 이름이 포함되므로 Public Repository에 올리지 마세요.
