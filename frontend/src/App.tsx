import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ChevronRight,
  ChevronLeft,
  Circle,
  LockKeyhole,
  X,
  Download,
  Upload,
  Sparkles,
  ListChecks,
  GitBranch,
  CalendarDays,
  Clock3,
  Leaf,
  Search,
  ExternalLink,
  CheckCheck,
  LoaderCircle,
  RefreshCw,
  Pencil,
  Save,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  validatePack,
  diffPacks,
  type Pack,
  type PackRecord,
  type RunView,
  type Answers,
  type Task,
  type TaskState,
} from "@lifekit/core";
import { api, downloadJSON, type Health, type DocumentView } from "./api";
import ScenarioCreator from "./ScenarioCreator";

type Page = "home" | "guides" | "studio" | "settings" | "run";
const today = () => new Date().toLocaleDateString("sv-SE");
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="progress-track">
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}
function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Leaf size={32} />
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled), .modal input, .modal select, .modal textarea, .modal a",
          ),
        );
        if (items.length) {
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", key);
    document.querySelector<HTMLElement>(".modal button")?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Questions({
  pack,
  answers,
  onChange,
}: {
  pack: Pack;
  answers: Answers;
  onChange: (a: Answers) => void;
}) {
  return (
    <div className="question-list">
      {pack.questions.map((q, i) => (
        <label className="field" key={q.id}>
          <span>
            <b className="question-number">{String(i + 1).padStart(2, "0")}</b>
            {q.label}
          </span>
          {q.type === "select" ? (
            <select
              required
              value={String(answers[q.id] ?? "")}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
            >
              <option value="">선택해 주세요</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : q.type === "boolean" ? (
            <select
              value={String(answers[q.id] ?? false)}
              onChange={(e) =>
                onChange({ ...answers, [q.id]: e.target.value === "true" })
              }
            >
              <option value="false">아니요</option>
              <option value="true">네</option>
            </select>
          ) : (
            <input
              required
              maxLength={2000}
              value={String(answers[q.id] ?? "")}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

export default function App() {
  const [createRequested, setCreateRequested] = useState(false);
  const createSituation = () => {
    setPage("studio");
    setCreateRequested(true);
  };
  const [page, setPage] = useState<Page>("home"),
    [packs, setPacks] = useState<PackRecord[]>([]),
    [runs, setRuns] = useState<RunView[]>([]),
    [health, setHealth] = useState<Health | null>(null),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [activeId, setActiveId] = useState<string | null>(null),
    [startPack, setStartPack] = useState<PackRecord | null>(null),
    [answers, setAnswers] = useState<Answers>({}),
    [runName, setRunName] = useState(""),
    [document, setDocument] = useState<DocumentView | null>(null);
  const [studioId, setStudioId] = useState<string | null>(null),
    [upgrade, setUpgrade] =
      useState<Awaited<ReturnType<typeof api.upgrade>>>(null),
    [upgradeAnswers, setUpgradeAnswers] = useState<Answers>({});
  const refresh = async () => {
    const [p, r, h] = await Promise.all([
      api.packs(),
      api.runs(),
      api.health(),
    ]);
    setPacks(p);
    setRuns(r);
    setHealth(h);
  };
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const updateRun = (run: RunView) =>
    setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
  const updatePack = (record: PackRecord) => {
    setPacks((prev) => [
      record,
      ...prev.filter((p) => p.recordId !== record.recordId),
    ]);
    setStudioId(record.recordId);
  };
  const published = packs.filter(
    (p) =>
      p.status === "published" &&
      !packs.some(
        (other) =>
          other.status === "published" &&
          other.pack.id === p.pack.id &&
          other.pack.version > p.pack.version,
      ),
  );
  const active = runs.find((r) => r.id === activeId);
  const openRun = (run: RunView) => {
    setActiveId(run.id);
    setPage("run");
  };
  const begin = (record: PackRecord) => {
    setStartPack(record);
    setAnswers(
      Object.fromEntries(
        record.pack.questions
          .filter((q) => q.type === "boolean")
          .map((q) => [q.id, false]),
      ),
    );
    setRunName(record.pack.title);
  };
  const showSource = (pack: Pack) => {
    const record = packs.find(
      (p) => p.pack.id === pack.id && p.pack.version === pack.version,
    );
    if (record?.documentId)
      void action(async () =>
        setDocument(await api.document(record.documentId!)),
      );
    else setToast("이 가이드는 연결된 원문 문서가 없습니다.");
  };
  const ready = runs.reduce(
      (s, r) => s + r.plan.filter((t) => t.status === "ready").length,
      0,
    ),
    completed = runs.reduce((s, r) => s + r.completed, 0);
  const nav = [
    { id: "home" as Page, label: "내 대시보드", icon: LayoutDashboard },
    { id: "guides" as Page, label: "가이드 둘러보기", icon: BookOpen },
    { id: "studio" as Page, label: "상황 스튜디오", icon: FileText },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("home")}>
          <span className="brand-mark">
            <ListChecks size={25} />
          </span>
          LifeKit<span className="brand-dot">.</span>
        </button>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "studio" &&
                packs.some((p) => p.status === "draft") && (
                  <span className="nav-count">
                    {packs.filter((p) => p.status === "draft").length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <span>진행 중인 가이드</span>
          <button
            className="icon-button"
            aria-label="가이드 추가"
            onClick={() => setPage("guides")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="sidebar-runs">
          {runs
            .filter((r) => r.percent < 100)
            .map((r) => (
              <button
                key={r.id}
                className={`run-nav ${page === "run" && activeId === r.id ? "selected" : ""}`}
                onClick={() => openRun(r)}
              >
                <span className="small-dot" />
                {r.name}
                <span>{r.percent}%</span>
              </button>
            ))}
          {!runs.some((r) => r.percent < 100) && (
            <p className="sidebar-hint">
              나에게 맞는 가이드를
              <br />
              추가해 보세요.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />
            <div>
              <b>로컬 워크스페이스</b>
              <small>이 PC에 진행 기록 저장</small>
            </div>
            <LockKeyhole size={15} />
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings size={19} />
            설정 및 데이터
          </button>
          <div className="profile">
            <span className="avatar">나</span>
            <div>
              <b>나의 LifeKit</b>
              <small>한 단계씩, 나의 속도로</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            내 워크스페이스
            <ChevronRight size={14} />
            <span>
              {page === "home"
                ? "대시보드"
                : page === "guides"
                  ? "가이드"
                  : page === "studio"
                    ? "상황 스튜디오"
                    : page === "settings"
                      ? "설정"
                      : active?.name}
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span className="status-dot" />
              LOCAL
            </span>
            <span className="topbar-date">
              {new Date().toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
            <span className="avatar small">나</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="오류 메시지 닫기"
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              워크스페이스를 불러오는 중...
            </div>
          ) : (
            <>
              {page === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR NEXT CHAPTER</div>
                      <h1>복잡한 준비를, 한 단계씩.</h1>
                      <p>
                        해야 할 일을 정리하고, 오늘의 작은 진전을 만들어 보세요.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setPage("guides")}
                    >
                      <Plus size={18} />새 가이드 시작
                    </button>
                  </div>
                  <div className="hero-panel">
                    <div>
                      <Badge tone="green">
                        <Sparkles size={12} /> 나의 생활을 위한 실행 가이드
                      </Badge>
                      <h2>
                        새로운 시작에 필요한 것들,
                        <br />
                        LifeKit이 함께 정리해요.
                      </h2>
                      <p>
                        서버 실행 순서부터 지원 서류 제출까지.
                        <br />
                        준비부터 완료까지, 놓치는 단계 없이.
                      </p>
                      <button className="text-button" onClick={createSituation}>
                        내 상황 직접 만들기 <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="floating-note note-one">
                        <span className="art-check">
                          <Check size={18} />
                        </span>
                        <div>
                          <b>첫 번째 준비 완료</b>
                          <span className="art-line" />
                        </div>
                      </div>
                      <div className="floating-note note-two">
                        <span className="art-leaf">
                          <Leaf size={21} />
                        </span>
                        <div>
                          <b>나에게 필요한 단계만</b>
                          <span className="art-line short" />
                        </div>
                      </div>
                      <div className="art-spark">✦</div>
                      <div className="art-caption">A LITTLE MORE READY.</div>
                    </div>
                  </div>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <span className="stat-icon lavender">
                        <BookOpen size={21} />
                      </span>
                      <div>
                        <p>진행 중인 가이드</p>
                        <strong>
                          {runs.filter((r) => r.percent < 100).length}
                          <small>개</small>
                        </strong>
                      </div>
                    </div>
                    <div className="stat-card">
                      <span className="stat-icon green">
                        <ListChecks size={21} />
                      </span>
                      <div>
                        <p>지금 할 수 있는 작업</p>
                        <strong>
                          {ready}
                          <small>개</small>
                        </strong>
                      </div>
                      <Badge tone="green">준비 완료</Badge>
                    </div>
                    <div className="stat-card">
                      <span className="stat-icon peach">
                        <CheckCheck size={21} />
                      </span>
                      <div>
                        <p>완료한 작업</p>
                        <strong>
                          {completed}
                          <small>개</small>
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>
                      나의 가이드 <span>{runs.length}</span>
                    </h2>
                    <button
                      className="text-button muted"
                      onClick={() => setPage("guides")}
                    >
                      가이드 둘러보기
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {runs.length ? (
                    <div className="guide-grid">
                      {runs.map((run) => (
                        <button
                          className="run-card"
                          key={run.id}
                          onClick={() => openRun(run)}
                        >
                          <div className="card-top">
                            <span className="guide-icon">
                              <BookOpen size={24} />
                            </span>
                            <Badge
                              tone={run.percent === 100 ? "green" : "lavender"}
                            >
                              {run.percent === 100 ? "완료" : "진행 중"}
                            </Badge>
                          </div>
                          <span className="card-category">
                            {run.pack.category} · v{run.pack.version}
                          </span>
                          <h3>{run.name}</h3>
                          <p>
                            {run.plan.find((t) => t.status === "ready")
                              ?.title ||
                              (run.percent === 100
                                ? "모든 준비를 마쳤어요. 수고했어요!"
                                : "다음 단계를 확인해 보세요.")}
                          </p>
                          <div className="progress-label">
                            <span>
                              {run.completed} / {run.total} 작업 완료
                            </span>
                            <b>{run.percent}%</b>
                          </div>
                          <ProgressBar percent={run.percent} />
                          <div className="card-footer">
                            이어 진행하기
                            <ArrowUpRight size={18} />
                          </div>
                        </button>
                      ))}
                      <button
                        className="add-card"
                        onClick={() => setPage("guides")}
                      >
                        <span>
                          <Plus size={24} />
                        </span>
                        <b>다음 시작을 준비해 보세요</b>
                        <p>나에게 필요한 가이드 찾아보기</p>
                      </button>
                    </div>
                  ) : (
                    <Empty title="아직 시작한 가이드가 없어요">
                      <p>
                        서버 실행·서류 제출 상황을 선택하거나 내 상황을 직접
                        만들어 보세요.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setPage("guides")}
                      >
                        첫 가이드 시작하기
                        <ArrowRight size={16} />
                      </button>
                    </Empty>
                  )}
                  <div className="bottom-tip">
                    <span className="tip-icon">
                      <FileText size={21} />
                    </span>
                    <div>
                      <b>반복하는 작업의 순서가 기억나지 않나요?</b>
                      <p>
                        상황별 실행 순서와 제출할 목록을 한번 정리하고, 필요할
                        때 다시 시작하세요.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={createSituation}
                    >
                      상황 만들기
                      <Plus size={15} />
                    </button>
                  </div>
                </>
              )}
              {page === "guides" && (
                <GuideLibrary
                  records={published}
                  onStart={begin}
                  onStudio={createSituation}
                />
              )}
              {page === "run" && active && (
                <RunWorkspace
                  key={active.id}
                  run={active}
                  onRepeat={() => {
                    const record = packs.find(
                      (p) =>
                        p.pack.id === active.pack.id &&
                        p.pack.version === active.pack.version &&
                        p.status === "published",
                    );
                    if (record) {
                      begin(record);
                      setAnswers({ ...active.answers });
                      setRunName(active.name);
                    }
                  }}
                  busy={busy}
                  onChange={(taskId, body) =>
                    void action(async () => {
                      updateRun(await api.task(active.id, taskId, body));
                    })
                  }
                  onSource={() => showSource(active.pack)}
                  onBack={() => setPage("home")}
                  onUpgrade={() =>
                    void action(async () => {
                      const next = await api.upgrade(active.id);
                      if (next) {
                        setUpgrade(next);
                        setUpgradeAnswers({ ...active.answers });
                      } else setToast("이미 최신 배포 버전을 사용하고 있어요.");
                    })
                  }
                />
              )}
              {page === "studio" && (
                <Studio
                  packs={packs}
                  selectedId={studioId}
                  onSelect={setStudioId}
                  health={health}
                  busy={busy}
                  action={action}
                  onRecord={updatePack}
                  notify={setToast}
                  onSource={showSource}
                  autoCreate={createRequested}
                  onConsumeCreate={() => setCreateRequested(false)}
                />
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">MADE FOR YOUR DESKTOP</div>
                      <h1>내 PC, 내 워크스페이스.</h1>
                      <p>로컬 데이터와 AI 연결 상태를 확인하세요.</p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="panel">
                      <h2>
                        <LockKeyhole size={20} />
                        로컬 저장소
                      </h2>
                      <p>
                        가이드, 문서와 진행 기록은{" "}
                        <code>
                          {health?.dataLocation || "backend/data"}
                          /lifekit.sqlite
                        </code>
                        에 저장됩니다. 일반 기능은 인터넷 연결 없이 사용할 수
                        있습니다.
                      </p>
                      <div className="info-row">
                        <span>데이터베이스</span>
                        <Badge tone="green">SQLite · 연결됨</Badge>
                      </div>
                      <div className="info-row">
                        <span>접근 범위</span>
                        <b>이 PC의 로컬 주소</b>
                      </div>
                      <p className="help">
                        백업은 프로그램을 종료한 뒤 위 데이터 폴더 전체를
                        복사하세요. 복원은 종료 상태에서 같은 폴더로 교체합니다.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          downloadJSON(
                            {
                              exportedAt: new Date().toISOString(),
                              packs,
                              runs,
                            },
                            "lifekit-export.json",
                          )
                        }
                      >
                        <Download size={16} />
                        가이드·진행 기록 내보내기
                      </button>
                      <p className="help">
                        JSON 내보내기에는 PDF 원본이 포함되지 않습니다. 전체
                        복원에는 폴더 백업을 사용하세요.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>
                        <Sparkles size={20} />
                        AI 문서 분석
                      </h2>
                      <div className="info-row">
                        <span>현재 상태</span>
                        <Badge tone={health?.aiConfigured ? "green" : "gray"}>
                          {health?.aiConfigured ? "모델 설정됨" : "설정 전"}
                        </Badge>
                      </div>
                      <div className="info-row">
                        <span>모델</span>
                        <b>{health?.model || "미설정"}</b>
                      </div>
                      <p>
                        {health?.desktop
                          ? "상단 LifeKit 메뉴에서 ‘AI 설정 파일 위치 열기’를 선택하고 .env 파일에 모델의 주소·모델·API 키를 입력하세요. 저장 후 ‘설정 적용 후 앱 다시 시작’을 선택하세요."
                          : "backend/.env.example을 backend/.env로 복사한 뒤, 모델의 주소·모델·API 키를 입력하고 서버를 다시 시작하세요."}
                        <br />
                        <code>
                          {health?.configurationLocation || "backend/.env"}
                        </code>
                      </p>
                      <pre className="config-code">
                        AI_BASE_URL=https://api.openai.com/v1{"\n"}
                        AI_MODEL=사용할 모델명{"\n"}AI_API_KEY=발급받은 키
                      </pre>
                      <p className="help">
                        AI 분석을 선택하면 추출한 문서 텍스트를 설정한 모델로
                        전송합니다. Ollama의 로컬 모델도 연결할 수 있습니다.
                        키는 서버 환경 파일에서만 읽습니다.
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await refresh();
                            setToast("연결 상태를 새로 확인했습니다.");
                          })
                        }
                      >
                        <RefreshCw size={15} />
                        상태 새로고침
                      </button>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            LifeKit <span className="footer-dot">·</span> 작은 단계가 만드는
            새로운 시작
          </span>
          <span>LOCAL FIRST / OPEN SOURCE</span>
        </footer>
      </div>
      {startPack && (
        <Modal
          title="상황 실행 시작하기"
          onClose={() => {
            if (!busy) setStartPack(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const run = await api.createRun(
                  startPack.recordId,
                  runName,
                  answers,
                );
                updateRun(run);
                setStartPack(null);
                openRun(run);
                setToast("나에게 맞는 체크리스트를 만들었어요.");
              });
            }}
          >
            <div className="modal-intro">
              <Badge tone="lavender">{startPack.pack.category}</Badge>
              <h3>{startPack.pack.title}</h3>
              <p>
                {startPack.pack.questions.length
                  ? "질문에 답하면 이번 상황에 필요한 작업만 구성해 드려요."
                  : "이번 실행의 이름을 정하고 시작하세요. 이전 실행 기록은 그대로 유지됩니다."}
              </p>
            </div>
            <label className="field">
              <span>이번 실행 이름</span>
              <input
                required
                maxLength={100}
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
              />
            </label>
            {startPack.pack.questions.length > 0 && (
              <Questions
                pack={startPack.pack}
                answers={answers}
                onChange={setAnswers}
              />
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setStartPack(null)}
              >
                취소
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}
                체크리스트 만들기
              </button>
            </div>
          </form>
        </Modal>
      )}
      {document && (
        <Modal wide title={document.name} onClose={() => setDocument(null)}>
          <div className="source-toolbar">
            <span>추출 원문 · {document.pages.length}페이지</span>
            {document.hasPDF && (
              <a
                className="button secondary"
                href={`/api/documents/${document.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                원본 PDF 열기
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div className="source-pages">
            {document.pages.map((p) => (
              <article key={p.page}>
                <Badge>PAGE {p.page}</Badge>
                <p>
                  {p.text || "이 페이지에는 추출 가능한 텍스트가 없습니다."}
                </p>
              </article>
            ))}
          </div>
        </Modal>
      )}
      {upgrade && active && (
        <Modal
          title={`가이드 v${upgrade.record.pack.version} 변경 확인`}
          onClose={() => {
            if (!busy) setUpgrade(null);
          }}
        >
          <p className="help">
            새 버전을 적용하면 변경된 작업과 후속 작업은 다시 확인하도록 완료
            상태가 초기화됩니다. 기존 버전은 적용 전까지 유지됩니다.
          </p>
          <DiffView before={active.pack} after={upgrade.record.pack} />
          {upgrade.diff.questionsChanged && (
            <>
              <h3>새 버전의 조건 확인</h3>
              <Questions
                pack={upgrade.record.pack}
                answers={upgradeAnswers}
                onChange={setUpgradeAnswers}
              />
            </>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setUpgrade(null)}
            >
              기존 버전 유지
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  updateRun(
                    await api.applyUpgrade(
                      active.id,
                      upgrade.record.recordId,
                      upgradeAnswers,
                    ),
                  );
                  setUpgrade(null);
                  setToast("새 버전을 적용했습니다. 변경된 작업을 확인하세요.");
                })
              }
            >
              새 버전 적용
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle className="spin" size={16} />
          처리 중…
        </div>
      )}
    </div>
  );
}

function GuideLibrary({
  records,
  onStart,
  onStudio,
}: {
  records: PackRecord[];
  onStart: (r: PackRecord) => void;
  onStudio: () => void;
}) {
  const [search, setSearch] = useState("");
  const results = records.filter((r) =>
    `${r.pack.title} ${r.pack.description} ${r.pack.category}`.includes(search),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIND YOUR NEXT STEP</div>
          <h1>지금 어떤 상황인가요?</h1>
          <p>
            상황을 선택해 필요한 순서를 따라가거나 제출한 항목을 체크하세요.
          </p>
        </div>
        <button className="button secondary" onClick={onStudio}>
          <Plus size={17} />내 상황 만들기
        </button>
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="가이드 검색"
            placeholder="가이드 이름 또는 키워드 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{results.length}개의 가이드</span>
      </div>
      <div className="guide-grid">
        {results.map((r) => (
          <article className="library-card" key={r.recordId}>
            <div className="library-cover">
              <BookOpen size={45} />
              <span>{r.pack.category}</span>
              <div className="cover-circle" />
            </div>
            <div className="library-body">
              <div className="card-category">
                {r.pack.category} · VERSION {r.pack.version}
              </div>
              <h3>{r.pack.title}</h3>
              <Badge tone="lavender">
                {r.pack.executionMode === "ordered" ||
                (!r.pack.executionMode &&
                  r.pack.tasks.some((t) => t.dependsOn.length > 0))
                  ? "순서대로 따라가기"
                  : "자유롭게 체크하기"}
              </Badge>
              <p>{r.pack.description}</p>
              <div className="library-meta">
                <span>
                  <ListChecks size={15} />
                  {r.pack.tasks.length}개 전체 작업
                </span>
                <span>
                  <GitBranch size={15} />
                  {r.pack.questions.length}개 맞춤 질문
                </span>
              </div>
              <button
                className="button primary full"
                onClick={() => onStart(r)}
              >
                이 상황 시작하기
                <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!results.length && (
        <Empty title="검색 결과가 없어요">
          <p>다른 검색어를 입력하거나 상황 스튜디오에서 직접 만들어 보세요.</p>
        </Empty>
      )}
      <p className="help library-note">
        기본 신입생 가이드는 기능 체험용 예제입니다. 실제 일정과 준비 사항은
        소속 기관의 안내를 확인하세요.
      </p>
    </>
  );
}

function RunWorkspace({
  run,
  busy,
  onChange,
  onSource,
  onBack,
  onUpgrade,
  onRepeat,
}: {
  run: RunView;
  busy: boolean;
  onChange: (id: string, body: unknown) => void;
  onSource: () => void;
  onBack: () => void;
  onUpgrade: () => void;
  onRepeat: () => void;
}) {
  const [selected, setSelected] = useState(run.plan[0]?.id),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("list"),
    [note, setNote] = useState(""),
    [dueDate, setDueDate] = useState("");
  const task = run.plan.find((t) => t.id === selected);
  useEffect(() => {
    setNote(task ? run.progress[task.id]?.note || "" : "");
    setDueDate(task?.effectiveDueDate || "");
  }, [selected, run.updatedAt]);
  const visible = run.plan.filter(
    (t) => filter === "all" || t.status === filter,
  );
  const sections = [...new Set(visible.map((t) => t.section))];
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={16} />내 대시보드
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {run.pack.category.toUpperCase()} / VERSION {run.pack.version}
          </div>
          <h1>{run.name}</h1>
          <p>{run.pack.description}</p>
        </div>
        <div className="button-group">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onRepeat}
          >
            <RefreshCw size={16} />새 실행 시작
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onUpgrade}
          >
            <GitBranch size={16} />
            버전 확인
          </button>
        </div>
      </div>
      <div className="run-summary panel">
        <span className="stat-icon green">
          <ListChecks size={25} />
        </span>
        <div className="summary-progress">
          <div className="progress-label">
            <b>
              {run.percent === 100
                ? "모든 준비를 완료했어요!"
                : "나의 준비 현황"}
            </b>
            <span>
              {run.completed} / {run.total} 작업 완료{" "}
              <strong>{run.percent}%</strong>
            </span>
          </div>
          <ProgressBar percent={run.percent} />
        </div>
        <span className="ready-count">
          <span className="status-dot" />
          {run.plan.filter((t) => t.status === "ready").length}개 작업 진행 가능
        </span>
      </div>
      <div className="workspace-grid">
        <section className="checklist-panel panel">
          <div className="checklist-toolbar">
            <div className="segmented">
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                <ListChecks size={15} />
                체크리스트
              </button>
              <button
                className={view === "flow" ? "active" : ""}
                onClick={() => setView("flow")}
              >
                <GitBranch size={15} />
                절차 흐름
              </button>
            </div>
            <select
              aria-label="작업 상태 필터"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">전체 작업</option>
              <option value="ready">진행 가능</option>
              <option value="blocked">대기 중</option>
              <option value="done">완료</option>
            </select>
          </div>
          {view === "flow" ? (
            <Flow plan={run.plan} onSelect={setSelected} />
          ) : (
            <div className="task-list">
              {sections.map((section) => (
                <div className="task-section" key={section}>
                  <h3>
                    {section}
                    <span>
                      {
                        visible.filter(
                          (t) => t.section === section && t.status === "done",
                        ).length
                      }{" "}
                      / {visible.filter((t) => t.section === section).length}
                    </span>
                  </h3>
                  {visible
                    .filter((t) => t.section === section)
                    .map((t) => (
                      <div
                        className={`task-row ${selected === t.id ? "selected" : ""} ${t.status === "done" ? "complete" : ""}`}
                        key={t.id}
                      >
                        <button
                          className={`task-check ${t.status}`}
                          aria-label={`${t.title} ${t.status === "done" ? `${t.completionLabel || "완료"} 취소` : t.completionLabel === "제출" ? "제출 완료 처리" : "완료 처리"}`}
                          disabled={busy || t.status === "blocked"}
                          onClick={() =>
                            onChange(t.id, { done: t.status !== "done" })
                          }
                        >
                          {t.status === "done" ? (
                            <Check size={15} />
                          ) : t.status === "blocked" ? (
                            <LockKeyhole size={13} />
                          ) : null}
                        </button>
                        <button
                          className="task-main"
                          onClick={() => setSelected(t.id)}
                        >
                          <b>{t.title}</b>
                          <span>
                            {t.status === "blocked"
                              ? "선행 작업 완료 후 진행"
                              : t.status === "done"
                                ? t.completionLabel === "제출"
                                  ? "제출 완료"
                                  : "완료한 작업"
                                : "지금 진행할 수 있어요"}
                            {t.effectiveDueDate && (
                              <small
                                className={
                                  t.effectiveDueDate < today() &&
                                  t.status !== "done"
                                    ? "overdue"
                                    : ""
                                }
                              >
                                <CalendarDays size={12} />
                                {dateLabel(t.effectiveDueDate)}
                              </small>
                            )}
                          </span>
                        </button>
                        <ChevronRight size={15} />
                      </div>
                    ))}
                </div>
              ))}
              {!visible.length && (
                <Empty title="이 상태의 작업이 없어요">
                  <p>다른 상태를 선택해 보세요.</p>
                </Empty>
              )}
            </div>
          )}
        </section>
        <aside className="task-detail panel">
          {task ? (
            <>
              <div className="detail-top">
                <Badge
                  tone={
                    task.status === "done"
                      ? "green"
                      : task.status === "ready"
                        ? "lavender"
                        : "gray"
                  }
                >
                  {task.status === "done"
                    ? task.completionLabel === "제출"
                      ? "제출 완료"
                      : "완료"
                    : task.status === "ready"
                      ? "진행 가능"
                      : "선행 작업 대기"}
                </Badge>
                <span>{task.section}</span>
              </div>
              <h2>{task.title}</h2>
              <p className="task-description">
                {task.description || "추가 안내가 없습니다."}
              </p>
              {!!task.preparations.length && (
                <div className="detail-section">
                  <h4>준비할 것</h4>
                  <ul>
                    {task.preparations.map((p, i) => (
                      <li key={i}>
                        <Circle size={10} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!task.dependsOn.length && (
                <div className="detail-section">
                  <h4>
                    <GitBranch size={14} />
                    선행 작업
                  </h4>
                  {task.dependsOn.map((id) => {
                    const dep = run.plan.find((t) => t.id === id);
                    return (
                      <div className="dependency" key={id}>
                        {dep?.status === "done" ? (
                          <Check size={14} />
                        ) : (
                          <Clock3 size={14} />
                        )}
                        <span>
                          {run.pack.tasks.find((t) => t.id === id)?.title}
                        </span>
                        <small>
                          {!dep
                            ? "내 조건에서 제외"
                            : dep.status === "done"
                              ? "완료"
                              : "미완료"}
                        </small>
                      </div>
                    );
                  })}
                </div>
              )}
              {task.sources.length > 0 && (
                <div className="detail-section">
                  <h4>
                    <FileText size={14} />
                    원문 근거
                  </h4>
                  {task.sources.length ? (
                    task.sources.map((s, i) => (
                      <blockquote key={i}>
                        <span>PAGE {s.page}</span>
                        {s.quote}
                      </blockquote>
                    ))
                  ) : (
                    <p className="help">연결된 원문 근거가 없습니다.</p>
                  )}
                  <button className="text-button" onClick={onSource}>
                    전체 문서 확인
                    <ExternalLink size={13} />
                  </button>
                </div>
              )}
              <div className="detail-section">
                <label className="field">
                  <span>
                    <CalendarDays size={14} />
                    나의 목표 날짜
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>메모</span>
                  <textarea
                    rows={3}
                    maxLength={4000}
                    placeholder="준비하면서 기억할 내용을 적어 두세요."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  className="button secondary full"
                  disabled={busy}
                  onClick={() =>
                    onChange(task.id, { note, dueDate: dueDate || null })
                  }
                >
                  <Save size={15} />
                  날짜·메모 저장
                </button>
              </div>
              <button
                className="button primary full"
                disabled={busy || task.status === "blocked"}
                onClick={() =>
                  onChange(task.id, { done: task.status !== "done" })
                }
              >
                {task.status === "done" ? (
                  <RefreshCw size={16} />
                ) : (
                  <Check size={16} />
                )}{" "}
                {task.status === "done"
                  ? `${task.completionLabel || "완료"} 취소`
                  : task.status === "blocked"
                    ? "선행 작업을 먼저 완료하세요"
                    : task.completionLabel === "제출"
                      ? "제출 완료로 표시"
                      : "이 작업 완료하기"}
              </button>
              {task.status === "done" && (
                <p className="help">
                  완료를 취소하면 후속 작업도 다시 확인 상태가 됩니다.
                </p>
              )}
            </>
          ) : (
            <Empty title="작업을 선택하세요">
              <p>작업별 안내와 원문을 확인할 수 있어요.</p>
            </Empty>
          )}
        </aside>
      </div>
    </>
  );
}

function Flow({
  plan,
  onSelect,
}: {
  plan: TaskState[];
  onSelect: (id: string) => void;
}) {
  const levels = new Map<string, number>();
  for (const task of plan)
    levels.set(
      task.id,
      Math.max(0, ...task.dependsOn.map((id) => (levels.get(id) ?? -1) + 1)),
    );
  const perLevel = new Map<number, number>();
  const nodes = plan.map((t) => {
    const level = levels.get(t.id)!;
    const row = perLevel.get(level) ?? 0;
    perLevel.set(level, row + 1);
    return {
      id: t.id,
      data: {
        label: `${t.status === "done" ? "✓ " : t.status === "blocked" ? "◷ " : ""}${t.title}`,
      },
      position: { x: level * 260, y: row * 110 },
      style: {
        background: t.status === "done" ? "#eff7ef" : "#fff",
        border: `1px solid ${t.status === "done" ? "#91b69a" : "#dadce5"}`,
        borderRadius: 12,
        width: 220,
        padding: 15,
        fontSize: 13,
      },
    };
  });
  const edges = plan.flatMap((t) =>
    t.dependsOn
      .filter((id) => plan.some((p) => p.id === id))
      .map((id) => ({
        id: `${id}-${t.id}`,
        source: id,
        target: t.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a7aab8" },
      })),
  );
  return (
    <div className="flow-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelect(node.id)}
      >
        <Background color="#dedee5" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function DiffView({ before, after }: { before: Pack; after: Pack }) {
  const diff = diffPacks(before, after);
  return (
    <div className="diff-list">
      {[
        { label: "추가", tasks: diff.added, tone: "green" },
        { label: "삭제", tasks: diff.removed, tone: "peach" },
        { label: "수정", tasks: diff.changed, tone: "lavender" },
      ].map((group) => (
        <div key={group.label}>
          <Badge tone={group.tone}>
            {group.label} {group.tasks.length}
          </Badge>
          {group.tasks.map((t) => (
            <p key={t.id}>{t.title}</p>
          ))}
        </div>
      ))}
      {diff.questionsChanged && (
        <p className="help">사용자 조건 질문이 변경되었습니다.</p>
      )}
      {before.title !== after.title && (
        <p className="help">
          가이드 제목 변경: {before.title} → {after.title}
        </p>
      )}
      {before.description !== after.description && (
        <p className="help">가이드 설명이 변경되었습니다.</p>
      )}
    </div>
  );
}

function Studio({
  packs,
  selectedId,
  onSelect,
  health,
  busy,
  action,
  onRecord,
  notify,
  onSource,
  autoCreate,
  onConsumeCreate,
}: {
  packs: PackRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  health: Health | null;
  busy: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
  onRecord: (r: PackRecord) => void;
  notify: (s: string) => void;
  onSource: (p: Pack) => void;
  autoCreate: boolean;
  onConsumeCreate: () => void;
}) {
  const record = packs.find((p) => p.recordId === selectedId) || packs[0];
  const [working, setWorking] = useState<Pack | null>(record?.pack ?? null),
    [json, setJson] = useState(""),
    [mode, setMode] = useState("visual"),
    [tab, setTab] = useState("editor"),
    [uploadOpen, setUploadOpen] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [ai, setAI] = useState(false);
  useEffect(() => {
    if (autoCreate) {
      setCreateOpen(true);
      onConsumeCreate();
    }
  }, [autoCreate, onConsumeCreate]);
  useEffect(() => {
    setWorking(record?.pack ?? null);
    setJson(JSON.stringify(record?.pack, null, 2));
    setMode("visual");
    setTab("editor");
  }, [record?.recordId, record?.pack]);
  const readonly = record?.status === "published";
  const previous =
    record &&
    packs
      .filter(
        (p) =>
          p.pack.id === record.pack.id && p.pack.version < record.pack.version,
      )
      .sort((a, b) => b.pack.version - a.pack.version)[0];
  const save = async () => {
    if (!record || !working) return;
    const pack = validatePack(mode === "json" ? JSON.parse(json) : working);
    onRecord(await api.save(record.recordId, pack));
    notify("초안을 저장했습니다.");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR SITUATION, YOUR STEPS</div>
          <h1>내 상황을 실행 가능한 가이드로.</h1>
          <p>직접 순서와 목록을 만들거나, PDF를 가져와 초안으로 시작하세요.</p>
        </div>
        <div className="button-group">
          <label className="button secondary file-label">
            <Download size={16} />
            JSON 가져오기
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void action(async () => {
                    if (f.size > 2 * 1024 * 1024)
                      throw new Error("JSON 파일은 2MB 이하만 지원합니다.");
                    onRecord(await api.import(JSON.parse(await f.text())));
                    notify("JSON을 새 초안으로 가져왔습니다.");
                  });
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="button secondary"
            onClick={() => setUploadOpen(true)}
          >
            <Plus size={16} />
            PDF로 만들기
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} />
            직접 작성
          </button>
        </div>
      </div>
      <div className="studio-grid">
        <aside className="panel studio-sidebar">
          <div className="studio-sidebar-head">
            <b>상황 가이드</b>
            <span>{packs.length}</span>
          </div>
          {packs.map((p) => (
            <button
              disabled={busy}
              key={p.recordId}
              className={`document-item ${record?.recordId === p.recordId ? "active" : ""}`}
              onClick={() => onSelect(p.recordId)}
            >
              <FileText size={18} />
              <div>
                <b>{p.pack.title}</b>
                <span>
                  v{p.pack.version} · {p.method}
                </span>
              </div>
              <span className={`document-status ${p.status}`} />
            </button>
          ))}
          <div className="studio-help">
            <Sparkles size={20} />
            <b>내가 기억할 순서를 정리해요.</b>
            <p>
              문서 없이 만들 수 있어요. 순서·조건·제출 항목을 직접 정하고 필요할
              때 다시 실행하세요.
            </p>
          </div>
        </aside>
        <section className="panel studio-editor">
          {record && working ? (
            <>
              <div className="editor-header">
                <div>
                  <Badge tone={readonly ? "green" : "lavender"}>
                    {readonly ? "사용 가능" : "검토 중인 초안"}
                  </Badge>
                  <span className="editor-version">
                    VERSION {record.pack.version}
                  </span>
                  <h2>{record.pack.title}</h2>
                </div>
                <div className="button-group">
                  <button
                    className="icon-button"
                    aria-label="Scenario Pack 내보내기"
                    onClick={() =>
                      downloadJSON(
                        record.pack,
                        `${record.pack.id}-v${record.pack.version}.json`,
                      )
                    }
                  >
                    <Download size={18} />
                  </button>
                  {readonly ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          onRecord(await api.revise(record.recordId));
                          notify("편집할 새 버전을 만들었습니다.");
                        })
                      }
                    >
                      <Pencil size={15} />새 버전 만들기
                    </button>
                  ) : (
                    <>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void action(save)}
                      >
                        <Save size={15} />
                        저장
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const pack = validatePack(
                              mode === "json" ? JSON.parse(json) : working,
                            );
                            await api.save(record.recordId, pack);
                            onRecord(await api.publish(record.recordId));
                            notify(
                              "가이드를 사용할 수 있도록 확정했습니다. 상황 목록에서 시작하세요.",
                            );
                          })
                        }
                      >
                        <Check size={15} />
                        검토 완료·사용 확정
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="editor-tabs">
                <button
                  className={tab === "editor" ? "active" : ""}
                  onClick={() => setTab("editor")}
                >
                  작업 및 조건
                </button>
                <button
                  className={tab === "diff" ? "active" : ""}
                  onClick={() => setTab("diff")}
                >
                  버전 비교
                </button>
                {record.documentId && (
                  <button onClick={() => onSource(record.pack)}>
                    원문 보기
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
              {tab === "diff" ? (
                <div className="editor-content">
                  {previous ? (
                    <>
                      <p className="help">
                        v{previous.pack.version} → v{working.version}
                      </p>
                      <DiffView before={previous.pack} after={working} />
                    </>
                  ) : (
                    <Empty title="첫 번째 버전이에요">
                      <p>
                        새 버전을 만들면 추가·삭제·수정된 작업을 비교할 수
                        있어요.
                      </p>
                    </Empty>
                  )}
                </div>
              ) : (
                <div className="editor-content">
                  <div className="editor-mode">
                    <span>
                      {working.tasks.length}개 작업 · {working.questions.length}
                      개 조건 질문
                    </span>
                    <div className="segmented">
                      <button
                        className={mode === "visual" ? "active" : ""}
                        onClick={() => {
                          if (mode === "json") {
                            try {
                              setWorking(validatePack(JSON.parse(json)));
                              setMode("visual");
                            } catch (e) {
                              notify(
                                e instanceof Error
                                  ? e.message
                                  : "JSON을 확인하세요.",
                              );
                            }
                          }
                        }}
                      >
                        시각 편집
                      </button>
                      <button
                        className={mode === "json" ? "active" : ""}
                        onClick={() => {
                          setJson(JSON.stringify(working, null, 2));
                          setMode("json");
                        }}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  {mode === "json" ? (
                    <>
                      <p className="help">
                        ID는 영문 소문자·숫자·하이픈·밑줄을 사용하세요. 기존
                        작업의 ID를 유지해야 버전 비교 시 동일한 작업으로
                        인식합니다.
                      </p>
                      <textarea
                        className="json-editor"
                        spellCheck={false}
                        aria-label="Scenario Pack JSON"
                        readOnly={readonly}
                        value={json}
                        onChange={(e) => setJson(e.target.value)}
                      />
                    </>
                  ) : (
                    <div className="visual-editor">
                      <fieldset
                        disabled={readonly || busy}
                        className="visual-editor"
                      >
                        <div className="form-columns">
                          <label className="field">
                            <span>가이드 제목</span>
                            <input
                              maxLength={200}
                              value={working.title}
                              onChange={(e) =>
                                setWorking({
                                  ...working,
                                  title: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>카테고리</span>
                            <input
                              value={working.category}
                              onChange={(e) =>
                                setWorking({
                                  ...working,
                                  category: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="field">
                          <span>가이드 설명</span>
                          <textarea
                            value={working.description}
                            onChange={(e) =>
                              setWorking({
                                ...working,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <QuestionEditor pack={working} onChange={setWorking} />
                        <div className="section-heading">
                          <h3>작업 검토</h3>
                          <button
                            className="text-button"
                            onClick={() =>
                              setWorking({
                                ...working,
                                tasks: [
                                  ...working.tasks,
                                  {
                                    id: `task-${Date.now().toString(36)}`,
                                    title: "새 작업",
                                    description: "",
                                    section: "기본 절차",
                                    preparations: [],
                                    dependsOn:
                                      working.executionMode === "ordered" &&
                                      working.tasks.length
                                        ? [
                                            working.tasks[
                                              working.tasks.length - 1
                                            ].id,
                                          ]
                                        : [],
                                    when: [],
                                    sources: [],
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={16} />
                            작업 추가
                          </button>
                        </div>
                      </fieldset>
                      {readonly && (
                        <p className="help">
                          사용 중인 가이드는 읽기 전용입니다. 각 작업을 펼쳐
                          확인하거나 새 버전을 만들어 수정하세요.
                        </p>
                      )}
                      {working.tasks.map((task, i) => (
                        <TaskEditor
                          key={task.id}
                          hasDocument={Boolean(record.documentId)}
                          readOnly={readonly || busy}
                          task={task}
                          index={i}
                          pack={working}
                          onChange={(next) =>
                            setWorking({
                              ...working,
                              tasks: working.tasks.map((t) =>
                                t.id === task.id ? next : t,
                              ),
                            })
                          }
                          onRemove={() =>
                            setWorking({
                              ...working,
                              tasks: working.tasks
                                .filter((t) => t.id !== task.id)
                                .map((t) => ({
                                  ...t,
                                  dependsOn: t.dependsOn.filter(
                                    (id) => id !== task.id,
                                  ),
                                })),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <Empty title="내 상황을 만들어 보세요">
              <p>직접 작성하거나 예제·PDF·Scenario Pack JSON으로 시작하세요.</p>
            </Empty>
          )}
        </section>
      </div>
      {createOpen && (
        <Modal
          title="내 상황 직접 만들기"
          onClose={() => {
            if (!busy) setCreateOpen(false);
          }}
        >
          <ScenarioCreator
            busy={busy}
            onClose={() => setCreateOpen(false)}
            onCreate={(pack) =>
              void action(async () => {
                onRecord(await api.createScenario(pack));
                setCreateOpen(false);
                notify(
                  "상황 초안을 만들었어요. 필요한 내용을 수정하고 사용을 확정하세요.",
                );
              })
            }
          />
        </Modal>
      )}
      {uploadOpen && (
        <Modal
          title="PDF에서 새 가이드 만들기"
          onClose={() => {
            if (!busy) setUploadOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                if (!file) throw new Error("PDF 파일을 선택하세요.");
                const form = new FormData();
                form.append("file", file);
                form.append("title", title);
                form.append("mode", ai ? "ai" : "manual");
                onRecord(await api.upload(form));
                setUploadOpen(false);
                setFile(null);
                setTitle("");
                notify("초안이 준비되었습니다. 원문을 보며 검토하세요.");
              });
            }}
          >
            <p className="help">
              텍스트가 포함된 PDF · 최대 10MB / 50페이지. 스캔 문서는 OCR이
              필요합니다.
            </p>
            <label className="upload-zone">
              <Upload size={30} />
              <b>{file?.name || "PDF 파일을 선택하세요"}</b>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : "클릭해서 파일 찾아보기"}
              </span>
              <input
                required
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                  if (next) setTitle(next.name.replace(/\.pdf$/i, ""));
                }}
              />
            </label>
            <label className="field">
              <span>가이드 이름</span>
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ai}
                disabled={!health?.aiConfigured || busy}
                onChange={(e) => setAI(e.target.checked)}
              />
              <div>
                <b>AI로 작업·조건·선행 관계 추출</b>
                <p>
                  {health?.aiConfigured
                    ? `설정한 모델 ${health.model}로 문서 텍스트를 전송합니다.`
                    : "AI가 설정되지 않았습니다. 페이지별 수동 초안으로 생성합니다."}
                </p>
              </div>
            </label>
            <p className="help">
              수동 초안은 페이지별 원문을 담습니다. 자동 절차 분석은 수행하지
              않으며 검토 화면에서 직접 정리할 수 있습니다.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setUploadOpen(false)}
              >
                취소
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                초안 만들기
              </button>
            </div>
            {busy && (
              <p className="help">
                AI 분석은 최대 90초 정도 걸릴 수 있어요. 문서를 처리하고
                있습니다.
              </p>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

function QuestionEditor({
  pack,
  onChange,
}: {
  pack: Pack;
  onChange: (p: Pack) => void;
}) {
  return (
    <div className="question-editor">
      <div className="section-heading">
        <h3>맞춤 조건 질문</h3>
        <button
          className="text-button"
          onClick={() =>
            onChange({
              ...pack,
              questions: [
                ...pack.questions,
                {
                  id: `question-${Date.now().toString(36)}`,
                  label: "새 질문",
                  type: "boolean",
                  options: [],
                },
              ],
            })
          }
        >
          <Plus size={15} />
          질문 추가
        </button>
      </div>
      {pack.questions.map((q) => (
        <div className="question-edit-row" key={q.id}>
          <div className="form-columns">
            <label className="field">
              <span>질문 · {q.id}</span>
              <input
                value={q.label}
                onChange={(e) =>
                  onChange({
                    ...pack,
                    questions: pack.questions.map((p) =>
                      p.id === q.id ? { ...p, label: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>답변 형식</span>
              <select
                value={q.type}
                onChange={(e) =>
                  onChange({
                    ...pack,
                    questions: pack.questions.map((p) =>
                      p.id === q.id
                        ? {
                            ...p,
                            type: e.target.value as typeof q.type,
                            options:
                              e.target.value === "select"
                                ? [{ label: "선택 1", value: "option-1" }]
                                : [],
                          }
                        : p,
                    ),
                  })
                }
              >
                <option value="boolean">예 / 아니요</option>
                <option value="select">선택형</option>
                <option value="text">직접 입력</option>
              </select>
            </label>
          </div>
          {q.type === "select" && (
            <label className="field">
              <span>선택지 · 줄마다 표시명=값 (예: 기숙사=dorm)</span>
              <textarea
                value={q.options.map((o) => `${o.label}=${o.value}`).join("\n")}
                onChange={(e) =>
                  onChange({
                    ...pack,
                    questions: pack.questions.map((p) =>
                      p.id === q.id
                        ? {
                            ...p,
                            options: e.target.value.split("\n").map((line) => {
                              const index = line.indexOf("=");
                              return index < 0
                                ? { label: line, value: line }
                                : {
                                    label: line.slice(0, index),
                                    value: line.slice(index + 1),
                                  };
                            }),
                          }
                        : p,
                    ),
                  })
                }
              />
            </label>
          )}
          <button
            className="text-button danger"
            onClick={() =>
              onChange({
                ...pack,
                questions: pack.questions.filter((p) => p.id !== q.id),
                tasks: pack.tasks.map((t) => ({
                  ...t,
                  when: t.when.filter((w) => w.questionId !== q.id),
                })),
              })
            }
          >
            <Trash2 size={13} />
            질문 삭제
          </button>
        </div>
      ))}
      {!pack.questions.length && (
        <p className="help">
          질문이 없으면 모든 사용자가 같은 절차로 시작합니다.
        </p>
      )}
    </div>
  );
}

function TaskEditor({
  task,
  index,
  pack,
  onChange,
  onRemove,
  readOnly,
  hasDocument,
}: {
  task: Task;
  index: number;
  pack: Pack;
  onChange: (t: Task) => void;
  onRemove: () => void;
  readOnly: boolean;
  hasDocument: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  return (
    <article className="task-editor">
      <div className="task-editor-head">
        <button className="task-expand" onClick={() => setExpanded(!expanded)}>
          <span className="task-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <b>{task.title || "작업 제목을 입력하세요"}</b>
          <Badge>{task.section}</Badge>
          <ChevronRight size={16} className={expanded ? "rotated" : ""} />
        </button>
        <button
          className="icon-button danger"
          aria-label={`${task.title} 삭제`}
          onClick={onRemove}
          disabled={readOnly}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && (
        <fieldset className="task-editor-body" disabled={readOnly}>
          <div className="help">작업 ID: {task.id}</div>
          <label className="field">
            <span>체크할 때 표시할 말</span>
            <select
              value={task.completionLabel || "완료"}
              onChange={(e) =>
                onChange({
                  ...task,
                  completionLabel: e.target.value as "완료" | "제출",
                })
              }
            >
              <option value="완료">완료</option>
              <option value="제출">제출 완료</option>
            </select>
          </label>
          <div className="form-columns">
            <label className="field">
              <span>작업명</span>
              <input
                maxLength={200}
                value={task.title}
                onChange={(e) => onChange({ ...task, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>단계 / 구분</span>
              <input
                value={task.section}
                onChange={(e) => onChange({ ...task, section: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>상세 안내</span>
            <textarea
              rows={4}
              value={task.description}
              onChange={(e) =>
                onChange({ ...task, description: e.target.value })
              }
            />
          </label>
          <div className="form-columns">
            <label className="field">
              <span>준비 사항 · 줄마다 하나씩</span>
              <textarea
                value={task.preparations.join("\n")}
                onChange={(e) =>
                  onChange({
                    ...task,
                    preparations: e.target.value
                      ? e.target.value.split("\n")
                      : [],
                  })
                }
              />
            </label>
            <label className="field">
              <span>원문에 명시된 마감일</span>
              <input
                type="date"
                value={task.dueDate || ""}
                onChange={(e) =>
                  onChange({ ...task, dueDate: e.target.value || undefined })
                }
              />
            </label>
          </div>
          <label className="field">
            <span>선행 작업 · 조건에서 제외된 작업은 충족된 것으로 처리</span>
            <select
              multiple
              value={task.dependsOn}
              onChange={(e) =>
                onChange({
                  ...task,
                  dependsOn: Array.from(
                    e.target.selectedOptions,
                    (o) => o.value,
                  ),
                })
              }
            >
              {pack.tasks
                .filter((t) => t.id !== task.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <small>Ctrl 키로 여러 작업을 선택하거나 해제할 수 있습니다.</small>
          </label>
          <div className="detail-section">
            <h4>포함 조건 · 모두 일치할 때 포함</h4>
            {task.when.map((rule, i) => {
              const q = pack.questions.find((q) => q.id === rule.questionId);
              return (
                <div className="rule-row" key={i}>
                  <select
                    aria-label="조건 질문"
                    value={rule.questionId}
                    onChange={(e) => {
                      const next = pack.questions.find(
                        (q) => q.id === e.target.value,
                      )!;
                      onChange({
                        ...task,
                        when: task.when.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                questionId: next.id,
                                value:
                                  next.type === "boolean"
                                    ? true
                                    : next.options[0]?.value || "",
                              }
                            : r,
                        ),
                      });
                    }}
                  >
                    {pack.questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="조건 비교"
                    value={rule.operator}
                    onChange={(e) =>
                      onChange({
                        ...task,
                        when: task.when.map((r, j) =>
                          j === i
                            ? { ...r, operator: e.target.value as "eq" | "ne" }
                            : r,
                        ),
                      })
                    }
                  >
                    <option value="eq">같음</option>
                    <option value="ne">다름</option>
                  </select>
                  {q?.type === "text" ? (
                    <input
                      aria-label="조건 값"
                      value={String(rule.value)}
                      onChange={(e) =>
                        onChange({
                          ...task,
                          when: task.when.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  ) : (
                    <select
                      aria-label="조건 값"
                      value={String(rule.value)}
                      onChange={(e) =>
                        onChange({
                          ...task,
                          when: task.when.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  value:
                                    q?.type === "boolean"
                                      ? e.target.value === "true"
                                      : e.target.value,
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      {q?.type === "boolean" ? (
                        <>
                          <option value="true">네</option>
                          <option value="false">아니요</option>
                        </>
                      ) : (
                        q?.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                  <button
                    className="icon-button danger"
                    aria-label="조건 삭제"
                    onClick={() =>
                      onChange({
                        ...task,
                        when: task.when.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
            <button
              className="text-button"
              disabled={!pack.questions.length}
              onClick={() => {
                const q = pack.questions[0];
                onChange({
                  ...task,
                  when: [
                    ...task.when,
                    {
                      questionId: q.id,
                      operator: "eq",
                      value:
                        q.type === "boolean" ? true : q.options[0]?.value || "",
                    },
                  ],
                });
              }}
            >
              <Plus size={13} />
              조건 추가
            </button>
          </div>
          {(hasDocument || task.sources.length > 0) && (
            <div className="detail-section">
              <h4>원문 근거</h4>
              {task.sources.map((s, i) => (
                <div className="source-editor" key={i}>
                  <label className="field">
                    <span>페이지</span>
                    <input
                      type="number"
                      min={1}
                      value={s.page}
                      onChange={(e) =>
                        onChange({
                          ...task,
                          sources: task.sources.map((p, j) =>
                            j === i
                              ? { ...p, page: Number(e.target.value) }
                              : p,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>정확한 원문 인용</span>
                    <textarea
                      value={s.quote}
                      onChange={(e) =>
                        onChange({
                          ...task,
                          sources: task.sources.map((p, j) =>
                            j === i ? { ...p, quote: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="icon-button danger"
                    aria-label="근거 삭제"
                    onClick={() =>
                      onChange({
                        ...task,
                        sources: task.sources.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                onClick={() =>
                  onChange({
                    ...task,
                    sources: [...task.sources, { page: 1, quote: "" }],
                  })
                }
              >
                <Plus size={13} />
                근거 추가
              </button>
            </div>
          )}
        </fieldset>
      )}
    </article>
  );
}
