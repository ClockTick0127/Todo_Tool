# 로컬 API

기본 주소: `http://127.0.0.1:4310/api`. 로컬 개인 사용자만을 위한 API입니다. JSON 요청에 `Content-Type: application/json`을 지정하세요. 파일 업로드만 multipart입니다. 오류는 HTTP 400/413과 `{ "error": "메시지" }`, 없는 문서·경로는 404입니다. Host와 Origin 제한 위반은 403입니다.

| 메서드 / 경로 | 동작 / 입력 |
| --- | --- |
| GET /health | 저장소·AI 모델 설정 상태. 키 미포함 |
| GET /packs | 모든 초안과 배포 버전 |
| GET /packs/:recordId | 단일 버전 레코드 |
| POST /documents | multipart `file`(PDF), `title`, `mode`(`manual` 또는 `ai`) → 새 초안 |
| GET /documents/:documentId | 파일명·추출 페이지·PDF 존재 여부 |
| GET /documents/:documentId/pdf | 저장된 PDF 원본 |
| POST /packs/import | Scenario Pack JSON → 새 초안, 기존 ID가 있으면 다음 버전 |
| PUT /packs/:recordId | 초안 Pack JSON 저장. ID·버전 변경 및 배포 버전 편집 거절 |
| POST /packs/:recordId/publish | 구조와 원문 근거를 검사한 뒤 배포 |
| POST /packs/:recordId/revise | 해당 Pack을 복제하여 다음 버전 초안 생성 |
| GET /runs | 진행 목록, 실행 작업과 진행률 포함 |
| POST /runs | `{recordId,name,answers}` → 배포된 Pack으로 진행 생성 |
| GET /runs/:runId | 진행·작업별 상태 |
| PATCH /runs/:runId/tasks/:taskId | `{done?,note?,dueDate?}`. 개인 목표 날짜 해제는 `dueDate:null` |
| GET /runs/:runId/upgrade | 최신 새 배포 버전과 작업 차이. 새 버전 없으면 null |
| POST /runs/:runId/upgrade | `{recordId,answers?}` → 새 버전 적용, 진행 이전 |

`recordId`는 버전별 UUID, `pack.id`는 버전 간 동일한 가이드 ID입니다. Run에는 사용 중인 Pack 스냅샷, 답변, 작업 ID별 progress가 포함됩니다. 진행 완료는 선행 조건을 검증하고 서버 시각을 기록합니다. 브라우저는 API 결과를 받아 화면을 갱신합니다.

```powershell
Invoke-RestMethod http://127.0.0.1:4310/api/health
$packs = Invoke-RestMethod http://127.0.0.1:4310/api/packs
$body = @{ recordId=$packs[0].recordId; name='내 입학 준비'; answers=@{ housing='dorm'; international=$false; scholarship=$true } } | ConvertTo-Json -Depth 5
Invoke-RestMethod http://127.0.0.1:4310/api/runs -Method Post -ContentType application/json -Body $body
```

통합 예: 캘린더 앱에서 GET /runs의 `plan[].effectiveDueDate`를 일정으로 표시하거나, 외부 로컬 프로그램에서 PATCH로 완료·메모를 갱신할 수 있습니다. 캘린더 자동 동기화·알림 발송은 현재 구현하지 않았습니다.
