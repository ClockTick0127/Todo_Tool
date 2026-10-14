import type {
  Pack,
  PackRecord,
  RunView,
  SourcePage,
  Answers,
} from "@lifekit/core";
export type Health = {
  desktop: boolean;
  dataLocation: string;
  configurationLocation: string;
  ok: boolean;
  storage: string;
  localOnly: boolean;
  aiConfigured: boolean;
  model: string | null;
};
export type DocumentView = {
  id: string;
  name: string;
  pages: SourcePage[];
  hasPDF: boolean;
};
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}
export const api = {
  health: () => request<Health>("/health"),
  packs: () => request<PackRecord[]>("/packs"),
  templates: () => request<Pack[]>("/scenario-templates"),
  createScenario: (pack: Pack) =>
    request<PackRecord>("/packs", {
      method: "POST",
      body: JSON.stringify(pack),
    }),
  runs: () => request<RunView[]>("/runs"),
  document: (id: string) => request<DocumentView>(`/documents/${id}`),
  createRun: (recordId: string, name: string, answers: Answers) =>
    request<RunView>("/runs", {
      method: "POST",
      body: JSON.stringify({ recordId, name, answers }),
    }),
  task: (runId: string, taskId: string, body: unknown) =>
    request<RunView>(`/runs/${runId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  upload: (form: FormData) =>
    request<PackRecord>("/documents", { method: "POST", body: form }),
  import: (pack: unknown) =>
    request<PackRecord>("/packs/import", {
      method: "POST",
      body: JSON.stringify(pack),
    }),
  save: (id: string, pack: Pack) =>
    request<PackRecord>(`/packs/${id}`, {
      method: "PUT",
      body: JSON.stringify(pack),
    }),
  publish: (id: string) =>
    request<PackRecord>(`/packs/${id}/publish`, { method: "POST" }),
  revise: (id: string) =>
    request<PackRecord>(`/packs/${id}/revise`, { method: "POST" }),
  upgrade: (id: string) =>
    request<{
      record: PackRecord;
      diff: {
        added: Pack["tasks"];
        removed: Pack["tasks"];
        changed: Pack["tasks"];
        questionsChanged: boolean;
      };
    } | null>(`/runs/${id}/upgrade`),
  applyUpgrade: (id: string, recordId: string, answers: Answers) =>
    request<RunView>(`/runs/${id}/upgrade`, {
      method: "POST",
      body: JSON.stringify({ recordId, answers }),
    }),
};
export function downloadJSON(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
