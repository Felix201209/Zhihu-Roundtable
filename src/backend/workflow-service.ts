import type {
  AgentBrief,
  CommentInsight,
  DebateTurn,
  Evidence,
  EvidencePool,
  ModelPolicy,
  ModelUsage,
  PublishDraft,
  ReactionType,
  RoundtableSnapshot,
  Topic,
  ViewpointMap,
  WorkflowNodeId,
  WorkflowNodeResult,
} from "../core/types.js";
import {
  createModelPolicy,
  createRoutedLlmProvider,
  type LlmCallResult,
  type LlmProvider,
} from "../providers/llm-provider.js";
import {
  createDefaultZhihuProvider,
  MockZhihuProvider,
  type PublishResult,
  type RingDetail,
  type ZhihuProviderFailure,
  type ZhihuProvider,
  type CommentCreateResult,
  type ReactionResult,
} from "../providers/zhihu-provider.js";
import { MemoryCache } from "./cache.js";

export type WorkflowEvent =
  | { type: "radar"; snapshot: RoundtableSnapshot; topics: Topic[]; node: WorkflowNodeResult }
  | { type: "prepare"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "agent_briefing"; snapshot: RoundtableSnapshot; briefs: AgentBrief[]; node: WorkflowNodeResult }
  | { type: "debate_turn"; snapshot: RoundtableSnapshot; turn: DebateTurn; node: WorkflowNodeResult }
  | { type: "debate_done"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "publish"; snapshot: RoundtableSnapshot; publishResult?: PublishResult; node: WorkflowNodeResult }
  | { type: "feedback"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "error"; message: string };

export type RoundtableWorkflowResult = {
  topics: Topic[];
  snapshot: RoundtableSnapshot;
  publishResult?: PublishResult;
  providerMode: "mock" | "live";
  providerFailures: ZhihuProviderFailure[];
  modelPolicy: ModelPolicy;
  modelUsages: ModelUsage[];
  nodeResults: WorkflowNodeResult[];
};

export type WorkflowRunInput = {
  topicId?: string;
  publish?: boolean;
  ringId?: string;
  modelPolicy?: Partial<ModelPolicy>;
};

export type RoundtableServiceOptions = {
  zhihuProvider?: ZhihuProvider;
  llmProvider?: LlmProvider;
  modelPolicy?: Partial<ModelPolicy>;
  cache?: MemoryCache;
};

const SPEAKERS: DebateTurn["speaker"][] = ["liu", "expert", "opponent", "public"];

function now(): string {
  return new Date().toISOString();
}

function cloneSnapshot(snapshot: RoundtableSnapshot): RoundtableSnapshot {
  return {
    ...snapshot,
    selectedTopic: snapshot.selectedTopic ? { ...snapshot.selectedTopic } : undefined,
    evidence: snapshot.evidence.map((item) => ({ ...item })),
    stancePreview: snapshot.stancePreview
      ? {
          support: [...snapshot.stancePreview.support],
          oppose: [...snapshot.stancePreview.oppose],
          neutral: [...snapshot.stancePreview.neutral],
          background: [...snapshot.stancePreview.background],
        }
      : undefined,
    agentBriefs: snapshot.agentBriefs?.map((brief) => ({
      ...brief,
      mustUseEvidenceIds: [...brief.mustUseEvidenceIds],
      avoid: [...brief.avoid],
    })),
    turns: snapshot.turns.map((turn) => ({ ...turn, evidenceIds: [...turn.evidenceIds] })),
    viewpointMap: snapshot.viewpointMap
      ? {
          support: [...snapshot.viewpointMap.support],
          oppose: [...snapshot.viewpointMap.oppose],
          neutral: [...snapshot.viewpointMap.neutral],
          facts: [...snapshot.viewpointMap.facts],
          disputes: [...snapshot.viewpointMap.disputes],
          followups: [...snapshot.viewpointMap.followups],
        }
      : undefined,
    publishDraft: snapshot.publishDraft
      ? {
          ...snapshot.publishDraft,
          consensus: [...snapshot.publishDraft.consensus],
          disputes: [...snapshot.publishDraft.disputes],
          questions: [...snapshot.publishDraft.questions],
        }
      : undefined,
    titleOptions: snapshot.titleOptions ? [...snapshot.titleOptions] : undefined,
    debateQuality: snapshot.debateQuality
      ? {
          ...snapshot.debateQuality,
          reasons: [...snapshot.debateQuality.reasons],
          risks: [...snapshot.debateQuality.risks],
        }
      : undefined,
    commentInsight: snapshot.commentInsight
      ? {
          sentiment: { ...snapshot.commentInsight.sentiment },
          highQualityComments: [...snapshot.commentInsight.highQualityComments],
          newDisputes: [...snapshot.commentInsight.newDisputes],
          nextRoundSuggestions: [...snapshot.commentInsight.nextRoundSuggestions],
        }
      : undefined,
    nodeResults: snapshot.nodeResults?.map((node) => ({ ...node, modelUsage: node.modelUsage ? { ...node.modelUsage } : undefined })),
    modelUsages: snapshot.modelUsages?.map((usage) => ({ ...usage })),
  };
}

function requireTopic(snapshot: RoundtableSnapshot): Topic {
  if (!snapshot.selectedTopic) {
    throw new Error("工作流缺少选题。");
  }

  return snapshot.selectedTopic;
}

function startNode(id: WorkflowNodeId, label: string): WorkflowNodeResult {
  return {
    id,
    label,
    status: "running",
    summary: "运行中",
    startedAt: now(),
  };
}

function finishNode(
  node: WorkflowNodeResult,
  summary: string,
  modelUsage?: ModelUsage,
): WorkflowNodeResult {
  return {
    ...node,
    status: modelUsage?.fallbackUsed ? "fallback" : "completed",
    summary,
    modelUsage,
    completedAt: now(),
  };
}

function appendNode(snapshot: RoundtableSnapshot, node: WorkflowNodeResult): RoundtableSnapshot {
  return {
    ...snapshot,
    nodeResults: [...(snapshot.nodeResults ?? []), node],
    modelUsages: node.modelUsage ? [...(snapshot.modelUsages ?? []), node.modelUsage] : snapshot.modelUsages ?? [],
  };
}

function applyUsage<T>(
  snapshot: RoundtableSnapshot,
  result: LlmCallResult<T>,
  node: WorkflowNodeResult,
  summary: string,
): { snapshot: RoundtableSnapshot; value: T; node: WorkflowNodeResult } {
  const done = finishNode(node, summary, result.usage);
  return {
    snapshot: appendNode(snapshot, done),
    value: result.value,
    node: done,
  };
}

function cloneEvidencePool(pool: EvidencePool): EvidencePool {
  return {
    evidence: pool.evidence.map((item) => ({ ...item })),
    stancePreview: {
      support: [...pool.stancePreview.support],
      oppose: [...pool.stancePreview.oppose],
      neutral: [...pool.stancePreview.neutral],
      background: [...pool.stancePreview.background],
    },
    warnings: [...pool.warnings],
  };
}

export class RoundtableWorkflowService {
  private readonly zhihuProvider: ZhihuProvider;
  private readonly llmProvider: LlmProvider;
  private readonly cache: MemoryCache;
  private readonly modelPolicy: ModelPolicy;

  constructor(options: RoundtableServiceOptions = {}) {
    this.modelPolicy = createModelPolicy(options.modelPolicy);
    this.zhihuProvider = options.zhihuProvider ?? createDefaultZhihuProvider();
    this.llmProvider = options.llmProvider ?? createRoutedLlmProvider(this.modelPolicy);
    this.cache = options.cache ?? new MemoryCache(5 * 60_000);
  }

  async getRadar(): Promise<Topic[]> {
    const rawTopics = await this.cache.getOrSet("topics:hot", () => this.zhihuProvider.getHotTopics());
    const scored = await this.llmProvider.scoreTopics({ topics: rawTopics });
    const scoreMap = new Map(scored.value.map((score) => [score.topicId, score]));

    return rawTopics
      .map((topic) => {
        const score = scoreMap.get(topic.id);
        return score
          ? {
              ...topic,
              debateScore: score.debateScore,
              evidenceScore: score.evidenceScore,
              discussionPotential: score.discussionPotential,
              controversyLevel: score.controversyLevel,
              reason: score.reason,
            }
          : { ...topic };
      })
      .sort((a, b) => (b.discussionPotential ?? b.debateScore) - (a.discussionPotential ?? a.debateScore));
  }

  async getDefaultRing(): Promise<RingDetail> {
    return this.cache.getOrSet("ring:default", () => this.zhihuProvider.getDefaultRing());
  }

  async createInitialSnapshot(topicId?: string): Promise<RoundtableSnapshot> {
    const topics = await this.getRadar();
    const topic = topicId ? topics.find((item) => item.id === topicId) : topics[0];

    if (!topic) {
      throw new Error(topicId ? `找不到话题 ${topicId}。` : "没有可用热榜话题。");
    }

    const node = finishNode(startNode("topic_selection", "话题选择节点"), `已选择「${topic.title}」`);

    return appendNode(
      {
        stage: "radar",
        selectedTopic: { ...topic },
        evidence: [],
        turns: [],
        statusMessage: "话题雷达已就绪",
      },
      node,
    );
  }

  async prepareTopic(snapshot: RoundtableSnapshot): Promise<RoundtableSnapshot> {
    if (snapshot.stage !== "radar") {
      throw new Error(`prepareTopic 只能在 radar 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    const topic = requireTopic(snapshot);
    const rawEvidence = await this.cache.getOrSet(`evidence:${topic.id}`, () =>
      this.zhihuProvider.searchEvidence(topic),
    );

    let current = cloneSnapshot(snapshot);
    const rewriteNode = startNode("question_rewrite", "知乎式问题生成节点");
    const rewriteResult = await this.llmProvider.rewriteQuestion({ topic, evidence: rawEvidence });
    const rewritten = applyUsage(current, rewriteResult, rewriteNode, "已生成知乎式问题");
    current = rewritten.snapshot;

    const evidenceNode = startNode("evidence_pool", "证据池生成节点");
    const poolResult = await this.llmProvider.buildEvidencePool({ topic, rawEvidence });
    const pooled = applyUsage(current, poolResult, evidenceNode, "已生成证据池和立场预览");
    const evidencePool = cloneEvidencePool(pooled.value);
    current = pooled.snapshot;

    const briefingNode = startNode("agent_briefing", "角色 briefing 节点");
    const briefResult = await this.llmProvider.buildAgentBriefs({
      topic,
      rewrittenQuestion: rewritten.value.rewrittenQuestion,
      evidencePool,
    });
    const briefed = applyUsage(current, briefResult, briefingNode, "已生成四个前台 Agent 任务卡");
    current = briefed.snapshot;

    return {
      ...current,
      stage: "prepare",
      rewrittenQuestion: rewritten.value.rewrittenQuestion,
      evidence: evidencePool.evidence,
      stancePreview: evidencePool.stancePreview,
      agentBriefs: briefed.value,
      turns: [],
      viewpointMap: undefined,
      publishDraft: undefined,
      titleOptions: undefined,
      debateQuality: undefined,
      commentInsight: undefined,
      statusMessage: "议题、证据和 Agent brief 已准备",
    };
  }

  async runDebate(snapshot: RoundtableSnapshot): Promise<RoundtableSnapshot> {
    if (snapshot.stage !== "prepare") {
      throw new Error(`runDebate 只能在 prepare 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    let current = cloneSnapshot(snapshot);
    const topic = requireTopic(current);
    const rewrittenQuestion = current.rewrittenQuestion ?? topic.title;

    for (let index = 0; index < SPEAKERS.length; index += 1) {
      const speaker = SPEAKERS[index];
      const brief = current.agentBriefs?.find((item) => item.speaker === speaker);
      const node = startNode("debate", `${speaker} 发言节点`);
      const turnResult = await this.llmProvider.generateAgentTurn({
        topic,
        rewrittenQuestion,
        speaker,
        evidence: current.evidence,
        brief,
        priorTurns: current.turns,
      });
      const applied = applyUsage(current, turnResult, node, `${speaker} 已完成发言`);
      current = {
        ...applied.snapshot,
        turns: [...applied.snapshot.turns, { ...applied.value, evidenceIds: [...applied.value.evidenceIds] }],
        statusMessage: `圆桌发言 ${index + 1}/${SPEAKERS.length}`,
      };
    }

    const consensusNode = startNode("viewpoint_map", "观点地图生成节点");
    const viewpointResult = await this.llmProvider.buildConsensus({
      topic,
      rewrittenQuestion,
      evidence: current.evidence,
      turns: current.turns,
    });
    const applied = applyUsage(current, viewpointResult, consensusNode, "已生成观点地图、共识、争议和追问");
    const viewpointMap = applied.value;

    return {
      ...applied.snapshot,
      stage: "debate",
      viewpointMap: {
        support: [...viewpointMap.support],
        oppose: [...viewpointMap.oppose],
        neutral: [...viewpointMap.neutral],
        facts: [...viewpointMap.facts],
        disputes: [...viewpointMap.disputes],
        followups: [...viewpointMap.followups],
      },
      statusMessage: "圆桌已完成",
    };
  }

  async generatePublishDraft(snapshot: RoundtableSnapshot): Promise<RoundtableSnapshot> {
    if (snapshot.stage !== "debate") {
      throw new Error(`generatePublishDraft 只能在 debate 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    const topic = requireTopic(snapshot);
    const viewpointMap = snapshot.viewpointMap;

    if (!viewpointMap) {
      throw new Error("生成发布稿需要观点地图。");
    }

    const node = startNode("publish_draft", "圈子帖草稿节点");
    const result = await this.llmProvider.buildPublishPackage({
      topic,
      rewrittenQuestion: snapshot.rewrittenQuestion ?? topic.title,
      evidence: snapshot.evidence,
      turns: snapshot.turns,
      viewpointMap,
    });
    const applied = applyUsage(cloneSnapshot(snapshot), result, node, "已生成发布草稿、标题候选和发布质量评分");

    return {
      ...applied.snapshot,
      stage: "publish",
      publishDraft: this.clonePublishDraft(applied.value.draft),
      titleOptions: [...applied.value.titleOptions],
      debateQuality: {
        ...applied.value.quality,
        reasons: [...applied.value.quality.reasons],
        risks: [...applied.value.quality.risks],
      },
      statusMessage: "发布稿已生成，等待用户确认",
    };
  }

  async confirmPublish(snapshot: RoundtableSnapshot, ringId?: string): Promise<PublishResult> {
    if (snapshot.stage !== "publish" || !snapshot.publishDraft) {
      throw new Error("confirmPublish 需要 publish 阶段和发布稿。");
    }

    return this.zhihuProvider.publishDraft({ draft: snapshot.publishDraft, ringId });
  }

  async confirmPublishWithSnapshot(
    snapshot: RoundtableSnapshot,
    ringId?: string,
  ): Promise<{ snapshot: RoundtableSnapshot; publishResult: PublishResult }> {
    const publishSnapshot: RoundtableSnapshot = snapshot.stage === "publish"
      ? cloneSnapshot(snapshot)
      : {
          ...cloneSnapshot(snapshot),
          stage: "publish",
          commentInsight: undefined,
          statusMessage: "等待用户确认发布",
        };
    const publishResult = await this.confirmPublish(publishSnapshot, ringId);
    const node = finishNode(startNode("publish", "发布节点"), "用户确认后已发布/模拟发布");

    return {
      snapshot: appendNode(publishSnapshot, node),
      publishResult,
    };
  }

  async createHostComment(input: { publishId: string; content: string }): Promise<CommentCreateResult> {
    if (!input.content.trim()) {
      throw new Error("createHostComment 需要非空评论内容。");
    }

    return this.zhihuProvider.createComment(input);
  }

  async react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult> {
    return this.zhihuProvider.react(input);
  }

  getQuotaStatus() {
    return this.zhihuProvider.getQuotaStatus?.() ?? [];
  }

  getProviderMode() {
    return this.zhihuProvider.mode;
  }

  getProviderFailures(): ZhihuProviderFailure[] {
    return (this.zhihuProvider.failures ?? []).map((failure) => ({ ...failure }));
  }

  async analyzeFeedback(
    snapshot: RoundtableSnapshot,
    publishResult?: Pick<PublishResult, "id">,
  ): Promise<RoundtableSnapshot> {
    if (snapshot.stage !== "publish" || !snapshot.publishDraft) {
      throw new Error(`analyzeFeedback 只能在 publish 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    const topic = requireTopic(snapshot);
    const comments = await this.zhihuProvider.listComments({
      topicId: topic.id,
      publishId: publishResult?.id,
    });
    const node = startNode("comment_feedback", "评论回流分析节点");
    const result = await this.llmProvider.analyzeComments({
      publishDraft: snapshot.publishDraft,
      comments,
    });
    const applied = applyUsage(cloneSnapshot(snapshot), result, node, "已分析评论情绪、高质量观点和下一轮方向");
    const insight: CommentInsight = applied.value;

    return {
      ...applied.snapshot,
      stage: "feedback",
      commentInsight: {
        sentiment: { ...insight.sentiment },
        highQualityComments: [...insight.highQualityComments],
        newDisputes: [...insight.newDisputes],
        nextRoundSuggestions: [...insight.nextRoundSuggestions],
      },
      statusMessage: publishResult ? "发布反馈已分析" : "评论反馈已分析",
    };
  }

  async runFullWorkflow(input: WorkflowRunInput = {}): Promise<RoundtableWorkflowResult> {
    const service = this.withModelPolicy(input.modelPolicy);
    const topics = await service.getRadar();
    const radarNode = finishNode(startNode("hot_list", "热榜拉取与 AI 评分节点"), `已加载 ${topics.length} 个话题`);
    const initial = appendNode(await service.createInitialSnapshot(input.topicId), radarNode);
    const prepared = await service.prepareTopic(initial);
    const debated = await service.runDebate(prepared);
    const drafted = await service.generatePublishDraft(debated);
    const publishResult = input.publish ? await service.confirmPublish(drafted, input.ringId) : undefined;
    const published = input.publish
      ? appendNode(
          drafted,
          finishNode(startNode("publish", "发布节点"), publishResult ? "用户确认后已发布/模拟发布" : "未发布"),
        )
      : drafted;
    const snapshot = await service.analyzeFeedback(published, publishResult);

    return {
      topics,
      snapshot,
      publishResult,
      providerMode: service.zhihuProvider.mode,
      providerFailures: service.getProviderFailures(),
      modelPolicy: service.modelPolicy,
      modelUsages: snapshot.modelUsages ?? [],
      nodeResults: snapshot.nodeResults ?? [],
    };
  }

  async *streamWorkflow(input: WorkflowRunInput = {}): AsyncGenerator<WorkflowEvent> {
    const service = this.withModelPolicy(input.modelPolicy);

    try {
      const topics = await service.getRadar();
      const radarNode = finishNode(startNode("hot_list", "热榜拉取与 AI 评分节点"), `已加载 ${topics.length} 个话题`);
      let snapshot = appendNode(await service.createInitialSnapshot(input.topicId), radarNode);
      yield { type: "radar", snapshot: cloneSnapshot(snapshot), topics, node: radarNode };

      snapshot = await service.prepareTopic(snapshot);
      yield {
        type: "prepare",
        snapshot: cloneSnapshot(snapshot),
        node: snapshot.nodeResults?.at(-1) ?? finishNode(startNode("evidence_pool", "议题准备节点"), "已准备"),
      };
      yield {
        type: "agent_briefing",
        snapshot: cloneSnapshot(snapshot),
        briefs: snapshot.agentBriefs ?? [],
        node: snapshot.nodeResults?.find((node) => node.id === "agent_briefing") ??
          finishNode(startNode("agent_briefing", "角色 briefing 节点"), "已生成任务卡"),
      };

      let current = cloneSnapshot(snapshot);
      const topic = requireTopic(current);
      const rewrittenQuestion = current.rewrittenQuestion ?? topic.title;
      for (let index = 0; index < SPEAKERS.length; index += 1) {
        const speaker = SPEAKERS[index];
        const brief = current.agentBriefs?.find((item) => item.speaker === speaker);
        const node = startNode("debate", `${speaker} 发言节点`);
        const turnResult = await service.llmProvider.generateAgentTurn({
          topic,
          rewrittenQuestion,
          speaker,
          evidence: current.evidence,
          brief,
          priorTurns: current.turns,
        });
        const applied = applyUsage(current, turnResult, node, `${speaker} 已完成发言`);
        current = {
          ...applied.snapshot,
          turns: [...applied.snapshot.turns, { ...applied.value, evidenceIds: [...applied.value.evidenceIds] }],
          statusMessage: `圆桌发言 ${index + 1}/${SPEAKERS.length}`,
        };
        yield { type: "debate_turn", snapshot: cloneSnapshot(current), turn: applied.value, node: applied.node };
      }

      const consensusNode = startNode("viewpoint_map", "观点地图生成节点");
      const viewpointResult = await service.llmProvider.buildConsensus({
        topic,
        rewrittenQuestion,
        evidence: current.evidence,
        turns: current.turns,
      });
      const consensus = applyUsage(current, viewpointResult, consensusNode, "已生成观点地图、共识、争议和追问");
      const done: RoundtableSnapshot = {
        ...consensus.snapshot,
        stage: "debate",
        viewpointMap: consensus.value,
        statusMessage: "圆桌已完成",
      };
      yield { type: "debate_done", snapshot: cloneSnapshot(done), node: consensus.node };

      const drafted = await service.generatePublishDraft(done);
      const publishResult = input.publish ? await service.confirmPublish(drafted, input.ringId) : undefined;
      const publishNode = finishNode(startNode(input.publish ? "publish" : "publish_confirm", input.publish ? "发布节点" : "发布预览节点"), input.publish ? "用户确认后已发布/模拟发布" : "已生成发布预览");
      const publishSnapshot = appendNode(drafted, publishNode);
      yield { type: "publish", snapshot: cloneSnapshot(publishSnapshot), publishResult, node: publishNode };

      const feedback = await service.analyzeFeedback(publishSnapshot, publishResult);
      yield {
        type: "feedback",
        snapshot: cloneSnapshot(feedback),
        node: feedback.nodeResults?.at(-1) ?? finishNode(startNode("comment_feedback", "评论回流分析节点"), "已分析反馈"),
      };
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "未知工作流错误。",
      };
    }
  }

  withModelPolicy(policy?: Partial<ModelPolicy>): RoundtableWorkflowService {
    if (!policy) {
      return this;
    }

    return new RoundtableWorkflowService({
      zhihuProvider: this.zhihuProvider,
      cache: this.cache,
      modelPolicy: {
        ...this.modelPolicy,
        ...policy,
        roleMap: {
          ...this.modelPolicy.roleMap,
          ...(policy.roleMap ?? {}),
        },
      },
    });
  }

  private clonePublishDraft(draft: PublishDraft): PublishDraft {
    return {
      ...draft,
      consensus: [...draft.consensus],
      disputes: [...draft.disputes],
      questions: [...draft.questions],
    };
  }
}
