import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardCopy,
  Database,
  Gauge,
  Layers3,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import {
  analyzeFeedback,
  confirmPublish,
  createConfirmation,
  createHostComment,
  getQuota,
  getReadiness,
  getZhihuStatus,
  react,
  runWorkflow,
  streamWorkflow,
} from "./api.js";
import type { QuotaResponse, ReadinessResponse, WorkflowRunResponse, ZhihuStatusResponse } from "./types.js";
import type { DebateTurn, ReactionType, RoundtableSnapshot } from "../core/types.js";
import "./styles.css";

const speakerMeta: Record<DebateTurn["speaker"], { name: string; role: string; color: string }> = {
  liu: { name: "刘看山", role: "主持控场", color: "#0f7cff" },
  expert: { name: "知乎大 V", role: "深度观点", color: "#16a34a" },
  opponent: { name: "反方刺客", role: "逻辑挑战", color: "#dc2626" },
  public: { name: "吃瓜群众", role: "用户视角", color: "#f59e0b" },
};

type CommunityAction =
  | { kind: "reaction"; type: ReactionType; title: string; body: string; confirmText: string }
  | { kind: "comment"; content: string; title: string; body: string; confirmText: string };

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

export function App() {
  const [data, setData] = React.useState<WorkflowRunResponse | null>(null);
  const [quota, setQuota] = React.useState<QuotaResponse | null>(null);
  const [readiness, setReadiness] = React.useState<ReadinessResponse | null>(null);
  const [zhihuStatus, setZhihuStatus] = React.useState<ZhihuStatusResponse | null>(null);
  const [activeTurn, setActiveTurn] = React.useState(0);
  const [status, setStatus] = React.useState("后端待连接");
  const [error, setError] = React.useState<string | null>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = React.useState(false);
  const [publishBusy, setPublishBusy] = React.useState(false);
  const [pendingCommunityAction, setPendingCommunityAction] = React.useState<CommunityAction | null>(null);
  const [communityActionBusy, setCommunityActionBusy] = React.useState(false);
  const streamCancelRef = React.useRef<(() => void) | null>(null);

  const refreshSystem = React.useCallback(async (snapshot?: RoundtableSnapshot) => {
    const [quotaResult, zhihuResult] = await Promise.all([getQuota(), getZhihuStatus()]);
    setQuota(quotaResult);
    setZhihuStatus(zhihuResult);
    if (snapshot) {
      setReadiness(await getReadiness(snapshot));
    }
  }, []);

  const load = React.useCallback(async (publish = false, topicId?: string) => {
    streamCancelRef.current?.();
    setIsStreaming(false);
    setError(null);
    setStatus("正在组织知乎圆桌...");
    const result = await runWorkflow(publish, topicId);
    setData(result);
    await refreshSystem(result.snapshot);
    setActiveTurn(0);
    setIsPaused(false);
    setStatus("完整闭环已就绪");
  }, [refreshSystem]);

  const playStream = React.useCallback((publish = false, topicId?: string) => {
    streamCancelRef.current?.();
    setError(null);
    setIsStreaming(true);
    setStatus("路演模式：SSE 正在逐节点播放");
    const cancel = streamWorkflow({
      publish,
      topicId,
      onEvent: (event) => {
        if (event.type === "error") {
          setError(event.message);
          return;
        }
        setData((previous) => ({
          topics: event.type === "radar" ? event.topics : previous?.topics ?? [],
          snapshot: event.snapshot,
          providerMode: previous?.providerMode ?? "mock",
          providerFailures: previous?.providerFailures ?? [],
          modelUsages: event.snapshot.modelUsages ?? [],
          nodeResults: event.snapshot.nodeResults ?? [],
          publishResult: event.type === "publish" ? event.publishResult : previous?.publishResult,
        }));
        setActiveTurn(Math.max(0, (event.snapshot.turns.length ?? 1) - 1));
        setStatus(streamLabel(event.type));
        if (event.type === "feedback") {
          void refreshSystem(event.snapshot);
        }
      },
      onError: setError,
      onDone: () => {
        setIsStreaming(false);
        setStatus("路演播放完成");
      },
    });
    streamCancelRef.current = cancel;
  }, [refreshSystem]);

  React.useEffect(() => {
    load(false).catch((err) => {
      setError(err instanceof Error ? err.message : "后端连接失败");
      setStatus("使用后端接口时遇到问题");
    });
    return () => streamCancelRef.current?.();
  }, [load]);

  React.useEffect(() => {
    if (!data?.snapshot.turns.length || isStreaming || isPaused) return;
    const timer = window.setInterval(() => {
      setActiveTurn((index) => (index + 1) % data.snapshot.turns.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [data, isStreaming, isPaused]);

  const snapshot = data?.snapshot;
  const readinessValue = !data?.publishResult && snapshot?.publishDraft ? "就绪" : readiness?.report.totalScore ?? "--";
  const readinessLabel = !data?.publishResult && snapshot?.publishDraft
    ? "发布确认后回流"
    : readiness?.report.awardTargets.at(0) ?? "综合大奖";

  const confirmAndPublish = React.useCallback(async () => {
    if (!snapshot?.publishDraft) {
      setError("发布稿尚未生成，不能确认发布。");
      return;
    }

    setPublishBusy(true);
    try {
      const publishConfirmation = data?.publishConfirmation ?? (
        data?.providerMode === "live"
          ? await createConfirmation({ action: "publish", snapshot })
          : undefined
      );
      const published = await confirmPublish(snapshot, publishConfirmation?.token);
      const feedback = await analyzeFeedback(published.snapshot, published.publishResult?.id);
      const nextData = {
        ...data,
        ...published,
        snapshot: feedback.snapshot,
        publishResult: published.publishResult,
        modelUsages: feedback.modelUsages,
        nodeResults: feedback.nodeResults,
      };
      setData(nextData);
      await refreshSystem(feedback.snapshot);
      setActiveTurn(Math.max(0, feedback.snapshot.turns.length - 1));
      setIsPaused(false);
      setStatus("已确认发布并完成评论回流");
      setPublishDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布闭环失败");
    } finally {
      setPublishBusy(false);
    }
  }, [data, refreshSystem, snapshot]);

  const active = snapshot?.turns[activeTurn];
  const copyDraft = React.useCallback(() => {
    if (!snapshot?.publishDraft) {
      setStatus("发布稿尚未生成");
      return;
    }

    const text = formatDraft(snapshot);
    if (!navigator.clipboard?.writeText) {
      setStatus("当前浏览器不支持一键复制，请在发布预览中手动选取。");
      return;
    }

    void navigator.clipboard.writeText(text)
      .then(() => setStatus("发布草稿已复制"))
      .catch(() => setError("复制草稿失败，请手动选取发布预览内容。"));
  }, [snapshot]);

  const requestCommunityAction = React.useCallback((action: CommunityAction) => {
    if (!data?.publishResult) {
      setStatus("请先生成圈子帖并完成发布确认，再进行社区互动。");
      return;
    }

    setPendingCommunityAction(action);
  }, [data?.publishResult]);

  const confirmCommunityAction = React.useCallback(async () => {
    if (!pendingCommunityAction || !data?.publishResult) {
      setPendingCommunityAction(null);
      return;
    }

    setCommunityActionBusy(true);
    setError(null);
    try {
      if (pendingCommunityAction.kind === "reaction") {
        const confirmation = data.providerMode === "live"
          ? await createConfirmation({ action: "reaction", subject: data.publishResult.id })
          : undefined;
        await react(data.publishResult.id, pendingCommunityAction.type, confirmation?.token);
        setStatus("社区互动已确认发送");
      } else {
        const confirmation = data.providerMode === "live"
          ? await createConfirmation({ action: "comment", subject: data.publishResult.id })
          : undefined;
        await createHostComment(data.publishResult.id, pendingCommunityAction.content, confirmation?.token);
        setStatus("刘看山主持评论已确认发送");
      }
      setPendingCommunityAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "社区互动发送失败");
    } finally {
      setCommunityActionBusy(false);
    }
  }, [data?.publishResult, pendingCommunityAction]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">知辩圆桌</div>
          <div className="subtitle">刘看山主持的知乎 AI 观点实验室</div>
        </div>
        <div className="top-flow" aria-label="Demo 流程">
          {["热榜", "证据", "圆桌", "发布", "回流"].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
        <div className="top-actions">
          <button className="ghost-button" onClick={() => load(false, snapshot?.selectedTopic?.id)}>
            <RefreshCcw size={16} /> 重播 Demo
          </button>
          <button className="ghost-button" onClick={() => playStream(false, snapshot?.selectedTopic?.id)}>
            <Radio size={16} /> 路演模式
          </button>
          <button className="ghost-button" onClick={() => setIsPaused((value) => !value)}>
            {isPaused ? <Play size={16} /> : <Pause size={16} />} {isPaused ? "继续轮播" : "暂停轮播"}
          </button>
          <button className="primary-button" onClick={() => setPublishDialogOpen(true)}>
            <Send size={16} /> 生成圈子帖
          </button>
        </div>
      </header>

      {error ? <div className="error-strip"><AlertTriangle size={16} /> {error}</div> : null}

      <section className="hero-strip">
        <div>
          <span className="mission-label">知乎热榜研究室</span>
          <h1>把热榜变成一场有证据、有反驳、有共识的圆桌讨论</h1>
          <p>AI 的位置不是替用户下结论，而是帮知乎把散乱讨论组织成可发布、可回流、可继续追问的社区议题。</p>
        </div>
        <div className="mission-proof">
          <span>夺奖自检</span>
          <strong>{readinessValue}</strong>
          <small>{readinessLabel}</small>
        </div>
      </section>

      <section className="workspace">
        <aside className="left-rail">
          <PanelTitle icon={<Gauge size={17} />} title="热榜雷达" />
          {data?.topics.slice(0, 3).map((topic, index) => (
            <button
              key={topic.id}
              className={`topic-card ${topic.id === snapshot?.selectedTopic?.id ? "selected" : ""}`}
              onClick={() => load(false, topic.id).catch((err) => {
                setError(err instanceof Error ? err.message : "切换热榜话题失败");
                setStatus("热榜话题切换失败");
              })}
            >
              <span><em>{index + 1}</em>{topic.title}</span>
              <strong>讨论潜力 {topic.discussionPotential ?? topic.debateScore}</strong>
              <small>{topic.reason}</small>
            </button>
          ))}
          <button className="text-link" onClick={() => setStatus("路演默认展示前三个高潜话题，完整热榜由 hot_list provider 保留。")}>查看完整热榜 &gt;</button>
          <QuotaPanel quota={quota} />
          <StatusPanel status={zhihuStatus} failures={data?.providerFailures ?? []} />
        </aside>

        <section className="stage">
          <div className="stage-header">
            <div>
              <span className="stage-kicker">{status}</span>
              <h2>{snapshot?.rewrittenQuestion ?? "正在等待议题重构"}</h2>
            </div>
            <div className="stage-badge"><Sparkles size={16} /> {stageLabel(snapshot?.stage)}</div>
          </div>

          <Roundtable activeSpeaker={active?.speaker ?? "liu"} turns={snapshot?.turns ?? []} />

          <div className="transcript">
            <PanelTitle icon={<MessageSquare size={17} />} title="实时发言流" />
            {snapshot?.turns.map((turn, index) => (
              <button
                key={turn.id}
                className={`line ${index === activeTurn ? "active" : ""}`}
                onClick={() => setActiveTurn(index)}
              >
                <span>{speakerMeta[turn.speaker].name}</span>
                <p>{turn.content}</p>
              </button>
            ))}
          </div>
        </section>

        <aside className="right-rail">
          <DiscussionSummaryPanel
            data={data}
            onPublish={() => setPublishDialogOpen(true)}
            onCopy={copyDraft}
          />
          <FeedbackPanel snapshot={snapshot} published={Boolean(data?.publishResult)} />
          <details className="advanced-details">
            <summary>技术细节 / 评分自检</summary>
            <EvidencePanel snapshot={snapshot} />
            <ViewpointPanel snapshot={snapshot} />
            <PublishPanel
              data={data}
              onCopy={copyDraft}
              onReaction={() => requestCommunityAction({
                kind: "reaction",
                type: "inspired",
                title: "确认发送「有启发」互动？",
                body: "真实知乎环境下，这一步会调用 reaction 接口。为了避免自动替用户互动，必须由你二次确认。",
                confirmText: "确认发送互动",
              })}
              onHostComment={() => requestCommunityAction({
                kind: "comment",
                content: "刘看山补充：欢迎继续围绕证据讨论。",
                title: "确认让刘看山补充主持评论？",
                body: "真实知乎环境下，这一步会调用评论创建接口。评论发布前必须由用户确认。",
                confirmText: "确认发送评论",
              })}
            />
            <AgentBriefPanel snapshot={snapshot} />
            <ModelPanel data={data} />
            <NodeTimeline snapshot={snapshot} />
            <ReadinessPanel readiness={readiness} />
          </details>
        </aside>
      </section>

      <PublishConfirmDialog
        open={publishDialogOpen}
        busy={publishBusy}
        snapshot={snapshot}
        onCancel={() => setPublishDialogOpen(false)}
        onConfirm={confirmAndPublish}
      />
      <CommunityActionDialog
        action={pendingCommunityAction}
        busy={communityActionBusy}
        onCancel={() => setPendingCommunityAction(null)}
        onConfirm={confirmCommunityAction}
      />
    </main>
  );
}

function streamLabel(type: string) {
  const labels: Record<string, string> = {
    radar: "热榜雷达已锁定高潜议题",
    prepare: "议题重构与证据池已准备",
    agent_briefing: "四位 Agent 已拿到任务卡",
    debate_turn: "圆桌正在发言和引用证据",
    debate_done: "观点地图正在沉淀",
    publish: "圈子发布预览已生成",
    feedback: "评论回流分析已完成",
  };
  return labels[type] ?? "AI 圆桌运行中";
}

function stageLabel(stage?: RoundtableSnapshot["stage"]) {
  const labels: Record<RoundtableSnapshot["stage"], string> = {
    radar: "热榜雷达",
    prepare: "议题准备",
    debate: "圆桌讨论",
    publish: "发布预览",
    feedback: "评论回流",
  };
  return stage ? labels[stage] : "热榜雷达";
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="panel-title">{icon}<span>{title}</span></div>;
}

function Roundtable({ activeSpeaker, turns }: { activeSpeaker: DebateTurn["speaker"]; turns: DebateTurn[] }) {
  const speakers: DebateTurn["speaker"][] = ["expert", "liu", "opponent", "public"];
  return (
    <div className="roundtable">
      <div className="table-core">
        <div className="table-ring" />
        <div className="table-center">共识沉淀</div>
      </div>
      {speakers.map((speaker, index) => (
        <div key={speaker} className={`agent agent-${index} ${activeSpeaker === speaker ? "speaking" : ""}`}>
          <div className="avatar" style={{ borderColor: speakerMeta[speaker].color }}>
            {speaker === "liu" ? "山" : speakerMeta[speaker].name.slice(0, 1)}
          </div>
          <strong>{speakerMeta[speaker].name}</strong>
          <span>{speakerMeta[speaker].role}</span>
        </div>
      ))}
      <div className="speech-bubble">
        <strong>{speakerMeta[activeSpeaker].name}</strong>
        <p>{turns.find((turn) => turn.speaker === activeSpeaker)?.claim ?? "正在把讨论拉回证据和问题本身。"}</p>
      </div>
    </div>
  );
}

function EvidencePanel({ snapshot }: { snapshot?: RoundtableSnapshot }) {
  return (
    <section className="panel">
      <PanelTitle icon={<CircleDot size={17} />} title="证据池" />
      {snapshot?.evidence.slice(0, 4).map((ev) => (
        <div key={ev.id} className="evidence">
          <div><span className={`source ${ev.source}`}>{sourceLabel(ev.source)}</span><span>{ev.qualityScore}</span></div>
          <strong>{ev.title}</strong>
          <p>{ev.summary}</p>
        </div>
      ))}
    </section>
  );
}

function sourceLabel(source: string) {
  if (source === "zhihu") return "知乎站内";
  if (source === "global") return "全网背景";
  return "Mock 兜底";
}

function DiscussionSummaryPanel({
  data,
  onPublish,
  onCopy,
}: {
  data: WorkflowRunResponse | null;
  onPublish: () => void;
  onCopy: () => void;
}) {
  const snapshot = data?.snapshot;
  const map = snapshot?.viewpointMap;
  const firstEvidence = snapshot?.evidence.slice(0, 2) ?? [];
  const draft = snapshot?.publishDraft;

  return (
    <section className="panel summary-panel">
      <PanelTitle icon={<Activity size={17} />} title="讨论沉淀" />
      <div className="summary-card evidence-summary">
        <strong>证据</strong>
        {firstEvidence.length ? (
          firstEvidence.map((ev) => (
            <p key={ev.id}><span className={`source ${ev.source}`}>{sourceLabel(ev.source)}</span>{ev.summary}</p>
          ))
        ) : (
          <p>等待知乎站内与全网背景证据。</p>
        )}
      </div>
      <div className="summary-card">
        <strong>共识</strong>
        {(map?.support.length ? map.support : draft?.consensus ?? []).slice(0, 2).map((item) => <p key={item}>{item}</p>)}
      </div>
      <div className="summary-card followup">
        <strong>追问</strong>
        <p>{map?.followups.at(0) ?? draft?.questions.at(0) ?? "下一轮会从评论区的新争议继续。"} </p>
      </div>
      <div className="summary-actions">
        <button className="primary-button" onClick={onPublish}>
          <Send size={16} /> 生成圈子帖
        </button>
        <button className="ghost-button compact" onClick={onCopy}>
          <ClipboardCopy size={15} /> 复制草稿
        </button>
      </div>
      <p className="summary-disclosure">{draft?.disclosure ?? "由 AI 圆桌辅助整理，发布前必须经过用户确认。"}</p>
    </section>
  );
}

function ViewpointPanel({ snapshot }: { snapshot?: RoundtableSnapshot }) {
  const map = snapshot?.viewpointMap;
  return (
    <section className="panel">
      <PanelTitle icon={<Activity size={17} />} title="观点地图" />
      <MiniList title="支持" items={map?.support ?? []} />
      <MiniList title="反对" items={map?.oppose ?? []} />
      <MiniList title="事实" items={map?.facts ?? []} />
      <MiniList title="追问" items={map?.followups ?? []} />
    </section>
  );
}

function PublishPanel({
  data,
  onCopy,
  onReaction,
  onHostComment,
}: {
  data: WorkflowRunResponse | null;
  onCopy: () => void;
  onReaction: () => void;
  onHostComment: () => void;
}) {
  const draft = data?.snapshot.publishDraft;
  return (
    <section className="panel publish">
      <PanelTitle icon={<Send size={17} />} title="发布预览" />
      <h3>{draft?.title ?? "等待生成发布稿"}</h3>
      <div className="title-options">
        {data?.snapshot.titleOptions?.slice(0, 3).map((title) => <span key={title}>{title}</span>)}
      </div>
      <p>{draft?.opening}</p>
      <button className="ghost-button compact" onClick={onCopy}><ClipboardCopy size={15} /> 复制草稿</button>
      <div className="action-row">
        <button className="mini-button" onClick={onReaction}>有启发</button>
        <button className="mini-button" onClick={onHostComment}>主持评论</button>
      </div>
    </section>
  );
}

function FeedbackPanel({ snapshot, published }: { snapshot?: RoundtableSnapshot; published: boolean }) {
  const insight = snapshot?.commentInsight;
  const sentiment = normalizeSentiment(insight?.sentiment);
  return (
    <section className="panel">
      <PanelTitle icon={<MessageSquare size={17} />} title="评论回流" />
      {insight && published ? (
        <>
          <div className="sentiment">
            <span data-testid="sentiment-support" style={{ width: `${sentiment.support}%` }} />
            <span data-testid="sentiment-oppose" style={{ width: `${sentiment.oppose}%` }} />
            <span data-testid="sentiment-neutral" style={{ width: `${sentiment.neutral}%` }} />
          </div>
          <MiniList title="高质量评论" items={insight.highQualityComments} />
          <MiniList title="新争议" items={insight.newDisputes} />
          <MiniList title="下一轮圆桌" items={insight.nextRoundSuggestions} />
        </>
      ) : (
        <p className="empty-note">发布后会拉回评论，分析情绪、好观点和下一轮议题。</p>
      )}
    </section>
  );
}

function AgentBriefPanel({ snapshot }: { snapshot?: RoundtableSnapshot }) {
  const briefs = snapshot?.agentBriefs ?? [];
  return (
    <section className="panel">
      <PanelTitle icon={<UsersRound size={17} />} title="Agent 任务卡" />
      {briefs.length ? (
        <div className="brief-grid">
          {briefs.map((brief) => (
            <div key={brief.speaker} className="brief-card">
              <strong>{speakerMeta[brief.speaker].name}</strong>
              <p>{brief.mission}</p>
              <div>
                <span>{brief.tone}</span>
                <span>{brief.mustUseEvidenceIds.length ? `证据 ${brief.mustUseEvidenceIds.length}` : "用户视角"}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-note">议题准备后会展示每个 Agent 的 mission、tone 和证据约束。</p>
      )}
    </section>
  );
}

function ModelPanel({ data }: { data: WorkflowRunResponse | null }) {
  const usages = data?.modelUsages ?? [];
  return (
    <section className="panel">
      <PanelTitle icon={<Bot size={17} />} title="模型分工" />
      {usages.slice(-6).map((usage) => (
        <div key={`${usage.role}-${usage.task}-${usage.latencyMs ?? 0}`} className="model-row">
          <span>{usage.role}</span>
          <strong>{usage.provider}/{usage.model}</strong>
        </div>
      ))}
    </section>
  );
}

function NodeTimeline({ snapshot }: { snapshot?: RoundtableSnapshot }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Layers3 size={17} />} title="工作流节点" />
      <div className="timeline">
        {snapshot?.nodeResults?.slice(-10).map((node) => (
          <div key={`${node.id}-${node.startedAt}`} className={`node ${node.status}`}>
            <span />
            <div>
              <strong>{node.label}</strong>
              <p>{node.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPanel({ status, failures }: { status: ZhihuStatusResponse | null; failures: NonNullable<WorkflowRunResponse["providerFailures"]> }) {
  const visibleFailures = [...(status?.failures ?? []), ...failures].slice(-2);
  return (
    <section className="quota">
      <PanelTitle icon={<ShieldCheck size={17} />} title="知乎接入状态" />
      <div className="status-grid">
        <span>Provider</span>
        <strong>{status?.mode ?? "mock"}</strong>
        <span>Token</span>
        <strong>{status?.accessTokenConfigured ? "ready" : "demo"}</strong>
      </div>
      {visibleFailures.length ? (
        <div className="fallback-note">
          <Database size={14} /> API 暂不可用时已自动切换缓存案例
        </div>
      ) : null}
    </section>
  );
}

function ReadinessPanel({ readiness }: { readiness: ReadinessResponse | null }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Zap size={17} />} title="夺奖自检" />
      {readiness?.report.items.map((item) => (
        <div key={item.key} className="score-row">
          <span>{item.label}</span>
          <strong>{item.score}</strong>
        </div>
      ))}
      <div className="targets">{readiness?.report.awardTargets.map((target) => <span key={target}>{target}</span>)}</div>
    </section>
  );
}

function QuotaPanel({ quota }: { quota: QuotaResponse | null }) {
  return (
    <section className="quota">
      <PanelTitle icon={<CheckCircle2 size={17} />} title="API 配额" />
      {quota?.quotas.slice(0, 3).map((item) => (
        <div key={item.key} className="quota-row">
          <span>{item.key}</span>
          <strong>{item.remaining}/{item.limit}</strong>
        </div>
      ))}
    </section>
  );
}

function PublishConfirmDialog({
  open,
  busy,
  snapshot,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  snapshot?: RoundtableSnapshot;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-confirm-title">
        <button className="icon-button" aria-label="关闭发布确认" onClick={onCancel}>
          <X size={18} />
        </button>
        <span className="dialog-label">人工确认节点</span>
        <h2 id="publish-confirm-title">确认把圆桌结果发布到圈子？</h2>
        <p>
          真实知乎环境下，这一步会等待用户授权和二次确认。Demo 会模拟发布、初始化互动入口，并拉回评论做下一轮分析。
        </p>
        <div className="draft-preview">
          <strong>{snapshot?.publishDraft?.title ?? "发布稿正在生成"}</strong>
          <span>{snapshot?.publishDraft?.disclosure ?? "由 AI 圆桌辅助整理，用户确认发布。"}</span>
        </div>
        <div className="dialog-actions">
          <button className="ghost-button" onClick={onCancel} disabled={busy}>返回修改</button>
          <button className="primary-button" onClick={onConfirm} disabled={busy}>
            <Send size={16} /> {busy ? "发布并回流中..." : "确认发布并回流"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CommunityActionDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: CommunityAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!action) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="community-confirm-title">
        <button className="icon-button" aria-label="关闭社区互动确认" onClick={onCancel}>
          <X size={18} />
        </button>
        <span className="dialog-label">社区互动确认</span>
        <h2 id="community-confirm-title">{action.title}</h2>
        <p>{action.body}</p>
        <div className="draft-preview">
          <strong>{action.kind === "reaction" ? "Reaction" : "Comment"}</strong>
          <span>{action.kind === "reaction" ? action.type : action.content}</span>
        </div>
        <div className="dialog-actions">
          <button className="ghost-button" onClick={onCancel} disabled={busy}>取消</button>
          <button className="primary-button" onClick={onConfirm} disabled={busy}>
            <Send size={16} /> {busy ? "发送中..." : action.confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mini-list">
      <strong>{title}</strong>
      {items.slice(0, 2).map((item) => <p key={item}>{item}</p>)}
    </div>
  );
}

function formatDraft(snapshot: RoundtableSnapshot) {
  const draft = snapshot.publishDraft;
  if (!draft) return "";
  return [
    draft.title,
    "",
    draft.opening,
    "",
    "共识：",
    ...draft.consensus.map((item, index) => `${index + 1}. ${item}`),
    "",
    "争议：",
    ...draft.disputes.map((item, index) => `${index + 1}. ${item}`),
    "",
    "继续讨论：",
    ...draft.questions.map((item, index) => `${index + 1}. ${item}`),
    "",
    draft.disclosure,
  ].join("\n");
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
