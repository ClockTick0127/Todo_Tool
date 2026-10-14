import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,79}$/)
  .refine(
    (v) => !["constructor", "prototype", "__proto__"].includes(v),
    "예약된 ID입니다.",
  );
const scalar = z.union([z.string().max(2000), z.boolean()]);
export const QuestionSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  type: z.enum(["select", "boolean", "text"]),
  options: z
    .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
    .max(40)
    .default([]),
});
export const TaskSchema = z.object({
  id,
  completionLabel: z.enum(["완료", "제출"]).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(12000).default(""),
  section: z.string().min(1).max(100).default("기본 절차"),
  preparations: z.array(z.string().max(1000)).max(30).default([]),
  dependsOn: z.array(id).max(200).default([]),
  when: z
    .array(
      z.object({
        questionId: id,
        operator: z.enum(["eq", "ne"]),
        value: scalar,
      }),
    )
    .max(40)
    .default([]),
  dueDate: z.iso.date().optional(),
  sources: z
    .array(
      z.object({
        page: z.number().int().positive(),
        quote: z.string().min(1).max(2000),
      }),
    )
    .max(20)
    .default([]),
});
export const PackSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  category: z.string().max(100).default("생활 가이드"),
  executionMode: z.enum(["ordered", "checklist"]).optional(),
  questions: z.array(QuestionSchema).max(50),
  tasks: z.array(TaskSchema).min(1).max(200),
});
export type Pack = z.infer<typeof PackSchema>;
export type Task = Pack["tasks"][number];
export type Answers = Record<string, string | boolean>;
export type Progress = Record<
  string,
  { done: boolean; completedAt?: string; note?: string; dueDate?: string }
>;
export type TaskState = Task & {
  status: "done" | "ready" | "blocked";
  effectiveDueDate?: string;
};
export type SourcePage = { page: number; text: string };
export type PackRecord = {
  recordId: string;
  pack: Pack;
  status: "draft" | "published";
  documentId: string | null;
  method: string;
  createdAt: string;
};
export type Run = {
  id: string;
  name: string;
  pack: Pack;
  answers: Answers;
  progress: Progress;
  createdAt: string;
  updatedAt: string;
};
export type RunView = Run & {
  plan: TaskState[];
  completed: number;
  total: number;
  percent: number;
};

export function validatePack(input: unknown): Pack {
  const pack = PackSchema.parse(input);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`${label} ID가 중복되었습니다.`);
  };
  unique(
    pack.questions.map((q) => q.id),
    "질문",
  );
  unique(
    pack.tasks.map((t) => t.id),
    "작업",
  );
  const questions = new Map(pack.questions.map((q) => [q.id, q]));
  for (const q of pack.questions) {
    if (q.type === "select" && !q.options.length)
      throw new Error(`${q.label}: 선택지가 필요합니다.`);
    unique(
      q.options.map((o) => o.value),
      "선택지",
    );
  }
  const tasks = new Map(pack.tasks.map((t) => [t.id, t]));
  for (const task of pack.tasks) {
    unique(task.dependsOn, `${task.title} 선행 작업`);
    for (const dependency of task.dependsOn)
      if (!tasks.has(dependency))
        throw new Error(`${task.title}: 선행 작업 ${dependency}가 없습니다.`);
    for (const rule of task.when) {
      const q = questions.get(rule.questionId);
      if (!q)
        throw new Error(
          `${task.title}: 조건 질문 ${rule.questionId}가 없습니다.`,
        );
      if (
        q.type === "boolean"
          ? typeof rule.value !== "boolean"
          : typeof rule.value !== "string"
      )
        throw new Error(`${task.title}: 조건 값의 형식이 올바르지 않습니다.`);
      if (q.type === "select" && !q.options.some((o) => o.value === rule.value))
        throw new Error(`${task.title}: 조건 선택지가 존재하지 않습니다.`);
    }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId))
      throw new Error("작업 간 순환 의존성이 있습니다.");
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    tasks.get(taskId)!.dependsOn.forEach(visit);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  pack.tasks.forEach((t) => visit(t.id));
  return pack;
}

export function validateAnswers(pack: Pack, input: unknown): Answers {
  const answers = z.record(z.string(), scalar).parse(input);
  for (const q of pack.questions) {
    const value = answers[q.id];
    if (
      q.type === "boolean"
        ? typeof value !== "boolean"
        : typeof value !== "string" || !value.trim()
    )
      throw new Error(`${q.label}에 답변해 주세요.`);
    if (q.type === "select" && !q.options.some((o) => o.value === value))
      throw new Error(`${q.label}: 선택지를 확인해 주세요.`);
  }
  return Object.fromEntries(pack.questions.map((q) => [q.id, answers[q.id]]));
}

export function eligibleTasks(pack: Pack, answers: Answers): Task[] {
  return pack.tasks.filter((task) =>
    task.when.every((rule) =>
      rule.operator === "eq"
        ? answers[rule.questionId] === rule.value
        : answers[rule.questionId] !== rule.value,
    ),
  );
}

export function buildPlan(
  pack: Pack,
  answers: Answers,
  progress: Progress = {},
): TaskState[] {
  const tasks = eligibleTasks(pack, answers),
    ids = new Set(tasks.map((t) => t.id));
  const ordered: Task[] = [],
    visited = new Set<string>();
  const visit = (task: Task) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    task.dependsOn
      .filter((id) => ids.has(id))
      .forEach((id) => visit(tasks.find((t) => t.id === id)!));
    ordered.push(task);
  };
  tasks.forEach(visit);
  return ordered.map((t) => ({
    ...t,
    status: progress[t.id]?.done
      ? "done"
      : t.dependsOn.some((id) => ids.has(id) && !progress[id]?.done)
        ? "blocked"
        : "ready",
    effectiveDueDate: progress[t.id]?.dueDate || t.dueDate,
  }));
}

// Reopening a prerequisite invalidates completed descendants, including transitive ones.
export function invalidateFrom(
  pack: Pack,
  taskIds: string[],
  progress: Progress,
): Progress {
  const affected = new Set(taskIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of pack.tasks)
      if (!affected.has(t.id) && t.dependsOn.some((d) => affected.has(d))) {
        affected.add(t.id);
        grew = true;
      }
  }
  return Object.fromEntries(
    Object.entries(progress).map(([id, p]) => [
      id,
      affected.has(id) ? { ...p, done: false, completedAt: undefined } : p,
    ]),
  );
}

export function diffPacks(before: Pack, after: Pack) {
  const old = new Map(before.tasks.map((t) => [t.id, t])),
    next = new Map(after.tasks.map((t) => [t.id, t]));
  return {
    added: after.tasks.filter((t) => !old.has(t.id)),
    removed: before.tasks.filter((t) => !next.has(t.id)),
    changed: after.tasks.filter(
      (t) =>
        old.has(t.id) && JSON.stringify(old.get(t.id)) !== JSON.stringify(t),
    ),
    questionsChanged:
      JSON.stringify(before.questions) !== JSON.stringify(after.questions),
  };
}

export function migrateProgress(
  before: Pack,
  after: Pack,
  progress: Progress,
  answers?: Answers,
): Progress {
  const diff = diffPacks(before, after);
  const retained = Object.fromEntries(
    Object.entries(progress).filter(([id]) =>
      after.tasks.some((t) => t.id === id),
    ),
  );
  const migrated = invalidateFrom(
    after,
    diff.changed.map((t) => t.id),
    retained,
  );
  if (!answers) return migrated;
  const tasks = eligibleTasks(after, answers);
  const ids = new Set(tasks.map((t) => t.id));
  const active = Object.fromEntries(
    Object.entries(migrated).filter(([id]) => ids.has(id)),
  );
  const invalid = tasks.filter(
    (t) =>
      active[t.id]?.done &&
      t.dependsOn.some((id) => ids.has(id) && !active[id]?.done),
  );
  return invalidateFrom(
    after,
    invalid.map((t) => t.id),
    active,
  );
}
