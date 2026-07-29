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
- 화면이 잠들지 않도록 지원되는 기기에서 Wake Lock 사용
- 기기 내부 자동 저장과 iCloud Drive용 JSON 백업·복원
- 베이비핑크 중심의 단일 라이트 테마, Lexend·Verdana, iPhone Safe Area
- Manifest, 버전 관리 서비스 워커, 오프라인 실행

## iCloud 저장 방식

iPhone Safari 웹앱은 사용자의 iCloud Drive를 데이터베이스처럼 자동으로 읽고 쓸 수 없습니다. Focus는 기록을 현재 기기의 IndexedDB에 자동 저장하고, **설정 → iCloud 백업 저장**에서 만든 JSON 파일을 공유 메뉴의 **파일에 저장**으로 iCloud Drive에 보관합니다. **백업 가져오기**로 다른 기기에서도 기록을 복원하거나 합칠 수 있습니다.

## GitHub Pages 배포

1. 이 폴더의 내용을 GitHub Public Repository 최상위에 올립니다.
2. **Settings → Pages → Source**를 **GitHub Actions**로 선택합니다.
3. `main` 브랜치에 올리면 자동으로 빌드·배포됩니다.

로컬 검사는 `npm install`, `npm run lint`, `npm run build`로 실행할 수 있습니다.

## 개인정보

과목, 작업 이름과 시간 기록은 자동으로 외부 서버에 전송되지 않습니다. 백업 JSON에는 이 기록이 포함되므로 Public Repository에 업로드하지 마세요.
