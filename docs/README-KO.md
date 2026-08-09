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
