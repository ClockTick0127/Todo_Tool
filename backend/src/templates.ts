import { validatePack } from "@lifekit/core";

// These guides can run without an uploaded document or an AI provider.
export const scenarioTemplates = [
  validatePack({
    schemaVersion: 1,
    id: "development-server",
    version: 1,
    title: "개발 서버 실행 순서",
    category: "개발·업무",
    executionMode: "ordered",
    description:
      "프로젝트 폴더부터 서버 접속 확인까지 순서대로 따라가세요. 명령 예시는 LifeKit 소스 기준이며, 직접 복사해서 본인 프로젝트의 명령과 주소로 수정할 수 있습니다.",
    questions: [
      {
        id: "database",
        label: "별도로 켜야 하는 DB·캐시 서비스가 있나요?",
        type: "boolean",
      },
    ],
    tasks: [
      {
        id: "workspace",
        title: "프로젝트 폴더에서 터미널 열기",
        section: "준비",
        description:
          "실행할 프로젝트의 루트 폴더에서 터미널을 여세요. package.json과 README가 있는 경로인지 확인합니다.",
      },
      {
        id: "environment",
        title: "환경 설정 확인하기",
        section: "준비",
        dependsOn: ["workspace"],
        description:
          "프로젝트에서 요구하는 .env 파일, 모델 설정, DB 주소 등을 확인하세요. 비밀 키는 이 체크리스트의 메모에 기록하지 말고 환경 설정 파일에 보관하세요.",
      },
      {
        id: "dependencies",
        title: "패키지와 공통 모듈 준비하기",
        section: "준비",
        dependsOn: ["environment"],
        description:
          "프로젝트에 맞는 의존성 설치·빌드 명령을 실행하세요.\nLifeKit 예시:\nnpm install\nnpm run build -w packages/core\n매 실행마다 다시 설치할 필요는 없으며, 준비 상태를 확인한 뒤 완료하세요.",
      },
      {
        id: "database",
        title: "DB·캐시 서비스 실행 확인하기",
        section: "서버 실행",
        dependsOn: ["dependencies"],
        when: [{ questionId: "database", operator: "eq", value: true }],
        description:
          "이 프로젝트에서 사용하는 DB·캐시를 시작하고 연결 상태를 확인하세요. 실제 실행 명령은 가이드 편집 화면에 기록하세요. LifeKit 자체는 별도 DB 서버가 필요 없습니다.",
      },
      {
        id: "backend",
        title: "백엔드 서버 켜기",
        section: "서버 실행",
        dependsOn: ["dependencies", "database"],
        description:
          "백엔드 실행 명령을 입력하고 준비 완료 메시지를 확인하세요.\nLifeKit 예시: npm run dev -w backend\n서버가 실행 중인 터미널을 유지하세요.",
      },
      {
        id: "frontend",
        title: "프론트엔드 서버 켜기",
        section: "서버 실행",
        dependsOn: ["backend"],
        description:
          "새 터미널에서 프론트엔드 실행 명령을 입력하세요.\nLifeKit 예시: npm run dev -w frontend\n백엔드 터미널도 계속 열어 두세요.",
      },
      {
        id: "verify",
        title: "앱에 접속해 정상 동작 확인하기",
        section: "접속 확인",
        dependsOn: ["frontend"],
        description:
          "실행 로그에 표시된 주소로 접속하고 데이터를 불러오는지 확인하세요.\nLifeKit 개발 화면 예시: http://127.0.0.1:5173\n문제가 있으면 각 서버의 로그를 확인하고 이 가이드에 메모하세요.",
      },
    ],
  }),
  validatePack({
    schemaVersion: 1,
    id: "job-application-documents",
    version: 1,
    title: "이력서·지원 서류 제출",
    category: "취업·지원",
    executionMode: "checklist",
    description:
      "지원 건마다 새 체크리스트를 시작하고 필요한 서류의 제출 여부를 기록하세요. 실제 제출 서류와 마감일은 지원 공고에 맞춰 수정해야 합니다.",
    questions: [
      {
        id: "cover-letter",
        label: "자기소개서가 필요한 지원인가요?",
        type: "boolean",
      },
      {
        id: "portfolio",
        label: "포트폴리오 제출이 필요한가요?",
        type: "boolean",
      },
      {
        id: "certificates",
        label: "증명서·자격증 사본을 요구하나요?",
        type: "boolean",
      },
    ],
    tasks: [
      {
        id: "resume",
        title: "이력서 제출하기",
        completionLabel: "제출",
        section: "지원 서류",
        description:
          "지원 직무에 맞게 이력서를 작성하고 요구 형식으로 제출하세요. 제출처와 최종 파일명은 메모에 남길 수 있습니다.",
        preparations: ["최종 이력서 파일", "지원 공고의 제출 형식 확인"],
      },
      {
        id: "cover-letter",
        title: "자기소개서 제출하기",
        completionLabel: "제출",
        section: "지원 서류",
        when: [{ questionId: "cover-letter", operator: "eq", value: true }],
        description:
          "공고의 질문과 글자 수 조건을 확인하고 자기소개서를 제출하세요.",
      },
      {
        id: "portfolio",
        title: "포트폴리오 제출하기",
        completionLabel: "제출",
        section: "지원 서류",
        when: [{ questionId: "portfolio", operator: "eq", value: true }],
        description:
          "요구된 파일이나 링크를 제출하고, 링크를 제출한 경우 접근 권한이 열려 있는지 확인하세요.",
      },
      {
        id: "certificates",
        title: "요구된 증명서·자격증 사본 제출하기",
        completionLabel: "제출",
        section: "지원 서류",
        when: [{ questionId: "certificates", operator: "eq", value: true }],
        description:
          "공고에서 요구하는 서류만 준비해 제출하세요. 문서 자체와 민감한 정보는 이 체크리스트의 메모에 저장하지 않아도 됩니다.",
      },
      {
        id: "receipt",
        title: "최종 접수 결과 확인하기",
        section: "제출 확인",
        description:
          "필요한 서류를 모두 제출한 뒤 접수 화면이나 확인 메일을 확인하세요. 접수번호·확인 일시 등을 메모에 기록할 수 있습니다.",
      },
    ],
  }),
];
