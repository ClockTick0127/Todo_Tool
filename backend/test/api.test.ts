import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createServer, request } from "node:http";
import { openStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import { CompatibleAIAdapter, extractPDF } from "../src/ai.js";
import type { PackRecord, RunView } from "@lifekit/core";

function pdfFixture() {
  const stream =
    "BT /F1 12 Tf 50 750 Td (Register account before orientation.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}

test("로컬 API: 생성, 잠금, 저장, 버전 변경, 재시작 후 복원", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "lifekit-api-"));
  const store = openStore(directory);
  const server = createApp(store, {
    baseURL: "",
    model: "",
    apiKey: "",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const req = async (url: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}/api${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const records = (await req("/packs")).data as PackRecord[];
    const initial = records[0];
    assert.equal((await req("/health")).data.aiConfigured, false);
    const created = await req("/runs", "POST", {
      recordId: initial.recordId,
      name: "내 가이드",
      answers: { housing: "dorm", international: false, scholarship: false },
    });
    assert.equal(created.status, 201);
    const run = created.data as RunView;
    assert.ok(!run.plan.some((t) => t.id === "rental"));
    assert.ok(!run.plan.some((t) => t.id === "international-office"));
    assert.equal(
      (await req(`/runs/${run.id}/tasks/tuition`, "PATCH", { done: true }))
        .status,
      400,
    );
    assert.equal(
      (await req(`/runs/${run.id}/tasks/portal`, "PATCH", { done: true })).data
        .completed,
      1,
    );
    const second = await req(`/runs/${run.id}/tasks/tuition`, "PATCH", {
      done: true,
      note: "영수증 저장",
      dueDate: "2026-10-30",
    });
    assert.equal(second.data.completed, 2);
    const canceled = await req(`/runs/${run.id}/tasks/portal`, "PATCH", {
      done: false,
    });
    assert.equal(canceled.data.completed, 0);
    assert.equal(canceled.data.progress.tuition.note, "영수증 저장");
    await req(`/runs/${run.id}/tasks/portal`, "PATCH", { done: true });
    await req(`/runs/${run.id}/tasks/tuition`, "PATCH", { done: true });
    assert.equal(
      (await req(`/packs/${initial.recordId}`, "PUT", initial.pack)).status,
      400,
    );
    const revision = (await req(`/packs/${initial.recordId}/revise`, "POST"))
      .data as PackRecord;
    const changed = {
      ...revision.pack,
      tasks: revision.pack.tasks.map((t) =>
        t.id === "tuition" ? { ...t, title: "등록 결과 다시 확인" } : t,
      ),
    };
    assert.equal(
      (await req(`/packs/${revision.recordId}`, "PUT", changed)).status,
      200,
    );
    assert.equal(
      (await req(`/packs/${revision.recordId}/publish`, "POST")).status,
      200,
    );
    assert.equal((await req(`/runs/${run.id}`)).data.pack.version, 1);
    const diff = (await req(`/runs/${run.id}/upgrade`)).data;
    assert.equal(diff.diff.changed[0].id, "tuition");
    const updated = (
      await req(`/runs/${run.id}/upgrade`, "POST", {
        recordId: revision.recordId,
      })
    ).data as RunView;
    assert.equal(updated.pack.version, 2);
    assert.equal(updated.progress.portal.done, true);
    assert.equal(updated.progress.tuition.done, false);
    const invalidQuote = {
      ...changed,
      tasks: changed.tasks.map((t) => ({
        ...t,
        sources: [{ page: 1, quote: "존재하지 않는 인용" }],
      })),
    };
    const revision3 = (await req(`/packs/${revision.recordId}/revise`, "POST"))
      .data as PackRecord;
    await req(`/packs/${revision3.recordId}`, "PUT", {
      ...invalidQuote,
      version: 3,
    });
    assert.equal(
      (await req(`/packs/${revision3.recordId}/publish`, "POST")).status,
      400,
    );
    const foreign = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
    const forged = await new Promise<number | undefined>((resolve, reject) => {
      const requestHandle = request(
        `${base}/api/health`,
        { headers: { Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      requestHandle.on("error", reject);
      requestHandle.end();
    });
    assert.equal(forged, 403);
    assert.equal(
      (
        await req("/runs", "POST", {
          recordId: initial.recordId,
          name: "실패",
          answers: {},
        })
      ).status,
      400,
    );
    const backup = openStore(directory);
    assert.equal(backup.getRun(run.id)?.pack.version, 2);
    assert.equal(backup.getRun(run.id)?.progress.tuition.note, "영수증 저장");
    backup.db.close();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("실제 PDF 추출부터 수동 초안 검토와 배포까지", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "lifekit-pdf-"));
  const store = openStore(directory);
  const server = createApp(store, {
    baseURL: "",
    model: "",
    apiKey: "",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    const bytes = pdfFixture();
    const pages = await extractPDF(bytes);
    assert.match(pages[0].text, /Register account/);
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: "application/pdf" }),
      "입학안내.pdf",
    );
    form.append("title", "PDF 테스트");
    form.append("mode", "manual");
    const uploaded = await fetch(`${base}/documents`, {
      method: "POST",
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const record = (await uploaded.json()) as PackRecord;
    assert.equal(record.method, "수동 초안");
    assert.equal(record.pack.tasks[0].sources[0].page, 1);
    const sourceDocument = await fetch(`${base}/documents/${record.documentId}`);
    assert.equal((await sourceDocument.json()).name, "입학안내.pdf");
    const pdf = await fetch(`${base}/documents/${record.documentId}/pdf`);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal((await pdf.arrayBuffer()).byteLength, bytes.length);
    const publish = await fetch(`${base}/packs/${record.recordId}/publish`, {
      method: "POST",
    });
    assert.equal(publish.status, 200);
    const malformed = new FormData();
    malformed.append("file", new Blob(["fake pdf"]), "bad.pdf");
    const invalid = await fetch(`${base}/documents`, {
      method: "POST",
      body: malformed,
    });
    assert.equal(invalid.status, 400);
    await assert.rejects(() => extractPDF(Buffer.from("not a pdf")), /PDF/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("AI Adapter가 호환 API를 호출하고 원문 근거를 검증한다", async () => {
  let valid = true;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(JSON.parse(body).model, "test-model");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                id: "generated",
                version: 1,
                title: "생성 가이드",
                questions: [],
                tasks: [
                  {
                    id: "register",
                    title: "계정 생성",
                    sources: [
                      {
                        page: 1,
                        quote: valid ? "Register account" : "Invented quote",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const adapter = new CompatibleAIAdapter({
      baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      model: "test-model",
      apiKey: "",
    });
    const pages = [{ page: 1, text: "Register account before orientation." }];
    const pack = await adapter.generate(pages, "test");
    assert.equal(pack.tasks[0].title, "계정 생성");
    valid = false;
    await assert.rejects(() => adapter.generate(pages, "test"), /원문과 일치/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
