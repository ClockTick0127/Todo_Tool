import { validatePack } from "@lifekit/core";
export const samplePack = validatePack({
  schemaVersion: 1,
  id: "freshman-onboarding",
  version: 1,
  title: "새로운 시작, 신입생 온보딩",
  description:
    "입학 준비부터 첫 수업까지. 내 상황에 꼭 필요한 단계를 하나씩 준비해 보세요.",
  category: "대학 생활",
  questions: [
    {
      id: "housing",
      label: "어디에서 생활할 예정인가요?",
      type: "select",
      options: [
        { label: "기숙사", value: "dorm" },
        { label: "자취", value: "rental" },
        { label: "본가에서 통학", value: "home" },
      ],
    },
    { id: "international", label: "외국인 신입생인가요?", type: "boolean" },
    {
      id: "scholarship",
      label: "장학금 신청을 계획하고 있나요?",
      type: "boolean",
    },
  ],
  tasks: [
    {
      id: "portal",
      title: "학교 포털 계정 만들기",
      section: "첫 준비",
      description:
        "학교에서 안내받은 학번으로 포털에 가입하고 연락처를 확인하세요. 예제 가이드이므로 실제 안내는 소속 학교에서 확인해야 합니다.",
      preparations: ["학번 또는 수험번호", "본인 명의 이메일"],
      sources: [
        {
          page: 1,
          quote: "신입생은 학교 포털 계정을 생성한 후 개인정보를 확인합니다.",
        },
      ],
    },
    {
      id: "tuition",
      title: "등록금 납부 확인하기",
      section: "첫 준비",
      description: "포털에서 등록금 납부 상태와 등록 완료 여부를 확인하세요.",
      dependsOn: ["portal"],
      preparations: ["등록금 납부 영수증"],
      sources: [
        { page: 1, quote: "포털의 등록 메뉴에서 납부 결과를 확인합니다." },
      ],
    },
    {
      id: "dorm",
      title: "기숙사 입사 신청하기",
      section: "생활 준비",
      description:
        "기숙사 신청 공지를 확인하고 신청서를 제출하세요. 배정 결과와 입사 준비물도 확인합니다.",
      dependsOn: ["portal"],
      when: [{ questionId: "housing", operator: "eq", value: "dorm" }],
      preparations: ["기숙사 신청서", "학교에서 요구하는 건강 확인 서류"],
      sources: [
        {
          page: 2,
          quote: "기숙사 거주 희망자는 포털에서 입사 신청서를 제출합니다.",
        },
      ],
    },
    {
      id: "rental",
      title: "자취방 입주 준비하기",
      section: "생활 준비",
      description:
        "계약서와 입주 일정을 확인하고 필요한 생활용품을 준비하세요.",
      when: [{ questionId: "housing", operator: "eq", value: "rental" }],
      preparations: ["입주 일정", "생활용품 목록"],
      sources: [
        {
          page: 2,
          quote: "교외 거주 학생은 수업 시작 전 입주 일정을 확인합니다.",
        },
      ],
    },
    {
      id: "international-office",
      title: "국제처 안내 확인하기",
      section: "생활 준비",
      description:
        "국제처의 신입생 안내를 읽고 담당자에게 필요한 서류와 제출 방법을 확인하세요.",
      dependsOn: ["portal"],
      when: [{ questionId: "international", operator: "eq", value: true }],
      sources: [
        { page: 2, quote: "외국인 신입생은 국제처의 별도 안내를 확인합니다." },
      ],
    },
    {
      id: "scholarship",
      title: "장학금 신청 서류 준비하기",
      section: "학업 준비",
      description:
        "신청하려는 장학금의 자격, 제출 서류, 마감일을 확인하고 신청하세요.",
      dependsOn: ["tuition"],
      when: [{ questionId: "scholarship", operator: "eq", value: true }],
      preparations: ["장학금별 신청서", "자격 확인 서류"],
      sources: [
        {
          page: 3,
          quote:
            "장학금 신청자는 등록 확인 후 장학금별 요구 서류를 제출합니다.",
        },
      ],
    },
    {
      id: "courses",
      title: "수강 신청 완료하기",
      section: "학업 준비",
      description:
        "학과의 권장 시간표를 참고하여 필수 교과목을 신청하고 최종 시간표를 저장하세요.",
      dependsOn: ["tuition"],
      preparations: ["학과 교육과정표"],
      sources: [
        {
          page: 3,
          quote:
            "등록을 마친 신입생은 학과 교육과정에 따라 수강 신청을 진행합니다.",
        },
      ],
    },
    {
      id: "orientation",
      title: "오리엔테이션 일정 확인하기",
      section: "캠퍼스 첫걸음",
      description:
        "학과 공지에서 장소와 일정을 확인하고 개인 일정에 기록하세요.",
      dependsOn: ["courses"],
      sources: [
        {
          page: 3,
          quote: "수강 신청 이후 학과 오리엔테이션 공지를 확인합니다.",
        },
      ],
    },
  ],
});
export const samplePages = [
  {
    page: 1,
    text: "[LifeKit 예제 문서 — 실제 대학 안내 아님]\n신입생은 학교 포털 계정을 생성한 후 개인정보를 확인합니다.\n포털의 등록 메뉴에서 납부 결과를 확인합니다.",
  },
  {
    page: 2,
    text: "기숙사 거주 희망자는 포털에서 입사 신청서를 제출합니다.\n교외 거주 학생은 수업 시작 전 입주 일정을 확인합니다.\n외국인 신입생은 국제처의 별도 안내를 확인합니다.",
  },
  {
    page: 3,
    text: "장학금 신청자는 등록 확인 후 장학금별 요구 서류를 제출합니다.\n등록을 마친 신입생은 학과 교육과정에 따라 수강 신청을 진행합니다.\n수강 신청 이후 학과 오리엔테이션 공지를 확인합니다.",
  },
];
