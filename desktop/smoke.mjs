import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

function samplePDF() {
  const stream = "BT /F1 12 Tf 50 750 Td (Prepare your account.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((value, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${value}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

export async function smokeTest(baseURL, userData) {
  const json = async (route, options) => {
    const response = await fetch(baseURL + route, options);
    const body = await response.json();
    assert.ok(response.ok, `${route}: ${JSON.stringify(body)}`);
    return body;
  };
  const post = (route, value) =>
    json(route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseURL },
      body: JSON.stringify(value),
    });
  const health = await json("/api/health");
  assert.equal(health.desktop, true);
  const html = await fetch(baseURL).then((r) => r.text());
  assert.match(html, /LifeKit/);
  const script = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(baseURL + script)).status, 200);
  const packs = await json("/api/packs");
  const previousRuns = await json("/api/runs");
  if (previousRuns.length) {
    assert.equal(previousRuns[0].name, "EXE 실행 검사");
    assert.equal(previousRuns[0].completed, 1);
  }
  const run = await post("/api/runs", {
    recordId: packs.find((p) => p.method === "예제").recordId,
    name: "EXE 실행 검사",
    answers: { housing: "dorm", international: false, scholarship: false },
  });
  const completed = await json(`/api/runs/${run.id}/tasks/portal`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ done: true }),
  });
  assert.equal(completed.completed, 1);
  const form = new FormData();
  form.append(
    "file",
    new Blob([samplePDF()], { type: "application/pdf" }),
    "실행검사.pdf",
  );
  form.append("title", "EXE PDF 검사");
  form.append("mode", "manual");
  const record = await json("/api/documents", {
    method: "POST",
    headers: { Origin: baseURL },
    body: form,
  });
  assert.match(record.pack.tasks[0].description, /Prepare your account/);
  const doc = await json(`/api/documents/${record.documentId}`);
  assert.equal(doc.name, "실행검사.pdf");
  assert.ok(existsSync(path.join(userData, "data", "lifekit.sqlite")));
  return {
    ok: true,
    versions: process.versions,
    checks: [
      "embedded SQLite",
      "random local port with Origin validation",
      "frontend assets",
      "create checklist",
      "persist progress",
      "PDF extraction in packaged runtime",
      "Korean filenames",
    ],
    userData,
    restartPersistenceVerified: previousRuns.length > 0,
  };
}
