import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Pack, PackRecord, RunView } from "@lifekit/core";
import { openStore } from "../src/store.js";
import { createApp } from "../src/app.js";

async function withAPI(
  run: (
    request: (
      route: string,
      method?: string,
      body?: unknown,
    ) => Promise<{ status: number; data: any }>,
    directory: string,
  ) => Promise<void>,
) {
  const directory = mkdtempSync(path.join(tmpdir(), "lifekit-scenarios-"));
  const store = openStore(directory);
  const server = createApp(store, {
    baseURL: "http://127.0.0.1:1",
    model: "",
    apiKey: "",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (route: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await run(request, directory);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
    // Only remove the uniquely created test directory inside the named OS temp directory.
    const resolved = path.resolve(directory),
      root = path.resolve(tmpdir());
    assert.equal(path.dirname(resolved), root);
    assert.ok(path.basename(resolved).startsWith("lifekit-scenarios-"));
    rmSync(resolved, { recursive: true, force: true });
  }
}

test("문서·AI 없이 순서형 상황을 작성하고 반복 실행 기록을 독립 저장한다", async () =>
  withAPI(async (request, directory) => {
    const created = await request("/packs", "POST", {
      schemaVersion: 1,
      id: "custom-guide",
      version: 1,
      title: "내 서버 실행",
      category: "개발",
      executionMode: "ordered",
      questions: [],
      tasks: [
        { id: "folder", title: "폴더 열기" },
        { id: "backend", title: "백엔드 실행", dependsOn: ["folder"] },
        { id: "frontend", title: "프론트 실행", dependsOn: ["backend"] },
      ],
    });
    assert.equal(created.status, 201);
    const record = created.data as PackRecord;
    assert.equal(record.documentId, null);
    assert.equal(record.method, "직접 작성");
    assert.equal(record.pack.executionMode, "ordered");
    assert.ok(record.pack.tasks.every((task) => task.sources.length === 0));
    assert.equal(
      (
        await request("/runs", "POST", {
          recordId: record.recordId,
          name: "실행",
          answers: {},
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/packs/${record.recordId}/publish`, "POST")).status,
      200,
    );
    const first = (
      await request("/runs", "POST", {
        recordId: record.recordId,
        name: "월요일 실행",
        answers: {},
      })
    ).data as RunView;
    assert.deepEqual(
      first.plan.map((task) => task.status),
      ["ready", "blocked", "blocked"],
    );
    assert.equal(
      (
        await request(`/runs/${first.id}/tasks/frontend`, "PATCH", {
          done: true,
        })
      ).status,
      400,
    );
    const progressed = (
      await request(`/runs/${first.id}/tasks/folder`, "PATCH", { done: true })
    ).data as RunView;
    assert.equal(progressed.plan[1].status, "ready");
    const second = (
      await request("/runs", "POST", {
        recordId: record.recordId,
        name: "화요일 실행",
        answers: {},
      })
    ).data as RunView;
    assert.notEqual(first.id, second.id);
    assert.equal(second.completed, 0);
    assert.equal((await request(`/runs/${first.id}`)).data.completed, 1);
    const restarted = openStore(directory);
    assert.equal(restarted.getRun(first.id)?.progress.folder.done, true);
    assert.equal(restarted.getRun(second.id)?.name, "화요일 실행");
    assert.equal(
      restarted.packs().filter((p) => p.pack.id === "development-server")
        .length,
      1,
    );
    assert.ok(restarted.getPack(record.recordId));
    restarted.db.close();
  }));

test("지원 서류는 조건별 목록을 구성하고 원하는 순서로 제출 완료 처리한다", async () =>
  withAPI(async (request) => {
    const templates = (await request("/scenario-templates")).data as Pack[];
    const template = templates.find(
      (pack) => pack.id === "job-application-documents",
    )!;
    const created = (
      await request("/packs", "POST", { ...template, title: "A회사 제출 서류" })
    ).data as PackRecord;
    assert.notEqual(created.pack.id, template.id);
    await request(`/packs/${created.recordId}/publish`, "POST");
    const run = (
      await request("/runs", "POST", {
        recordId: created.recordId,
        name: "A회사 지원",
        answers: { "cover-letter": true, portfolio: true, certificates: false },
      })
    ).data as RunView;
    assert.equal(run.pack.executionMode, "checklist");
    assert.ok(!run.plan.some((task) => task.id === "certificates"));
    assert.ok(run.plan.every((task) => task.status === "ready"));
    const updated = (
      await request(`/runs/${run.id}/tasks/portfolio`, "PATCH", {
        done: true,
        note: "링크 제출 확인",
      })
    ).data as RunView;
    assert.equal(updated.completed, 1);
    assert.equal(
      updated.plan.find((task) => task.id === "resume")?.status,
      "ready",
    );
    assert.equal(
      updated.plan.find((task) => task.id === "portfolio")?.completionLabel,
      "제출",
    );
  }));

test("서버 실행 예제의 선택 작업을 제외해도 필수 준비 단계는 유지한다", async () =>
  withAPI(async (request) => {
    const records = (await request("/packs")).data as PackRecord[];
    const record = records.find(
      (item) => item.pack.id === "development-server",
    )!;
    const run = (
      await request("/runs", "POST", {
        recordId: record.recordId,
        name: "DB 없는 서버 실행",
        answers: { database: false },
      })
    ).data as RunView;
    assert.ok(!run.plan.some((task) => task.id === "database"));
    assert.equal(
      run.plan.find((task) => task.id === "backend")?.status,
      "blocked",
    );
    for (const id of ["workspace", "environment", "dependencies"])
      await request(`/runs/${run.id}/tasks/${id}`, "PATCH", { done: true });
    assert.equal(
      (await request(`/runs/${run.id}`)).data.plan.find(
        (task: any) => task.id === "backend",
      ).status,
      "ready",
    );
  }));
