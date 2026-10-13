import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePack,
  validateAnswers,
  buildPlan,
  invalidateFrom,
  diffPacks,
  migrateProgress,
} from "../src/index.js";

const pack = validatePack({
  schemaVersion: 1,
  id: "test-pack",
  version: 1,
  title: "테스트",
  questions: [{ id: "dorm", label: "기숙사?", type: "boolean" }],
  tasks: [
    { id: "third", title: "후속 작업", dependsOn: ["second"] },
    { id: "first", title: "첫 작업" },
    {
      id: "second",
      title: "조건 작업",
      dependsOn: ["first"],
      when: [{ questionId: "dorm", operator: "eq", value: true }],
    },
  ],
});
test("조건에 따라 작업을 제외하고 선행 순서로 정렬한다", () => {
  const plan = buildPlan(pack, { dorm: true });
  assert.deepEqual(
    plan.map((t) => t.id),
    ["first", "second", "third"],
  );
  assert.deepEqual(
    plan.map((t) => t.status),
    ["ready", "blocked", "blocked"],
  );
  assert.deepEqual(
    buildPlan(pack, { dorm: false }).map((t) => [t.id, t.status]),
    [
      ["third", "ready"],
      ["first", "ready"],
    ],
  );
});
test("선행 작업 완료 시 다음 작업만 열린다", () => {
  const plan = buildPlan(pack, { dorm: true }, { first: { done: true } });
  assert.equal(plan[1].status, "ready");
  assert.equal(plan[2].status, "blocked");
});
test("취소 시 모든 간접 후속 작업의 완료를 초기화한다", () => {
  const progress = invalidateFrom(pack, ["first"], {
    first: { done: true },
    second: { done: true, note: "메모" },
    third: { done: true },
  });
  assert.equal(progress.third.done, false);
  assert.equal(progress.second.note, "메모");
  assert.equal(progress.first.done, false);
});
test("순환, 중복, 없는 작업과 잘못된 조건을 거절한다", () => {
  assert.throws(
    () =>
      validatePack({
        ...pack,
        tasks: pack.tasks.map((t) =>
          t.id === "first" ? { ...t, dependsOn: ["third"] } : t,
        ),
      }),
    /순환/,
  );
  assert.throws(
    () => validatePack({ ...pack, tasks: [pack.tasks[0], pack.tasks[0]] }),
    /중복/,
  );
  assert.throws(
    () =>
      validatePack({
        ...pack,
        tasks: [{ ...pack.tasks[0], dependsOn: ["missing"] }],
      }),
    /없습니다/,
  );
  assert.throws(
    () =>
      validatePack({
        ...pack,
        tasks: [
          {
            ...pack.tasks[0],
            dependsOn: [],
            when: [{ questionId: "dorm", operator: "eq", value: "true" }],
          },
        ],
      }),
    /형식/,
  );
});
test("누락, 잘못된 형식과 유효하지 않은 선택지 답변을 거절한다", () => {
  assert.throws(() => validateAnswers(pack, {}));
  assert.throws(() => validateAnswers(pack, { dorm: "yes" }));
  const choice = validatePack({
    ...pack,
    questions: [
      {
        id: "dorm",
        label: "거주",
        type: "select",
        options: [{ label: "기숙사", value: "dorm" }],
      },
    ],
    tasks: [{ id: "one", title: "하나" }],
  });
  assert.throws(() => validateAnswers(choice, { dorm: "home" }));
  assert.deepEqual(validateAnswers(pack, { dorm: false, extra: "value" }), {
    dorm: false,
  });
});
test("버전 변경은 바뀐 작업과 후속 작업만 재확인하도록 한다", () => {
  const next = validatePack({
    ...pack,
    version: 2,
    tasks: pack.tasks.map((t) =>
      t.id === "second" ? { ...t, title: "새 작업명" } : t,
    ),
  });
  const diff = diffPacks(pack, next);
  assert.equal(diff.changed[0].id, "second");
  const migrated = migrateProgress(pack, next, {
    first: { done: true },
    second: { done: true },
    third: { done: true },
  });
  assert.equal(migrated.first.done, true);
  assert.equal(migrated.second.done, false);
  assert.equal(migrated.third.done, false);
});
test("새 의존성이 생긴 작업의 완료를 초기화한다", () => {
  const next = validatePack({
    ...pack,
    version: 2,
    tasks: [
      ...pack.tasks.map((t) =>
        t.id === "first" ? { ...t, dependsOn: ["new-step"] } : t,
      ),
      { id: "new-step", title: "새 선행 작업" },
    ],
  });
  assert.equal(
    migrateProgress(pack, next, {
      first: { done: true },
      second: { done: true },
      third: { done: true },
    }).third.done,
    false,
  );
});
test("조건 변경으로 새 선행 작업이 포함되면 완료한 후속 작업도 다시 확인한다", () => {
  const next = validatePack({ ...pack, version: 2 });
  const migrated = migrateProgress(
    pack,
    next,
    { first: { done: true }, third: { done: true } },
    { dorm: true },
  );
  assert.equal(migrated.first.done, true);
  assert.equal(migrated.third.done, false);
});
