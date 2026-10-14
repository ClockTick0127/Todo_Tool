import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PackRecord, Run, SourcePage } from "@lifekit/core";
import { samplePack, samplePages } from "./sample.js";
import { scenarioTemplates } from "./templates.js";

export function openStore(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "lifekit.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,pages TEXT NOT NULL,pdf BLOB);
    CREATE TABLE IF NOT EXISTS packs(record_id TEXT PRIMARY KEY,pack_id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,UNIQUE(pack_id,version));
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
  const getPack = (recordId: string): PackRecord | undefined => {
    const row = db
      .prepare("SELECT body FROM packs WHERE record_id=?")
      .get(recordId);
    return row ? JSON.parse(row.body as string) : undefined;
  };
  const packs = (): PackRecord[] =>
    db
      .prepare("SELECT body FROM packs ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.body as string));
  const savePack = (record: PackRecord) =>
    db
      .prepare(
        "INSERT INTO packs VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET body=excluded.body",
      )
      .run(
        record.recordId,
        record.pack.id,
        record.pack.version,
        JSON.stringify(record),
      );
  const getRun = (id: string): Run | undefined => {
    const row = db.prepare("SELECT body FROM runs WHERE id=?").get(id);
    return row ? JSON.parse(row.body as string) : undefined;
  };
  const saveRun = (run: Run) =>
    db
      .prepare(
        "INSERT INTO runs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(run.id, JSON.stringify(run));
  const runs = (): Run[] =>
    db
      .prepare("SELECT body FROM runs ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.body as string));
  const saveDocument = (
    name: string,
    pages: SourcePage[],
    pdf?: Uint8Array,
  ) => {
    const id = randomUUID();
    db.prepare("INSERT INTO documents VALUES(?,?,?,?)").run(
      id,
      name,
      JSON.stringify(pages),
      pdf ?? null,
    );
    return id;
  };
  const document = (id: string) => {
    const row = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
    return row
      ? {
          id: row.id as string,
          name: row.name as string,
          pages: JSON.parse(row.pages as string) as SourcePage[],
          pdf: row.pdf as Uint8Array | null,
        }
      : undefined;
  };
  const transaction = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  if (!packs().length)
    transaction(() => {
      const documentId = saveDocument("신입생 온보딩 · 예제 문서", samplePages);
      savePack({
        recordId: randomUUID(),
        pack: samplePack,
        status: "published",
        documentId,
        method: "예제",
        createdAt: new Date().toISOString(),
      });
    });
  // Add new built-in situations to existing databases without changing user guides or runs.
  transaction(() => {
    const existingIds = new Set(packs().map((record) => record.pack.id));
    for (const pack of scenarioTemplates) {
      if (existingIds.has(pack.id)) continue;
      savePack({
        recordId: randomUUID(),
        pack,
        status: "published",
        documentId: null,
        method: "상황 예제",
        createdAt: new Date().toISOString(),
      });
    }
  });
  return {
    db,
    getPack,
    packs,
    savePack,
    getRun,
    saveRun,
    runs,
    saveDocument,
    document,
    transaction,
  };
}
export type Store = ReturnType<typeof openStore>;
