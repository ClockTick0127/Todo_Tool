# Scenario Pack v1

JSON으로 정의하고 Core의 `validatePack`을 통과해야 합니다. JSON Schema는 구조를 검사하며 ID 참조·순환·선택지 조건 검사는 Core가 추가 수행합니다. 제목이나 설명만 바꾸려면 ID를 유지하세요. 엔진이 기본값을 채운 뒤 비교하므로 누락된 배열은 빈 배열로 정규화됩니다.

```json
{
  "schemaVersion": 1,
  "id": "moving-guide",
  "version": 1,
  "title": "이사 준비",
  "category": "생활",
  "description": "나의 입주 체크리스트",
  "questions": [{
    "id": "housing", "label": "거주 형태", "type": "select",
    "options": [{"label":"자취", "value":"rental"}, {"label":"본가", "value":"home"}]
  }],
  "tasks": [{
    "id": "confirm-date", "title": "입주 일정 확인", "section": "입주 준비",
    "description": "담당자에게 입주 가능한 날짜를 확인하세요.",
    "preparations": ["담당자 연락처"],
    "dependsOn": [],
    "when": [{"questionId":"housing", "operator":"eq", "value":"rental"}],
    "sources": [{"page":1, "quote":"입주자는 사전에 입주 일정을 확인합니다."}]
  }]
}
```

| 필드 | 규칙 |
| --- | --- |
| schemaVersion | `1` 고정 |
| id | 영문 소문자로 시작, 소문자·숫자·하이픈·밑줄, 최대 80자. 예약 ID 금지 |
| version | 양의 정수. 서버에서 새 버전을 만들면 자동 증가 |
| title / description / category | 제목 필수. 설명과 카테고리는 선택 |
| questions | 최대 50개. ID 중복 금지. 모든 질문은 시작 전에 답변 필요 |
| tasks | 1~200개. 작업 ID 중복 금지 |
| question.type | `select`, `boolean`, `text` |
| question.options | select에서 최소 1개, 값 중복 금지 |
| task.dependsOn | 작업 ID 배열. 없는 작업, 자기 참조, 순환 관계 금지 |
| task.when | AND 조건 배열. 빈 배열이면 모든 사용자 포함 |
| rule.operator | `eq` 또는 `ne`, 문자열/불리언 값을 정확하게 비교 |
| task.preparations | 준비물 문자열 배열 |
| task.dueDate | 선택. 실제 유효한 `YYYY-MM-DD` 날짜 |
| task.sources | 원문 페이지 양의 정수 + 정확한 인용문. 문서 연결 시 배포에 필수 |

## 실행 의미

1. 사용자 답변을 검증합니다. boolean 질문은 실제 boolean 값이며 select는 지정된 선택지 값이어야 합니다.
2. `when`을 모두 만족하는 작업만 포함합니다. 조건에서 제외된 선행 작업은 만족된 것으로 간주합니다. 반드시 필수인 선행 작업은 조건을 걸지 않거나 후속 작업에도 같은 조건을 걸어 주세요.
3. 포함된 의존성에 대해 위상 순서로 정렬합니다. 독립 작업의 상대 순서는 Pack 배열과 깊이 우선 방문 순서에 따릅니다.
4. 상태는 `ready`(진행 가능), `blocked`(선행 작업 미완료), `done`입니다. API가 완료 전 선행 조건을 검사합니다.
5. 완료 취소 시 직접·간접 후속 작업의 완료를 초기화합니다. 메모·개인 날짜는 유지합니다.

## 버전 이전

실행은 시작한 Pack의 스냅샷을 저장합니다. 새 배포가 기존 진행을 자동 수정하지 않습니다. 사용자 적용 시 같은 ID의 작업을 비교합니다. 변경된 작업과 새 버전의 후속 작업은 완료를 초기화합니다. 삭제된 작업은 진행에서 제거합니다. 추가 작업은 미완료로 시작합니다. 기존 작업과 같은 ID를 유지해야 변경으로 인식됩니다. 조건 질문이 변경되면 새 질문 세트에 대한 유효한 답변이 필요합니다.

문서 기반 Pack은 인용문이 해당 페이지의 추출 텍스트에 포함되는지 공백을 정규화하여 검사합니다. 이 검사는 인용의 존재만 보장하며 AI의 의미 해석 정확성까지 보장하지는 않습니다. JSON으로 독립 가져온 Pack은 원문 문서가 없을 수 있고, 이 경우 구조 검증만 수행합니다.
