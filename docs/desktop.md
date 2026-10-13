# Windows 데스크톱 구조

React 프론트와 Express 백엔드는 기존 폴더에 그대로 둡니다. Electron의 main 프로세스는 `backend/src/runtime.ts`를 번들한 모듈을 호출해 SQLite와 루프백 API를 시작하고, 그 주소를 격리된 앱 창에 표시합니다. 사용자에게 터미널이나 포트 설정을 요구하지 않습니다.

```text
LifeKit.exe (Electron / 자체 Node 런타임)
  ├─ desktop/main.mjs: 앱 창, 단일 실행, 메뉴, 종료 처리
  ├─ desktop-dist/backend.mjs: Express + Core + 저장 로직 번들
  ├─ node_modules/pdfjs-dist: PDF 분석과 worker
  └─ frontend/dist: React 화면과 정적 리소스

%APPDATA%/LifeKit/
  ├─ .env: AI 제공자 설정
  └─ data/lifekit.sqlite: 문서·가이드·진행 기록
```

루프백 서버는 포트 0으로 실행해 비어 있는 포트를 할당받습니다. API의 Origin 검사는 실제 서버 포트를 사용합니다. 앱 창은 Node integration을 사용하지 않고 context isolation·sandbox·webSecurity를 활성화합니다. 불필요한 권한 요청과 외부 페이지 이동은 허용하지 않습니다. 별도의 IPC 파일 접근 API는 노출하지 않습니다. 연결된 원본 PDF는 격리된 별도 문서 창에서 엽니다.

사용자 설정 파일은 설치 리소스의 예제를 첫 실행 때만 복사합니다. 다음 실행부터는 기존 파일을 보존합니다. 종료 시 HTTP 연결과 SQLite를 닫아 기록을 유지합니다. 백업은 종료 후 전체 data 폴더를 복사하는 방식입니다.

`electron-builder.json`은 사용자 계정 설치형 NSIS와 설치 없는 portable 타깃을 정의합니다. N-API 기반 PDF 보조 라이브러리는 런타임 의존성으로 포함하며 `.node` 파일은 패키저가 asar 밖에 배치합니다. 빌드 결과와 테스트 데이터는 Git에서 제외합니다.
