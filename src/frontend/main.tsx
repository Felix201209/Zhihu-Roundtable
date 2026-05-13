import React from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  ApiError,
  analyzeFeedback,
  collectExperimentFeedback,
  confirmExperimentPublish,
  confirmPublish,
  createConfirmation,
  generateExperiment,
  generateExperimentReport,
  getReadiness,
  getTopics,
  getZhihuStatus,
  previewExperimentPublish,
  runWorkflow,
  streamWorkflow,
} from "./api.js";
import type { ConfirmationPayload, ReadinessResponse, ZhihuStatusResponse } from "./types.js";
import type {
  DebateTurn,
  Evidence,
  IdeaExperiment,
  IdeaExperimentStage,
  IdeaVariant,
  IdeaVariantId,
  RoundtableSnapshot,
  Topic,
  VariantFeedback,
} from "../core/types.js";
import liukanshanFront from "./assets/liukanshan-front.png";
import "./styles.css";

type AppMode = "home" | "roundtable" | "idea";
type RoundtableUiStage = "radar" | "prepare" | "debate" | "publish" | "feedback";

const exampleIdeas = [
  "我想做一个 AI 工具，帮知乎创作者判断选题有没有撞车，并给出改法。",
  "我想测一个知乎文章选题：AI 时代，新人作品集到底该不该披露工具使用过程？",
  "我想做一个产品功能脑洞：圈子里的新争议能不能自动触发下一轮讨论策划？",
];

const roundtableStageLabels: Record<RoundtableUiStage, string> = {
  radar: "选题雷达",
  prepare: "讨论方案",
  debate: "主持校验",
  publish: "发布策划",
  feedback: "评论复盘",
};

const ideaStageLabels: Record<IdeaExperimentStage, string> = {
  Draft: "输入脑洞",
  Generated: "生成版本",
  PublishConfirm: "发布确认",
  Collecting: "回收反馈",
  ReportReady: "试验报告",
  Iterate: "继续优化",
};

const speakerMeta: Record<DebateTurn["speaker"], { name: string; role: string; source: string }> = {
  liu: {
    name: "刘看山主持",
    role: "控场、追问、降温",
    source: "主持规则 + 证据池",
  },
  expert: {
    name: "站内观点席",
    role: "基于知乎站内搜索提炼已有观点",
    source: "知乎站内 + 全网资料",
  },
  opponent: {
    name: "反方校验席",
    role: "挑战逻辑漏洞和证据不足",
    source: "AI 逻辑校验 + 待验证问题",
  },
  public: {
    name: "刘看山追问席",
    role: "用知乎主持人的口吻追问、降温、引导补充",
    source: "刘看山主持规则 + 评论回流",
  },
};

export function normalizeSentiment(sentiment?: { support: number; oppose: number; neutral: number }) {
  const support = Math.max(0, sentiment?.support ?? 0);
  const oppose = Math.max(0, sentiment?.oppose ?? 0);
  const neutral = Math.max(0, sentiment?.neutral ?? 0);
  const total = support + oppose + neutral;

  if (!total) {
    return { support: 0, oppose: 0, neutral: 0 };
  }

  return {
    support: Math.round((support / total) * 100),
    oppose: Math.round((oppose / total) * 100),
    neutral: Math.max(0, 100 - Math.round((support / total) * 100) - Math.round((oppose / total) * 100)),
  };
}

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.code?.startsWith("confirmation")) {
      return "真实知乎写操作需要重新授权或完成用户确认；你也可以切回演示模式继续路演。";
    }
    if (error.status === 403) {
      return "当前操作没有权限完成，请检查知乎授权、后端代理或演示模式设置。";
    }
    if (error.status === 401) {
      return "知乎授权已失效，请重新登录或切换演示模式。";
    }
    return error.message;
  }

  return error instanceof Error ? error.message : fallback;
}

function scrollToTop() {
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export function App() {
  const [mode, setMode] = React.useState<AppMode>("home");
  const [roundtableStage, setRoundtableStage] = React.useState<RoundtableUiStage>("radar");
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [snapshot, setSnapshot] = React.useState<RoundtableSnapshot | null>(null);
  const [idea, setIdea] = React.useState("");
  const [experiment, setExperiment] = React.useState<IdeaExperiment | null>(null);
  const [selectedVariantIds, setSelectedVariantIds] = React.useState<IdeaVariantId[]>(["A", "B", "C"]);
  const [publishConfirmation, setPublishConfirmation] = React.useState<ConfirmationPayload | undefined>();
  const [readiness, setReadiness] = React.useState<ReadinessResponse | null>(null);
  const [zhihuStatus, setZhihuStatus] = React.useState<ZhihuStatusResponse | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [busyStartedAt, setBusyStartedAt] = React.useState<number | null>(null);
  const [busyNow, setBusyNow] = React.useState(() => Date.now());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getZhihuStatus()
      .then(setZhihuStatus)
      .catch(() => undefined);
    loadTopics().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const activeSnapshot = mode === "idea" ? experiment?.technicalSnapshot : snapshot;
    if (!activeSnapshot) return;
    getReadiness(activeSnapshot)
      .then(setReadiness)
      .catch(() => undefined);
  }, [experiment?.technicalSnapshot, mode, snapshot]);

  React.useEffect(() => {
    if (!busy) {
      setBusyStartedAt(null);
      return;
    }

    const startedAt = Date.now();
    setBusyStartedAt(startedAt);
    setBusyNow(startedAt);
    const id = window.setInterval(() => setBusyNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const ideaStage: IdeaExperimentStage = experiment?.stage ?? "Draft";
  const busyElapsedSeconds = busyStartedAt ? Math.max(0, Math.floor((busyNow - busyStartedAt) / 1000)) : 0;

  async function loadTopics() {
    const result = await getTopics();
    setTopics(result.topics);
  }

  async function openRoundtable() {
    setMode("roundtable");
    setRoundtableStage("radar");
    setExperiment(null);
    setError(null);
    if (!topics.length) {
      setBusy("正在拉取知乎热榜...");
      try {
        await loadTopics();
      } catch (err) {
        setError(err instanceof Error ? err.message : "热榜加载失败，已准备使用演示缓存。");
      } finally {
        setBusy(null);
      }
    }
  }

  async function startRoundtable(topicId: string) {
    setBusy("正在开启实时工作流：拉取热榜...");
    setError(null);
    setSnapshot(null);
    setRoundtableStage("radar");
    setMode("roundtable");

    try {
      if (typeof window === "undefined" || !("EventSource" in window)) {
        setBusy("当前环境不支持 SSE，正在使用一次性兜底流程...");
        const result = await runWorkflow(false, topicId);
        setTopics(result.topics);
        setSnapshot(result.snapshot);
        setPublishConfirmation(result.publishConfirmation);
        setRoundtableStage("prepare");
        scrollToTop();
        return;
      }

      streamWorkflow({
        topicId,
        publish: false,
        maxRetries: 1,
        onEvent: (event) => {
          if (event.type === "radar") {
            setTopics(event.topics);
            setSnapshot(event.snapshot);
            setBusy("热榜已锁定，正在重构议题...");
            return;
          }
          if (event.type === "prepare") {
            setSnapshot(event.snapshot);
            setRoundtableStage("prepare");
            setBusy("证据池已完成，正在生成可发起的讨论方案...");
            scrollToTop();
            return;
          }
          if (event.type === "agent_briefing") {
            setSnapshot(event.snapshot);
            setBusy("主持任务卡已生成，正在校验讨论是否有张力、证据和参与空间...");
            return;
          }
          if (event.type === "debate_turn") {
            setSnapshot(event.snapshot);
            setBusy(`${speakerMeta[event.turn.speaker].name} 正在发言...`);
            return;
          }
          if (event.type === "debate_done") {
            setSnapshot(event.snapshot);
            setBusy("讨论方案已完成，正在生成圈子帖和引导问题...");
            return;
          }
          if (event.type === "publish") {
            setSnapshot(event.snapshot);
            setPublishConfirmation(undefined);
            setBusy("发布预览已生成，可以继续查看主持校验和圈子帖草稿。");
            return;
          }
          if (event.type === "feedback") {
            setSnapshot(event.snapshot);
            setRoundtableStage("feedback");
            return;
          }
          if (event.type === "error") {
            setError(event.message);
          }
        },
        onError: (message) => {
          setError(message);
          void startRoundtableFallback(topicId);
        },
        onRetry: () => {
          setBusy("实时流连接抖动，正在自动重连一次...");
        },
        onDone: () => {
          setBusy(null);
        },
      });
    } catch (err) {
      setError(friendlyError(err, "讨论方案生成失败"));
      setBusy(null);
    }
  }

  async function startRoundtableFallback(topicId: string) {
    setBusy("正在查站内证据、全网背景并生成讨论方案...");
    setError(null);
    try {
      const result = await runWorkflow(false, topicId);
      setTopics(result.topics);
      setSnapshot(result.snapshot);
      setPublishConfirmation(result.publishConfirmation);
      setRoundtableStage("prepare");
      setMode("roundtable");
      scrollToTop();
    } catch (err) {
      setError(friendlyError(err, "讨论方案生成失败"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmRoundtablePublish() {
    if (!snapshot?.publishDraft) return;

    setBusy("正在用户确认后发布，并回收圈子评论做复盘...");
    setError(null);
    try {
      const confirmation = publishConfirmation ?? await createConfirmation({
        action: "publish",
        snapshot,
      });
      const published = await confirmPublish(snapshot, confirmation.token);
      const feedback = await analyzeFeedback(published.snapshot, published.publishResult);
      setSnapshot(feedback.snapshot);
      setPublishConfirmation(undefined);
      setRoundtableStage("feedback");
    } catch (err) {
      setError(friendlyError(err, "发布或评论回流失败"));
    } finally {
      setBusy(null);
    }
  }

  function resetRoundtable() {
    setRoundtableStage("radar");
    setSnapshot(null);
    setPublishConfirmation(undefined);
    setError(null);
    scrollToTop();
  }

  function openIdeaLab() {
    setMode("idea");
    setExperiment(null);
    setPublishConfirmation(undefined);
    setError(null);
    scrollToTop();
  }

  async function startExperiment(nextIdea = idea) {
    const cleanIdea = nextIdea.trim();
    if (!cleanIdea) {
      setError("先写一个脑洞，我们再帮它上场测试。");
      return;
    }

    setBusy("正在生成 3 个可测试版本...");
    setError(null);
    try {
      const result = await generateExperiment(cleanIdea);
      setExperiment(result.experiment);
      setSelectedVariantIds(result.experiment.selectedVariantIds);
      setPublishConfirmation(undefined);
      setMode("idea");
    } catch (err) {
      setError(friendlyError(err, "生成试验失败"));
    } finally {
      setBusy(null);
    }
  }

  async function openExperimentPublishPreview() {
    if (!experiment) return;
    if (!selectedVariantIds.length) {
      setError("至少选择一个版本才能发起测试。");
      return;
    }

    setBusy("正在生成圈子帖和 A/B/C 评论...");
    setError(null);
    try {
      const result = await previewExperimentPublish(experiment, selectedVariantIds);
      setExperiment(result.experiment);
      setPublishConfirmation(result.publishConfirmation);
    } catch (err) {
      setError(friendlyError(err, "发布预览生成失败"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmExperimentFlowPublish() {
    if (!experiment) return;

    setBusy("正在发布并创建测试选项...");
    setError(null);
    try {
      const published = await confirmExperimentPublish(experiment, publishConfirmation?.token);
      const collected = await collectExperimentFeedback(published.experiment);
      setExperiment(collected.experiment);
      setPublishConfirmation(undefined);
    } catch (err) {
      setError(friendlyError(err, "发布或反馈回收失败"));
    } finally {
      setBusy(null);
    }
  }

  async function buildExperimentFlowReport() {
    if (!experiment) return;

    setBusy("正在把真实反馈转成决策报告...");
    setError(null);
    try {
      const result = await generateExperimentReport(experiment);
      setExperiment(result.experiment);
    } catch (err) {
      setError(friendlyError(err, "报告生成失败"));
    } finally {
      setBusy(null);
    }
  }

  function toggleVariant(id: IdeaVariantId) {
    setSelectedVariantIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      return [...current, id].sort((a, b) => ["A", "B", "C"].indexOf(a) - ["A", "B", "C"].indexOf(b));
    });
  }

  function iterateIdea() {
    const nextIdea = experiment?.report?.finalPositioning ?? experiment?.idea ?? idea;
    setIdea(nextIdea);
    setExperiment(null);
    setPublishConfirmation(undefined);
    setError(null);
    scrollToTop();
  }

  return (
    <main className="experiment-shell" aria-busy={Boolean(busy)}>
      <header className="experiment-topbar">
        <button className="brand-lockup brand-button" onClick={() => setMode("home")} aria-label="回到知辩圆桌首页">
          <span>刘看山主持的知乎讨论组织台</span>
          <strong>知辩圆桌</strong>
        </button>
        <div className="topbar-status">
          {mode === "idea" ? <IdeaStageStepper stage={ideaStage} /> : <RoundtableStageStepper stage={roundtableStage} />}
          <LiveStatusPill status={zhihuStatus} />
        </div>
      </header>

      {error ? <div className="error-strip" role="alert">{error}</div> : null}
      {busy ? <BusyStrip label={busy} elapsedSeconds={busyElapsedSeconds} status={zhihuStatus} /> : null}

      {mode === "home" ? (
        <HomeEntry onRoundtable={() => void openRoundtable()} onIdeaLab={openIdeaLab} />
      ) : null}

      {mode === "roundtable" && roundtableStage === "radar" ? (
        <HotRadar topics={topics} onSelect={(topicId) => void startRoundtable(topicId)} onIdeaLab={openIdeaLab} />
      ) : null}

      {mode === "roundtable" && roundtableStage === "prepare" && snapshot ? (
        <EvidencePrep snapshot={snapshot} onNext={() => setRoundtableStage("debate")} />
      ) : null}

      {mode === "roundtable" && roundtableStage === "debate" && snapshot ? (
        <RoundtableView snapshot={snapshot} onBack={() => setRoundtableStage("prepare")} onNext={() => setRoundtableStage("publish")} />
      ) : null}

      {mode === "roundtable" && roundtableStage === "publish" && snapshot ? (
        <RoundtablePublishView
          snapshot={snapshot}
          zhihuStatus={zhihuStatus}
          onBack={() => setRoundtableStage("debate")}
          onConfirm={() => void confirmRoundtablePublish()}
        />
      ) : null}

      {mode === "roundtable" && roundtableStage === "feedback" && snapshot ? (
        <RoundtableFeedbackView snapshot={snapshot} onNextRound={resetRoundtable} />
      ) : null}

      {mode === "idea" && ideaStage === "Draft" ? (
        <IdeaHome
          idea={idea}
          onIdeaChange={setIdea}
          onStart={() => void startExperiment()}
          onExample={(value) => {
            setIdea(value);
            setError(null);
          }}
          onBack={() => setMode("home")}
        />
      ) : null}

      {mode === "idea" && ideaStage === "Generated" && experiment ? (
        <VariantSelection
          experiment={experiment}
          selectedVariantIds={selectedVariantIds}
          onToggle={toggleVariant}
          onRegenerate={() => void startExperiment(experiment.idea)}
          onPublish={() => void openExperimentPublishPreview()}
        />
      ) : null}

      {mode === "idea" && ideaStage === "PublishConfirm" && experiment ? (
        <PublishPreview
          experiment={experiment}
          onBack={() => setExperiment({ ...experiment, stage: "Generated" })}
          onConfirm={() => void confirmExperimentFlowPublish()}
        />
      ) : null}

      {mode === "idea" && ideaStage === "Collecting" && experiment ? (
        <ExperimentProgress experiment={experiment} onReport={() => void buildExperimentFlowReport()} />
      ) : null}

      {mode === "idea" && ideaStage === "ReportReady" && experiment ? (
        <ExperimentReportView
          experiment={experiment}
          onIterate={iterateIdea}
          onPitch={() => setError("路演稿生成会接在下一步；当前报告里的金句已经可直接上台使用。")}
          onRetest={() => void startExperiment(experiment.report?.finalPositioning ?? experiment.idea)}
        />
      ) : null}

      {(snapshot || experiment) ? (
        <AdvancedDetails
          snapshot={mode === "idea" ? experiment?.technicalSnapshot : snapshot}
          experiment={experiment}
          readiness={readiness}
          zhihuStatus={zhihuStatus}
          activeStage={mode === "idea" ? ideaStageLabels[ideaStage] : roundtableStageLabels[roundtableStage]}
        />
      ) : null}
    </main>
  );
}

function HomeEntry({ onRoundtable, onIdeaLab }: { onRoundtable: () => void; onIdeaLab: () => void }) {
  return (
    <section className="hero-entry zhihu-hero">
      <div className="hero-stage">
        <LiuKanshanPortrait />
        <div className="hero-copy">
          <span className="eyebrow">刘看山主持的知乎讨论组织台</span>
          <h1>知辩圆桌</h1>
          <p>不是让 AI 替你写观点，而是让刘看山把一个知乎热榜变成有证据、有反方、有站队、有评论回流的持续讨论。</p>
        </div>
      </div>
      <div className="hero-actions">
        <button className="primary-button hero-main-action" onClick={onRoundtable}>
          从热榜生成讨论方案 <ArrowRight size={18} />
        </button>
        <button className="ghost-button hero-secondary-action" onClick={onIdeaLab}>
          测试一个脑洞 <Lightbulb size={16} />
        </button>
      </div>
      <div className="proof-strip" aria-label="评委验收证据">
        <article>
          <CheckCircle2 size={16} />
          <strong>真实知乎读链路</strong>
          <span>热榜、站内搜索、圈子与评论 API 已接入</span>
        </article>
        <article>
          <Sparkles size={16} />
          <strong>DeepSeek V4 路由</strong>
          <span>Flash/Pro 分工处理评分、证据、改写和发布稿</span>
        </article>
        <article>
          <ShieldCheck size={16} />
          <strong>缓存与写保护</strong>
          <span>读接口和模型 JSON 缓存；真实发布必须用户确认</span>
        </article>
      </div>
      <section className="signature-loop" aria-label="绝对亮点">
        <div className="signature-copy">
          <span>绝对亮点</span>
          <h2>把一个热榜，变成一场可持续讨论</h2>
          <p>评委看到的不是“生成一段文案”，而是一条完整社区运营链路：找话题、压问题、找证据、请刘看山质检、再把评论变成下一轮内容。</p>
        </div>
        <div className="signature-track" aria-label="热榜到讨论闭环">
          <article>
            <b>01</b>
            <strong>热榜不直接发</strong>
            <span>先判断争议度、资料量和知乎讨论空间</span>
          </article>
          <article>
            <b>02</b>
            <strong>刘看山三问质检</strong>
            <span>有人站队吗？反方说得通吗？证据够支撑吗？</span>
          </article>
          <article>
            <b>03</b>
            <strong>发布前有边界</strong>
            <span>站队选项、引导评论、风险提醒、人工确认</span>
          </article>
          <article>
            <b>04</b>
            <strong>评论回流再创作</strong>
            <span>高质量评论和新反方变成下一轮话题</span>
          </article>
        </div>
      </section>
      <div className="workflow-strip" aria-label="知辩圆桌能力">
        <article>
          <Search size={16} />
          <strong>选题雷达</strong>
          <span>从热榜筛选适合组织讨论的话题</span>
        </article>
        <article>
          <ShieldCheck size={16} />
          <strong>讨论方案</strong>
          <span>生成完整讨论包和圈子帖草稿</span>
        </article>
        <article>
          <Users size={16} />
          <strong>主持校验</strong>
          <span>刘看山校验讨论是否有张力</span>
        </article>
        <article>
          <ClipboardList size={16} />
          <strong>发布策划</strong>
          <span>站队选项、引导评论、风险提醒</span>
        </article>
        <article>
          <MessageSquare size={16} />
          <strong>评论复盘</strong>
          <span>回收评论区生成下一轮方向</span>
        </article>
      </div>
    </section>
  );
}

function LiuKanshanPortrait({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`liukanshan-portrait ${compact ? "compact" : ""}`} aria-label="刘看山主持形象">
      <img src={liukanshanFront} alt="刘看山 IP 形象" />
    </div>
  );
}

function HotRadar({ topics, onSelect, onIdeaLab }: { topics: Topic[]; onSelect: (topicId: string) => void; onIdeaLab: () => void }) {
  return (
    <section className="flow-card">
      <PageHeading
        icon={<BarChart3 size={20} />}
        title="选题雷达"
        subtitle="先从知乎热榜里挑一个值得组织讨论的话题。系统关注争议度、资料丰富度、知乎讨论空间和能否产生下一轮内容。"
      />
      <div className="topic-feed">
        {topics.slice(0, 5).map((topic, index) => (
          <TopicCard key={topic.id} rank={index + 1} topic={topic} onSelect={() => onSelect(topic.id)} />
        ))}
      </div>
      <div className="flow-actions split">
        <button className="ghost-button" onClick={onIdeaLab}>
          不是热榜？测试一个脑洞 <Lightbulb size={16} />
        </button>
      </div>
    </section>
  );
}

function TopicCard({ rank, topic, onSelect }: { rank: number; topic: Topic; onSelect: () => void }) {
  const controversy = topic.controversyLevel === "high" || topic.debateScore >= 85 ? "高" : topic.debateScore >= 70 ? "中" : "低";
  const evidence = topic.evidenceScore >= 82 ? "高" : topic.evidenceScore >= 68 ? "中" : "低";

  return (
    <article className="topic-row">
      <div className={`topic-rank ${rank <= 3 ? "hot" : ""}`}>{rank}</div>
      <div className="topic-row-body">
        <h2>{topic.title}</h2>
        <p>{topic.reason}</p>
        <div className="topic-row-meta">
          <span>热度 {topic.hotScore}</span>
          <span>争议 {controversy}</span>
          <span>资料 {evidence}</span>
        </div>
      </div>
      <button className="primary-button" onClick={onSelect}>
        生成讨论方案 <ArrowRight size={14} />
      </button>
    </article>
  );
}

function EvidencePrep({ snapshot, onNext }: { snapshot: RoundtableSnapshot; onNext: () => void }) {
  const topic = snapshot.selectedTopic;
  const stance = snapshot.stancePreview;
  const evidencePreview = snapshot.evidence.slice(0, 3);
  const question = discussionQuestion(snapshot);

  return (
    <section className="flow-card prepare-workbench">
      <PageHeading
        icon={<ShieldCheck size={20} />}
        title="讨论方案"
        subtitle="把热榜压成一个可发起的开放问题，再给主持人准备最少但够用的立场和证据。"
      />

      <section className="host-gate" aria-label="刘看山发布前质检">
        <div>
          <span>刘看山发布前质检</span>
          <h2>这不是标题改写，是一次讨论可发布性审查</h2>
        </div>
        <div className="host-gate-grid">
          <article>
            <strong>能站队</strong>
            <span>{(stance?.support ?? []).length + (stance?.oppose ?? []).length > 0 ? "已找到支持/反对入口" : "等待更多立场"}</span>
          </article>
          <article>
            <strong>有证据</strong>
            <span>{snapshot.evidence.length} 条知乎/全网证据进入缓存</span>
          </article>
          <article>
            <strong>可追问</strong>
            <span>{snapshot.turns.at(-1)?.nextQuestion ?? "刘看山会把结论改成开放追问"}</span>
          </article>
        </div>
      </section>

      <div className="prep-board">
        <section className="question-panel">
          <span>从热榜到讨论题</span>
          <h2>{question.short}</h2>
          {question.short !== question.full ? (
            <details className="question-original">
              <summary>查看完整原题</summary>
              <p>{question.full}</p>
            </details>
          ) : null}
          <p>原始热榜：{topic?.title}</p>
          <div className="task-list">
            <p><CheckCircle2 size={14} /> 让创作者、圈主、亲历者和反方围绕同一个问题给出立场、经验和反例。</p>
            <p><CheckCircle2 size={14} /> AI 会标注观点来源；无法核验的内容会被标为待验证。</p>
          </div>
        </section>

        <aside className="discussion-brief">
          <span>主持提纲</span>
          <MiniList title="支持" items={(stance?.support ?? []).slice(0, 2)} />
          <MiniList title="反对" items={(stance?.oppose ?? []).slice(0, 2)} />
          <MiniList title="背景" items={(stance?.background ?? []).slice(0, 1)} />
        </aside>
      </div>

      <section className="evidence-rail" aria-label="证据缓存">
        <div className="evidence-rail-header">
          <span>证据缓存</span>
          <small>{snapshot.evidence.length} 条，优先展示质量最高的 3 条</small>
        </div>
        {evidencePreview.map((item) => (
          <EvidenceCard key={item.id} evidence={item} />
        ))}
      </section>

      <div className="flow-actions single">
        <button className="primary-button" onClick={onNext} disabled={!snapshot.turns.length}>
          {snapshot.turns.length ? "让刘看山校验讨论方案" : "正在生成主持校验..."} <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <article className="evidence-row">
      <div>
        <SourceBadge evidence={evidence} />
        <strong>{evidence.title}</strong>
      </div>
      <p>{evidence.summary}</p>
      <small>质量 {evidence.qualityScore} · {stanceLabel(evidence.stance)}</small>
    </article>
  );
}

function RoundtableView({ snapshot, onBack, onNext }: { snapshot: RoundtableSnapshot; onBack: () => void; onNext: () => void }) {
  const activeSpeaker = snapshot.turns.at(-1)?.speaker ?? "liu";
  const latestTurn = snapshot.turns.at(-1);
  const question = discussionQuestion(snapshot);

  return (
    <section className="flow-card debate-workbench">
      <PageHeading
        icon={<Users size={20} />}
        title="刘看山主持校验"
        subtitle="这一步只回答一个问题：刘看山能不能把这条热榜主持成一场有证据、有反方、有追问的知乎讨论。"
      />

      <section className="debate-summary-panel">
        <div className="debate-question">
          <span>当前讨论题</span>
          <h2>{question.short}</h2>
          {question.short !== question.full ? (
            <details className="question-original">
              <summary>查看完整原题</summary>
              <p>{question.full}</p>
            </details>
          ) : null}
        </div>
        <div className="debate-checks" aria-label="主持校验结果">
          <DebateCheck title="有人会站队" value={(snapshot.viewpointMap?.support ?? []).length > 0 ? "通过" : "待补"} />
          <DebateCheck title="反方说得通" value={(snapshot.viewpointMap?.oppose ?? []).length > 0 ? "通过" : "待补"} />
          <DebateCheck title="证据够支撑" value={snapshot.evidence.length >= 3 ? "通过" : "偏少"} />
        </div>
      </section>

      <div className="debate-layout">
        <section className="debate-decision">
          <div className="debate-host-line">
            <LiuKanshanPortrait compact />
            <div>
              <span>刘看山结论</span>
              <h3>{latestTurn?.nextQuestion ?? "可以进入发布策划，但需要保留待验证标注。"}</h3>
            </div>
          </div>
          <p>{latestTurn?.content ?? "主持校验会把标题、证据、反方空间和知乎社区追问价值压成发布前判断。"}</p>
          <div className="role-bar compact">
            {(Object.keys(speakerMeta) as DebateTurn["speaker"][]).map((speaker) => (
              <span key={speaker} className={`role-pill ${activeSpeaker === speaker ? "active" : ""}`}>
                <i className="dot" />
                {speakerMeta[speaker].name}
              </span>
            ))}
          </div>
        </section>

        <section className="debate-stance-card">
          <MiniList title="支持观点" items={(snapshot.viewpointMap?.support ?? []).slice(0, 2)} />
          <MiniList title="反方/风险" items={(snapshot.viewpointMap?.oppose ?? []).slice(0, 2)} />
          <MiniList title="背景限制" items={(snapshot.viewpointMap?.disputes ?? snapshot.viewpointMap?.facts ?? []).slice(0, 2)} />
        </section>
      </div>

      <details className="turn-transcript" open>
        <summary>4 个席位的校验记录</summary>
        <div className="chat-feed">
          {snapshot.turns.map((turn) => (
            <TurnCard key={turn.id} turn={turn} evidence={snapshot.evidence} />
          ))}
        </div>
      </details>

      <div className="safety-note">
        所有发言都服务于"讨论是否能被组织起来"：缺少证据的判断会被标记为待验证，容易引战的表达会被改成开放追问。
      </div>
      <div className="flow-actions">
        <button className="ghost-button" onClick={onBack}>
          <ChevronLeft size={16} /> 返回讨论方案
        </button>
        <button className="primary-button" onClick={onNext} disabled={!snapshot.publishDraft}>
          {snapshot.publishDraft ? "生成发布策划" : "正在生成发布策划..."} <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function DebateCheck({ title, value }: { title: string; value: string }) {
  return (
    <div className="debate-check">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function discussionQuestion(snapshot: RoundtableSnapshot): { short: string; full: string } {
  const full = (snapshot.rewrittenQuestion ?? snapshot.selectedTopic?.title ?? "这个话题值得继续讨论吗？").trim();
  return { full, short: compactQuestion(full) };
}

function compactQuestion(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= 52) {
    return normalized;
  }

  if (/把它当作日常伙伴/.test(normalized) || /日常伙伴吗/.test(normalized)) {
    return "你愿意把懂你的 AI 当日常伙伴吗？";
  }

  const idealFriendMatch = normalized.match(/理想型电子好友[^，。！？?]*应该[^，。！？?]*[？?]/);
  if (idealFriendMatch?.[0]) {
    return cleanQuestionCandidate(idealFriendMatch[0]);
  }

  const willingPartnerMatch = normalized.match(/(?:你会|是否|愿意)[^。！？?]*(?:日常伙伴|电子好友|AI 伙伴|AI伙伴)[^。！？?]*[？?]/);
  if (willingPartnerMatch?.[0]) {
    return cleanQuestionCandidate(willingPartnerMatch[0]);
  }

  const questionSentences = normalized.match(/[^。！？?]*[？?]/g) ?? [];
  const usefulQuestion = questionSentences
    .map(cleanQuestionCandidate)
    .find((item) => item.length >= 12 && item.length <= 52);
  if (usefulQuestion) {
    return usefulQuestion;
  }

  const firstQuestion = questionSentences.at(-1);
  if (firstQuestion) {
    return `${cleanQuestionCandidate(firstQuestion).slice(0, 48)}？`;
  }

  return `${normalized.slice(0, 48)}…`;
}

function cleanQuestionCandidate(value: string): string {
  return value
    .replace(/^如果/, "")
    .replace(/^当/, "")
    .replace(/^你会觉得/, "")
    .replace(/欢迎.*$/, "")
    .replace(/[。！？?]+$/, "？")
    .trim();
}

function TurnCard({ turn, evidence }: { turn: DebateTurn; evidence: Evidence[] }) {
  const usedEvidence = evidence.filter((item) => turn.evidenceIds.includes(item.id));

  return (
    <article className={`chat-message ${turn.speaker}`}>
      <div className="chat-header">
        <div className="chat-avatar">{seatInitial(turn.speaker)}</div>
        <strong>{speakerMeta[turn.speaker].name}</strong>
        <span>{turn.claim}</span>
      </div>
      <p>{turn.content}</p>
      <SourceLine evidence={usedEvidence} fallback={turn.evidenceIds.length === 0 ? "来源：AI 逻辑校验，待真人补充" : undefined} />
      {turn.nextQuestion ? <small>追问：{turn.nextQuestion}</small> : null}
    </article>
  );
}

function seatInitial(speaker: DebateTurn["speaker"]) {
  if (speaker === "liu") return "刘";
  if (speaker === "expert") return "观";
  if (speaker === "opponent") return "校";
  return "问";
}

function PostContent({ draft }: { draft: RoundtableSnapshot["publishDraft"] }) {
  if (!draft) return null;
  return (
    <>
      <div className="post-section">
        <h3>讨论背景</h3>
        <p>{draft.opening}</p>
      </div>
      <div className="post-section">
        <h3>开放问题</h3>
        <p>{draft.questions[0] ?? "如果你站在创作者 / 圈主 / 亲历者的角度，会如何判断这个问题？"}</p>
      </div>
      {draft.consensus.length > 0 || draft.disputes.length > 0 ? (
        <div className="post-section">
          <h3>可以直接站队</h3>
          <ol>
            {draft.consensus.slice(0, 2).map((item, index) => (
              <li key={`c-${index}`}>{item}</li>
            ))}
            {draft.disputes.slice(0, 2).map((item, index) => (
              <li key={`d-${index}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {draft.questions.length > 1 ? (
        <div className="post-section">
          <h3>想邀请大家补充</h3>
          <ol>
            {draft.questions.slice(1, 4).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {draft.disclosure ? <p className="post-disclosure">{draft.disclosure}</p> : null}
    </>
  );
}

function RoundtablePublishView({
  snapshot,
  zhihuStatus,
  onBack,
  onConfirm,
}: {
  snapshot: RoundtableSnapshot;
  zhihuStatus: ZhihuStatusResponse | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const draft = snapshot.publishDraft;
  const liveMode = zhihuStatus?.mode === "live";

  return (
    <section className="flow-card publish-confirm">
      <PageHeading
        icon={<ClipboardList size={20} />}
        title="发布策划与圈子帖预览"
        subtitle="这里的核心产物不是总结，而是一套创作者可以直接用的讨论包：标题、开放问题、站队选项、引导评论、风险提醒和下一轮追问。所有发布内容均需用户确认。"
      />
      <div className="publish-grid">
        <ReportBlock title="讨论目标" items={[draft?.opening ?? "把热点改写成可参与、可站队、可继续追问的圈子讨论。"]} />
        <ReportBlock title="站队选项" items={buildStandOptions(snapshot)} />
        <ReportBlock title="引导评论" items={draft?.questions.slice(0, 3) ?? []} />
        <ReportBlock title="风险提醒" items={buildRiskReminders(snapshot)} />
      </div>
      <div className="post-preview">
        <div className="post-preview-header">
          <span>圈子帖草稿</span>
          <h2>{draft?.title}</h2>
        </div>
        <div className="post-body">
          <PostContent draft={draft} />
        </div>
      </div>
      <div className={`publish-safety-strip ${liveMode ? "live" : "mock"}`}>
        <ShieldCheck size={17} />
        <div>
          <strong>{liveMode ? "Live 写入保护已开启" : "Mock-safe 演示模式"}</strong>
          <span>
            {liveMode
              ? "点击确认会带一次性 confirmation token 调用后端；无 token 会被拒绝，真实写入被限流时会明确标注并转入 mock-safe 复盘。"
              : "点击确认只会生成模拟发布结果和评论复盘，不会写入真实知乎，也不会消耗真实接口额度。"}
          </span>
        </div>
      </div>
      <div className="flow-actions">
        <button className="ghost-button" onClick={onBack}>
          <ChevronLeft size={16} /> 返回主持校验
        </button>
        <button className="primary-button" onClick={onConfirm}>
          确认发布到圈子 <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function RoundtableFeedbackView({ snapshot, onNextRound }: { snapshot: RoundtableSnapshot; onNextRound: () => void }) {
  const insight = snapshot.commentInsight;
  const sentiment = normalizeSentiment(insight?.sentiment);

  return (
    <section className="flow-card feedback-view">
      <PageHeading
        icon={<MessageSquare size={20} />}
        title="评论复盘与下一轮创作"
        subtitle="发帖不是终点。知辩圆桌会把评论区里的站队、真实经验、反方质疑和补充资料，转成创作者下一步行动。"
      />
      <div className="feedback-hero">
        <span>下一轮创作/讨论建议</span>
        <h1>{insight?.nextRoundSuggestions[0] ?? `围绕「${snapshot.selectedTopic?.title}」继续讨论。`}</h1>
        <p>因为评论区出现了新的反方视角、补充证据、真实经验和刘看山值得继续追问的问题。</p>
      </div>
      <CombinedSentimentBar sentiment={sentiment} />
      <div className="report-grid">
        <ReportBlock title="值得回复的评论" items={insight?.highQualityComments ?? []} />
        <ReportBlock title="新的反方/追问" items={insight?.newDisputes ?? []} />
        <ReportBlock title="下一篇内容方向" items={insight?.nextRoundSuggestions ?? []} />
      </div>
      <div className="flow-actions single">
        <button className="primary-button" onClick={onNextRound}>
          开启下一轮讨论策划 <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function CombinedSentimentBar({ sentiment }: { sentiment: { support: number; oppose: number; neutral: number } }) {
  return (
    <div className="sentiment-bar">
      <div className="sentiment-bar-header">
        <span>评论情绪分布</span>
        <span>共 {sentiment.support + sentiment.oppose + sentiment.neutral}%</span>
      </div>
      <div className="sentiment-track">
        <i className="support" style={{ width: `${sentiment.support}%` }} />
        <i className="oppose" style={{ width: `${sentiment.oppose}%` }} />
        <i className="neutral" style={{ width: `${sentiment.neutral}%` }} />
      </div>
      <div className="sentiment-legend">
        <span><b style={{ background: "var(--zhihu-blue)" }} /> 支持 {sentiment.support}%</span>
        <span><b style={{ background: "var(--orange)" }} /> 反方 {sentiment.oppose}%</span>
        <span><b style={{ background: "#c8cdd5" }} /> 中立 {sentiment.neutral}%</span>
      </div>
    </div>
  );
}

function IdeaHome({
  idea,
  onIdeaChange,
  onStart,
  onExample,
  onBack,
}: {
  idea: string;
  onIdeaChange: (value: string) => void;
  onStart: () => void;
  onExample: (value: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="hero-entry idea-lab-entry">
      <div className="hero-copy">
        <span className="eyebrow">脑洞众测模式</span>
        <h1>想法试验场</h1>
        <p>同一套社区反馈引擎，也可以帮创作者和参赛者在投入前测试一个想法。</p>
      </div>
      <div className="idea-box">
        <textarea
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          placeholder="例如：我想做一个 AI 工具，帮知乎创作者找到更有新意的选题。"
          aria-label="输入你的脑洞"
        />
        <button className="primary-button large" onClick={onStart}>
          开始试验 <ArrowRight size={18} />
        </button>
      </div>
      <div className="example-row" aria-label="示例脑洞">
        {exampleIdeas.map((item, index) => (
          <button key={item} onClick={() => onExample(item)}>
            <Lightbulb size={16} />
            {index === 0 ? "测一个 Hackathon 项目 idea" : index === 1 ? "测一个知乎文章选题" : "测一个产品功能脑洞"}
          </button>
        ))}
      </div>
      <button className="ghost-button inline-back" onClick={onBack}>
        <ChevronLeft size={16} /> 回到热榜讨论组织台
      </button>
    </section>
  );
}

function VariantSelection({
  experiment,
  selectedVariantIds,
  onToggle,
  onRegenerate,
  onPublish,
}: {
  experiment: IdeaExperiment;
  selectedVariantIds: IdeaVariantId[];
  onToggle: (id: IdeaVariantId) => void;
  onRegenerate: () => void;
  onPublish: () => void;
}) {
  return (
    <section className="flow-card">
      <PageHeading
        icon={<Sparkles size={20} />}
        title="生成了 3 个可测试版本"
        subtitle="每个版本只保留标题、一句话、亮点和风险，避免评委和参与讨论的人迷路。"
      />
      <div className="variant-grid">
        {experiment.variants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            selected={selectedVariantIds.includes(variant.id)}
            onToggle={() => onToggle(variant.id)}
          />
        ))}
      </div>
      <div className="flow-actions">
        <button className="ghost-button" onClick={onRegenerate}>
          <RefreshCcw size={16} /> 重新生成
        </button>
        <button className="primary-button" onClick={onPublish}>
          发布到圈子测试 <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function VariantCard({ variant, selected, onToggle }: { variant: IdeaVariant; selected: boolean; onToggle: () => void }) {
  return (
    <article className={`variant-card ${selected ? "selected" : ""}`}>
      <label>
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span>{variant.id}</span>
      </label>
      <h2>{variant.title}</h2>
      <p>{variant.oneLiner}</p>
      <div>
        <strong>亮点</strong>
        <span>{variant.highlight}</span>
      </div>
      <div className="risk">
        <strong>风险</strong>
        <span>{variant.risk}</span>
      </div>
    </article>
  );
}

function PublishPreview({
  experiment,
  onBack,
  onConfirm,
}: {
  experiment: IdeaExperiment;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const preview = experiment.postPreview;

  return (
    <section className="flow-card publish-confirm">
      <PageHeading
        icon={<ClipboardList size={20} />}
        title="发布前确认"
        subtitle="系统只负责生成主帖和三个选项评论，真正发布前必须由你确认。"
      />
      <div className="post-preview">
        <div className="post-preview-header">
          <span>主帖预览</span>
          <h2>{preview?.title}</h2>
        </div>
        <div className="post-body">
          <div className="post-section">
            <p>{preview?.body}</p>
          </div>
          {preview?.disclosure ? <p className="post-disclosure">{preview.disclosure}</p> : null}
        </div>
      </div>
      <div className="comment-preview-grid">
        {preview?.optionComments.map((comment) => (
          <article key={comment.variantId}>
            <strong>评论 {comment.variantId}</strong>
            <p>{comment.content}</p>
          </article>
        ))}
      </div>
      <div className="flow-actions">
        <button className="ghost-button" onClick={onBack}>
          <ChevronLeft size={16} /> 返回修改
        </button>
        <button className="primary-button" onClick={onConfirm}>
          确认发布 <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function ExperimentProgress({ experiment, onReport }: { experiment: IdeaExperiment; onReport: () => void }) {
  const feedback = experiment.feedback ?? [];

  return (
    <section className="flow-card">
      <PageHeading
        icon={<BarChart3 size={20} />}
        title="实验进行中"
        subtitle="主帖负责说明，三个评论负责投票和吐槽；AI 把反馈转成决策建议。"
      />
      <div className="status-pills">
        <span>已发布到圈子</span>
        <span>已创建 {experiment.postPreview?.optionComments.length ?? 3} 个测试选项</span>
        <span>{experiment.demoData ? "演示数据" : "真实反馈"}</span>
      </div>
      <div className="feedback-table" role="table" aria-label="实验反馈">
        <div className="feedback-head" role="row">
          <span>版本</span>
          <span>点赞</span>
          <span>评论</span>
          <span>反馈质量</span>
          <span>当前判断</span>
        </div>
        {feedback.map((item) => (
          <div key={item.variantId} className="feedback-row" role="row">
            <strong>{item.variantId} {variantTitle(experiment, item.variantId)}</strong>
            <span>{item.likes}</span>
            <span>{item.comments}</span>
            <span>{qualityLabel(item.quality)}</span>
            <span>{item.currentJudgment}</span>
          </div>
        ))}
      </div>
      <TypicalComments feedback={feedback} />
      <div className="flow-actions single">
        <button className="primary-button" onClick={onReport}>
          生成试验报告 <ArrowRight size={16} />
        </button>
        <small>{experiment.demoData ? "当前样本较少，报告可信度中等；路演现场可切换真实评论。" : "真实评论已回流，报告可信度较高。"}</small>
      </div>
    </section>
  );
}

function ExperimentReportView({
  experiment,
  onIterate,
  onPitch,
  onRetest,
}: {
  experiment: IdeaExperiment;
  onIterate: () => void;
  onPitch: () => void;
  onRetest: () => void;
}) {
  const report = experiment.report;

  return (
    <section className="flow-card report-view">
      <div className="recommendation">
        <span>推荐方向</span>
        <h1>{report?.recommendedTitle}</h1>
        <p>{report?.conclusion}</p>
      </div>
      <div className="report-grid">
        <ReportBlock title="为什么它赢" items={report?.whyWinner ?? []} />
        <ReportBlock title="讨论参与者真正关心什么" items={report?.userConcerns ?? []} />
        <section className="report-block wide">
          <h2>最终产品定位</h2>
          <p>{report?.finalPositioning}</p>
          <h3>路演金句</h3>
          <blockquote>{report?.pitchLine}</blockquote>
        </section>
        <ReportBlock title="MVP 功能" items={report?.mvpFeatures ?? []} />
      </div>
      <div className="flow-actions three">
        <button className="primary-button" onClick={onIterate}>继续优化这个方向</button>
        <button className="ghost-button" onClick={onPitch}>生成路演稿</button>
        <button className="ghost-button" onClick={onRetest}>再做一轮测试</button>
      </div>
    </section>
  );
}

function AdvancedDetails({
  snapshot,
  experiment,
  readiness,
  zhihuStatus,
  activeStage,
}: {
  snapshot?: RoundtableSnapshot | null;
  experiment?: IdeaExperiment | null;
  readiness: ReadinessResponse | null;
  zhihuStatus: ZhihuStatusResponse | null;
  activeStage: string;
}) {
  const modelUsages = experiment?.modelUsages ?? snapshot?.modelUsages ?? [];
  const nodes = experiment?.nodeResults ?? snapshot?.nodeResults ?? [];

  return (
    <details className="advanced-details">
      <summary>评委验证</summary>
      <div className="advanced-grid">
        <section>
          <h2>调用接口</h2>
          <p>热榜 API / 知乎站内搜索 / 全网搜索 / 圈子发布 / 评论列表 / reaction / 直答 Agent 可选。</p>
          <p>
            知乎 Provider：{zhihuStatus?.mode ?? "mock"}，
            {zhihuStatus?.accessTokenConfigured || zhihuStatus?.appCredentialsConfigured ? "真实凭证已配置" : "当前演示兜底"}，
            写操作必须用户确认。
          </p>
          {zhihuStatus?.hotListHours ? <p>热榜时间窗：最近 {zhihuStatus.hotListHours} 小时。</p> : null}
          <p>
            缓存：知乎读接口 {zhihuStatus?.cache?.zhihuReadsEnabled === false ? "关闭" : "开启"}，
            DeepSeek JSON {zhihuStatus?.cache?.llmJsonEnabled === false ? "关闭" : "开启"}。
          </p>
          <p>当前阶段：{activeStage}</p>
        </section>
        <section>
          <h2>证据与热榜</h2>
          {(snapshot?.evidence ?? []).slice(0, 3).map((item) => (
            <p key={item.id}><strong>{sourceLabel(item.source)}</strong> {item.summary}</p>
          ))}
          {!(snapshot?.evidence ?? []).length ? <p>当前使用演示兜底，真实接口可接入知乎站内搜索和全网搜索。</p> : null}
        </section>
        <section>
          <h2>模型策略</h2>
          <p>DeepSeek Flash 处理快速分类和讨论席，DeepSeek Pro 处理问题改写、综合与发布稿；Mock 只做失败兜底。</p>
          {modelUsages.length ? modelUsages.slice(-4).map((usage, index) => (
            <p key={`${usage.role}-${usage.task}-${usage.model}-${index}`}>
              {usage.task}：{usage.provider}/{usage.model}{usage.cached ? " cache" : ""}{usage.fallbackUsed ? " fallback" : ""}
            </p>
          )) : <p>完成主流程后将展示每次模型调用和 fallback 证据。</p>}
        </section>
        <section>
          <h2>工作流节点</h2>
          {nodes.length ? nodes.slice(-6).map((node, index) => (
            <p key={`${node.id}-${node.startedAt}-${index}`}>{node.label}：{node.summary}</p>
          )) : <p>实时工作流启动后会逐步出现节点记录。</p>}
        </section>
        <section>
          <h2>安全边界</h2>
          <p>不伪造真人，不自动发布，待验证标注，读接口失败可演示模式兜底。</p>
          <p>站内观点席不模拟任何具体知乎用户，只提炼公开内容中的观点结构。</p>
        </section>
        <section>
          <h2>完成度自检</h2>
          <p>总分：{readiness?.report.totalScore ?? "--"}</p>
          <p>{readiness?.report.awardTargets.join(" / ") ?? "等待完整报告"}</p>
        </section>
      </div>
    </details>
  );
}

function RoundtableStageStepper({ stage }: { stage: RoundtableUiStage }) {
  const steps: RoundtableUiStage[] = ["radar", "prepare", "debate", "publish", "feedback"];
  const activeIndex = Math.max(0, steps.indexOf(stage));
  const nextStage = steps[activeIndex + 1];

  return (
    <nav className="stage-stepper" aria-label="讨论组织流程">
      <span className="active">当前：{roundtableStageLabels[stage]}</span>
      {nextStage ? <span>下一步：{roundtableStageLabels[nextStage]}</span> : null}
    </nav>
  );
}

function IdeaStageStepper({ stage }: { stage: IdeaExperimentStage }) {
  const steps: IdeaExperimentStage[] = ["Draft", "Generated", "PublishConfirm", "Collecting", "ReportReady"];
  const activeIndex = Math.max(0, steps.indexOf(stage));
  const nextStage = steps[activeIndex + 1];

  return (
    <nav className="stage-stepper" aria-label="试验流程">
      <span className="active">当前：{ideaStageLabels[stage]}</span>
      {nextStage ? <span>下一步：{ideaStageLabels[nextStage]}</span> : null}
    </nav>
  );
}

function LiveStatusPill({ status }: { status: ZhihuStatusResponse | null }) {
  if (!status) {
    return (
      <div className="live-status-pill pending" aria-label="接口与缓存状态">
        <span>检测中</span>
        <b>缓存状态同步中</b>
      </div>
    );
  }

  const live = status?.mode === "live";
  const cacheReady = status?.cache?.zhihuReadsEnabled !== false && status?.cache?.llmJsonEnabled !== false;

  return (
    <div className={`live-status-pill ${live ? "live" : "mock"}`} aria-label="接口与缓存状态">
      <span>{live ? "Live API" : "Mock-safe"}</span>
      <b>{cacheReady ? "缓存开启" : "缓存关闭"}</b>
    </div>
  );
}

function BusyStrip({
  label,
  elapsedSeconds,
  status,
}: {
  label: string;
  elapsedSeconds: number;
  status: ZhihuStatusResponse | null;
}) {
  const live = status?.mode === "live";
  const cacheReady = status ? status.cache?.zhihuReadsEnabled !== false && status.cache?.llmJsonEnabled !== false : null;
  const elapsedLabel = elapsedSeconds < 60
    ? `${elapsedSeconds}s`
    : `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s`;
  return (
    <div className="busy-strip" role="status" aria-live="polite" aria-label={`${label}，已等待 ${elapsedLabel}`}>
      <div className="busy-main">
        <Loader2 size={16} className="spin" />
        <strong>{label}</strong>
        <span>{elapsedLabel}</span>
      </div>
      <div className="busy-meta">
        <span>{status ? (live ? "真实知乎/DeepSeek 链路" : "演示兜底链路") : "接口状态检测中"}</span>
        <span>{cacheReady === null ? "缓存状态同步中" : cacheReady ? "读接口与模型结果会缓存" : "缓存未完全开启"}</span>
      </div>
    </div>
  );
}

function PageHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="page-heading">
      <span>{icon}</span>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function TypicalComments({ feedback }: { feedback: VariantFeedback[] }) {
  const comments = feedback.flatMap((item) =>
    item.typicalComments.slice(0, 1).map((comment) => ({ id: item.variantId, comment })),
  );

  return (
    <section className="typical-comments">
      <h2><MessageSquare size={17} /> 典型评论</h2>
      {comments.map((item) => (
        <p key={`${item.id}-${item.comment}`}><strong>{item.id}</strong>{item.comment}</p>
      ))}
    </section>
  );
}

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-block">
      <h2>{title}</h2>
      {items.slice(0, 4).map((item) => (
        <p key={item}><CheckCircle2 size={15} /> {item}</p>
      ))}
    </section>
  );
}

function buildStandOptions(snapshot: RoundtableSnapshot): string[] {
  const draft = snapshot.publishDraft;
  const support = (snapshot.viewpointMap?.support ?? []).map(cleanDisplayText);
  const disputes = (snapshot.viewpointMap?.disputes ?? []).map(cleanDisplayText);
  const questions = (draft?.questions ?? snapshot.viewpointMap?.followups ?? []).map(cleanDisplayText);

  return [
    `A. ${support[0] ?? draft?.consensus[0] ?? "这个话题值得发起讨论，重点应看真实经验和过程证据。"}`,
    `B. ${disputes[0] ?? "现在证据还不够，应该先把反方疑问摆出来。"}`,
    `C. ${questions[0] ?? "刘看山继续追问：这个问题和具体场景、真实经历有什么关系？"}`,
    "D. 关键不在站队，而在具体场景、证据和参与者经验。",
  ];
}

function cleanDisplayText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return trimmed;
  }

  try {
    const record = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["dispute", "text", "content", "claim", "point", "summary", "question", "reason"]) {
      if (typeof record[key] === "string" && record[key].trim()) {
        return record[key].trim();
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function buildRiskReminders(snapshot: RoundtableSnapshot): string[] {
  const warnings = [
    "不要把 AI 整理当成事实本身，无法核验的内容需要标注待验证。",
    "不要替评论区预设唯一答案，问题要能容纳站队和反例。",
    "所有发布内容必须用户确认，不能自动代表用户发帖或评论。",
  ];

  if ((snapshot.evidence.length ?? 0) < 3) {
    warnings.unshift("当前证据数量偏少，适合先用作讨论引子，不适合作最终结论。");
  }

  return warnings;
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mini-list">
      <strong>{title}</strong>
      {items.slice(0, 3).map((item) => (
        <span key={item}>{item}</span>
      ))}
      {!items.length ? <span>等待更多证据回流。</span> : null}
    </div>
  );
}

function SourceBadge({ evidence }: { evidence: Evidence }) {
  return <span className={`source-badge ${evidence.source}`}>{sourceLabel(evidence.source)}</span>;
}

function SourceLine({ evidence, fallback }: { evidence: Evidence[]; fallback?: string }) {
  if (!evidence.length) {
    return <span className="source-line">{fallback ?? "来源：待验证"}</span>;
  }

  const counts = new Map<string, number>();
  for (const item of evidence) {
    const label = sourceLabel(item.source);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return (
    <span className="source-line">
      来源：{[...counts.entries()].map(([label, count]) => `${label} ${count} 条`).join(" / ")}
    </span>
  );
}

function formatPublishDraft(draft: RoundtableSnapshot["publishDraft"]) {
  if (!draft) return "";

  return [
    "【讨论背景】",
    draft.opening,
    "",
    "【开放问题】",
    draft.questions[0] ?? "如果你站在创作者 / 圈主 / 亲历者的角度，会如何判断这个问题？",
    "",
    "【可以直接站队】",
    ...draft.consensus.slice(0, 2).map((item, index) => `${String.fromCharCode(65 + index)}. ${item}`),
    ...draft.disputes.slice(0, 2).map((item, index) => `${String.fromCharCode(67 + index)}. ${item}`),
    "",
    "【想邀请大家补充】",
    ...draft.questions.slice(0, 3).map((item, index) => `${index + 1}. ${item}`),
    "",
    draft.disclosure,
  ].join("\n");
}

function sourceLabel(source: Evidence["source"]) {
  if (source === "zhihu") return "知乎站内";
  if (source === "global") return "全网背景";
  return "AI 整理";
}

function stanceLabel(stance: Evidence["stance"]) {
  if (stance === "support") return "支持";
  if (stance === "oppose") return "反对";
  if (stance === "neutral") return "中立";
  return "背景";
}

function variantTitle(experiment: IdeaExperiment, id: IdeaVariantId) {
  return experiment.variants.find((variant) => variant.id === id)?.title ?? id;
}

function qualityLabel(quality: VariantFeedback["quality"]) {
  return quality === "high" ? "高" : quality === "medium" ? "中" : "低";
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
