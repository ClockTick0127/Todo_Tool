import { useEffect, useState } from "react";
import { ArrowRight, GitBranch, ListChecks } from "lucide-react";
import { validatePack, type Pack } from "@lifekit/core";
import { api } from "./api";

export default function ScenarioCreator({
  busy,
  onCreate,
  onClose,
}: {
  busy: boolean;
  onCreate: (pack: Pack) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<Pack[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("나의 상황");
  const [description, setDescription] = useState("");
  const [executionMode, setExecutionMode] = useState<"ordered" | "checklist">(
    "checklist",
  );
  const [completionLabel, setCompletionLabel] = useState<"완료" | "제출">(
    "완료",
  );
  const [lines, setLines] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);
  const template = templates.find((pack) => pack.id === templateId);
  const selectTemplate = (id: string) => {
    setTemplateId(id);
    setError("");
    const pack = templates.find((p) => p.id === id);
    setTitle(pack?.title || "");
    setCategory(pack?.category || "나의 상황");
    setDescription(pack?.description || "");
    setExecutionMode(pack?.executionMode || "checklist");
  };
  const count =
    template?.tasks.length ??
    lines.split("\n").filter((line) => line.trim()).length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const tasks =
            template?.tasks ??
            lines
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((taskTitle, i) => ({
                id: `step-${i + 1}`,
                title: taskTitle,
                section:
                  executionMode === "ordered" ? "실행 순서" : "체크할 항목",
                completionLabel,
                dependsOn:
                  executionMode === "ordered" && i > 0 ? [`step-${i}`] : [],
              }));
          const pack = validatePack({
            schemaVersion: 1,
            id: "new-scenario",
            version: 1,
            title: title.trim(),
            category: category.trim(),
            description,
            executionMode,
            questions: template?.questions ?? [],
            tasks,
          });
          onCreate(pack);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "상황과 작업을 확인하세요.",
          );
        }
      }}
    >
      <p className="help">
        문서나 AI 없이 직접 상황을 만들 수 있어요. 같은 가이드를 여러 번
        시작하면 실행 건마다 기록을 따로 관리합니다.
      </p>
      <label className="field">
        <span>시작 방법</span>
        <select
          disabled={busy}
          value={templateId}
          onChange={(e) => selectTemplate(e.target.value)}
        >
          <option value="">빈 상황부터 직접 작성</option>
          {templates.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>상황 이름</span>
        <input
          required
          disabled={busy}
          maxLength={100}
          placeholder="예: 프로젝트 서버 켜기 / A회사 지원 서류"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="form-columns">
        <label className="field">
          <span>카테고리</span>
          <input
            disabled={busy}
            maxLength={100}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label className="field">
          <span>진행 방식</span>
          <select
            disabled={busy || Boolean(template)}
            value={executionMode}
            onChange={(e) =>
              setExecutionMode(e.target.value as typeof executionMode)
            }
          >
            <option value="ordered">순서대로 따라가기</option>
            <option value="checklist">자유롭게 체크하기</option>
          </select>
        </label>
      </div>
      <div className="scenario-mode-note">
        {executionMode === "ordered" ? (
          <GitBranch size={18} />
        ) : (
          <ListChecks size={18} />
        )}
        <p>
          {executionMode === "ordered"
            ? "앞 작업을 마쳐야 다음 단계가 열립니다. 실행 명령과 상세 안내는 생성 후 편집할 수 있어요."
            : "각 항목을 원하는 순서로 체크합니다. 제출한 서류를 표시하거나 준비물을 확인할 때 사용할 수 있어요."}
        </p>
      </div>
      <label className="field">
        <span>상황 설명 (선택)</span>
        <textarea
          disabled={busy}
          maxLength={4000}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {template ? (
        <div className="scenario-preview">
          <b>예제의 작업과 조건을 함께 복사합니다</b>
          <ol>
            {template.tasks.map((task) => (
              <li key={task.id}>
                {task.title}
                {task.when.length > 0 && <small>조건에 따라 포함</small>}
              </li>
            ))}
          </ol>
          <p className="help">
            생성 후 질문, 항목, 명령과 선행 관계를 원하는 대로 수정하세요.
          </p>
        </div>
      ) : (
        <>
          <label className="field">
            <span>작업 / 제출할 서류 · 한 줄에 하나씩</span>
            <textarea
              disabled={busy}
              required
              rows={6}
              placeholder={
                executionMode === "ordered"
                  ? "프로젝트 폴더 열기\n환경 설정 확인\n백엔드 서버 실행\n프론트엔드 서버 실행\n접속 확인"
                  : "이력서 제출\n자기소개서 제출\n포트폴리오 제출"
              }
              value={lines}
              onChange={(e) => setLines(e.target.value)}
            />
          </label>
          <label className="field">
            <span>체크할 때 표시할 말</span>
            <select
              disabled={busy}
              value={completionLabel}
              onChange={(e) =>
                setCompletionLabel(e.target.value as typeof completionLabel)
              }
            >
              <option value="완료">완료</option>
              <option value="제출">제출 완료</option>
            </select>
          </label>
        </>
      )}
      {error && (
        <p className="help danger" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onClose}
        >
          취소
        </button>
        <button className="button primary" disabled={busy || !count}>
          초안 만들기 · {count}개 작업
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
