import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import {
  validatePack,
  validateAnswers,
  buildPlan,
  invalidateFrom,
  migrateProgress,
  diffPacks,
  type Run,
  type RunView,
} from "@lifekit/core";
import type { Store } from "./store.js";
import { scenarioTemplates } from "./templates.js";
import {
  CompatibleAIAdapter,
  extractPDF,
  manualDraft,
  validateSources,
  type AIConfig,
} from "./ai.js";

export function createApp(
  store: Store,
  config: AIConfig,
  frontendPath?: string,
  runtime: {
    desktop?: boolean;
    dataDirectory?: string;
    configPath?: string;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) {
      res.status(403).json({ error: "로컬 주소에서만 접근할 수 있습니다." });
      return;
    }
    const origin = req.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          ["127.0.0.1", "localhost"].includes(url.hostname) &&
          url.protocol === "http:" &&
          (runtime.desktop
            ? [String(req.socket.localPort)]
            : ["5173", process.env.PORT || "4310", String(req.socket.localPort)]
          ).includes(url.port);
      } catch {}
      if (!allowed) {
        res.status(403).json({ error: "허용되지 않은 요청 출처입니다." });
        return;
      }
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 },
  });
  const packRecord = (id: string) => {
    const record = store.getPack(id);
    if (!record) throw new Error("가이드를 찾을 수 없습니다.");
    return record;
  };
  const runRecord = (id: string) => {
    const run = store.getRun(id);
    if (!run) throw new Error("진행 기록을 찾을 수 없습니다.");
    return run;
  };
  const view = (run: Run): RunView => {
    const plan = buildPlan(run.pack, run.answers, run.progress),
      completed = plan.filter((t) => t.status === "done").length;
    return {
      ...run,
      plan,
      completed,
      total: plan.length,
      percent: plan.length ? Math.round((completed / plan.length) * 100) : 100,
    };
  };
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      storage: "SQLite",
      localOnly: true,
      aiConfigured: Boolean(config.model),
      model: config.model || null,
      desktop: Boolean(runtime.desktop),
      dataLocation: runtime.dataDirectory || "backend/data",
      configurationLocation: runtime.configPath || "backend/.env",
    }),
  );
  app.get("/api/packs", (_req, res) => res.json(store.packs()));
  app.get("/api/scenario-templates", (_req, res) =>
    res.json(scenarioTemplates),
  );
  app.post("/api/packs", (req, res) => {
    const parsed = validatePack(req.body);
    const record = {
      recordId: randomUUID(),
      pack: {
        ...parsed,
        id: `scenario-${randomUUID().slice(0, 8)}`,
        version: 1,
      },
      status: "draft" as const,
      documentId: null,
      method: "직접 작성",
      createdAt: new Date().toISOString(),
    };
    store.savePack(record);
    res.status(201).json(record);
  });
  app.get("/api/packs/:id", (req, res) => res.json(packRecord(req.params.id)));
  app.get("/api/documents/:id", (req, res) => {
    const doc = store.document(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "문서가 없습니다." });
      return;
    }
    res.json({
      id: doc.id,
      name: doc.name,
      pages: doc.pages,
      hasPDF: !!doc.pdf,
    });
  });
  app.get("/api/documents/:id/pdf", (req, res) => {
    const doc = store.document(req.params.id);
    if (!doc?.pdf) {
      res.status(404).json({ error: "PDF가 없습니다." });
      return;
    }
    res.type("application/pdf").send(Buffer.from(doc.pdf));
  });
  app.post("/api/documents", upload.single("file"), async (req, res) => {
    if (!req.file) throw new Error("PDF 파일을 선택하세요.");
    const title = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(req.body.title || "새로운 문서 가이드");
    const mode = z.enum(["manual", "ai"]).parse(req.body.mode || "manual");
    if (mode === "ai" && !config.model)
      throw new Error(
        "먼저 backend/.env에 AI_MODEL을 설정하고 서버를 다시 시작하세요.",
      );
    const pages = await extractPDF(req.file.buffer);
    const pack =
      mode === "ai"
        ? await new CompatibleAIAdapter(config).generate(pages, title)
        : manualDraft(pages, title);
    const record = store.transaction(() => {
      // Multipart headers default to Latin-1, while browsers send UTF-8 names.
      const originalName = req.file!.originalname;
      const decodedName = /^[\u0000-\u00ff]*$/.test(originalName)
        ? Buffer.from(originalName, "latin1").toString("utf8")
        : originalName;
      const documentId = store.saveDocument(
        decodedName.includes("\ufffd") ? originalName : decodedName,
        pages,
        req.file!.buffer,
      );
      const record = {
        recordId: randomUUID(),
        pack,
        status: "draft" as const,
        documentId,
        method: mode === "ai" ? `AI · ${config.model}` : "수동 초안",
        createdAt: new Date().toISOString(),
      };
      store.savePack(record);
      return record;
    });
    res.status(201).json(record);
  });
  app.post("/api/packs/import", (req, res) => {
    const parsed = validatePack(req.body);
    const existing = store.packs().filter((r) => r.pack.id === parsed.id);
    const pack = {
      ...parsed,
      version: Math.max(0, ...existing.map((r) => r.pack.version)) + 1,
    };
    const record = {
      recordId: randomUUID(),
      pack,
      status: "draft" as const,
      documentId: null,
      method: "JSON 가져오기",
      createdAt: new Date().toISOString(),
    };
    store.savePack(record);
    res.status(201).json(record);
  });
  app.put("/api/packs/:id", (req, res) => {
    const record = packRecord(req.params.id);
    if (record.status !== "draft")
      throw new Error("배포된 가이드는 새 버전을 만들어 수정하세요.");
    const pack = validatePack(req.body);
    if (pack.id !== record.pack.id || pack.version !== record.pack.version)
      throw new Error("가이드 ID와 버전은 변경할 수 없습니다.");
    const next = { ...record, pack };
    store.savePack(next);
    res.json(next);
  });
  app.post("/api/packs/:id/publish", (req, res) => {
    const record = packRecord(req.params.id);
    validatePack(record.pack);
    if (record.documentId)
      validateSources(record.pack, store.document(record.documentId)!.pages);
    const next = { ...record, status: "published" as const };
    store.savePack(next);
    res.json(next);
  });
  app.post("/api/packs/:id/revise", (req, res) => {
    const record = packRecord(req.params.id);
    const version =
      Math.max(
        ...store
          .packs()
          .filter((r) => r.pack.id === record.pack.id)
          .map((r) => r.pack.version),
      ) + 1;
    const next = {
      ...record,
      recordId: randomUUID(),
      status: "draft" as const,
      pack: { ...record.pack, version },
      createdAt: new Date().toISOString(),
    };
    store.savePack(next);
    res.status(201).json(next);
  });
  app.get("/api/runs", (_req, res) => res.json(store.runs().map(view)));
  app.post("/api/runs", (req, res) => {
    const body = z
      .object({
        recordId: z.string(),
        name: z.string().trim().min(1).max(100),
        answers: z.unknown(),
      })
      .parse(req.body);
    const record = packRecord(body.recordId);
    if (record.status !== "published")
      throw new Error("검토 후 배포된 가이드만 시작할 수 있습니다.");
    const answers = validateAnswers(record.pack, body.answers),
      now = new Date().toISOString();
    const run = {
      id: randomUUID(),
      name: body.name,
      pack: record.pack,
      answers,
      progress: {},
      createdAt: now,
      updatedAt: now,
    };
    store.saveRun(run);
    res.status(201).json(view(run));
  });
  app.get("/api/runs/:id", (req, res) =>
    res.json(view(runRecord(req.params.id))),
  );
  app.patch("/api/runs/:id/tasks/:taskId", (req, res) => {
    const body = z
      .object({
        done: z.boolean().optional(),
        note: z.string().max(4000).optional(),
        dueDate: z.iso.date().nullable().optional(),
      })
      .parse(req.body);
    const run = runRecord(req.params.id),
      taskId = req.params.taskId;
    const task = buildPlan(run.pack, run.answers, run.progress).find(
      (t) => t.id === taskId,
    );
    if (!task) throw new Error("이 절차에 해당하는 작업이 없습니다.");
    if (body.done && task.status === "blocked")
      throw new Error("선행 작업을 먼저 완료하세요.");
    if (body.done === false)
      run.progress = invalidateFrom(run.pack, [taskId], run.progress);
    const previous = run.progress[taskId] ?? { done: false };
    run.progress[taskId] = {
      ...previous,
      ...(body.done !== undefined
        ? {
            done: body.done,
            completedAt: body.done
              ? previous.completedAt || new Date().toISOString()
              : undefined,
          }
        : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ?? undefined }
        : {}),
    };
    run.updatedAt = new Date().toISOString();
    store.saveRun(run);
    res.json(view(run));
  });
  app.get("/api/runs/:id/upgrade", (req, res) => {
    const run = runRecord(req.params.id);
    const next = store
      .packs()
      .filter(
        (r) =>
          r.status === "published" &&
          r.pack.id === run.pack.id &&
          r.pack.version > run.pack.version,
      )
      .sort((a, b) => b.pack.version - a.pack.version)[0];
    res.json(
      next ? { record: next, diff: diffPacks(run.pack, next.pack) } : null,
    );
  });
  app.post("/api/runs/:id/upgrade", (req, res) => {
    const run = runRecord(req.params.id),
      record = packRecord(z.string().parse(req.body.recordId));
    if (
      record.status !== "published" ||
      record.pack.id !== run.pack.id ||
      record.pack.version <= run.pack.version
    )
      throw new Error("적용 가능한 새 버전이 아닙니다.");
    const answers = validateAnswers(
      record.pack,
      req.body.answers ?? run.answers,
    );
    const progress = migrateProgress(
      run.pack,
      record.pack,
      run.progress,
      answers,
    );
    const ids = new Set(buildPlan(record.pack, answers).map((t) => t.id));
    const next = {
      ...run,
      pack: record.pack,
      answers,
      progress: Object.fromEntries(
        Object.entries(progress).filter(([id]) => ids.has(id)),
      ),
      updatedAt: new Date().toISOString(),
    };
    store.saveRun(next);
    res.json(view(next));
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API 경로를 찾을 수 없습니다." }),
  );
  if (frontendPath && existsSync(path.join(frontendPath, "index.html"))) {
    app.use(express.static(frontendPath));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(frontendPath, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("\n")
          : error instanceof Error
            ? error.message
            : "요청 처리에 실패했습니다.";
      const status = error instanceof multer.MulterError ? 413 : 400;
      res.status(status).json({ error: message });
    },
  );
  return app;
}
