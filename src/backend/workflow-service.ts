import type {
  AgentBrief,
  CommentInsight,
  DebateTurn,
  Evidence,
  EvidencePool,
  ExperimentPostPreview,
  ExperimentReport,
  IdeaExperiment,
  IdeaVariant,
  IdeaVariantId,
  ModelPolicy,
  ModelUsage,
  PublishDraft,
  ReactionType,
  RoundtableSnapshot,
  Topic,
  VariantFeedback,
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
  allowLivePublish?: boolean;
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
    turns: snapshot.turns.map((turn) => ({
      ...turn,
      evidenceIds: [...turn.evidenceIds],
      claimSources: turn.claimSources?.map((source) => ({ ...source })),
    })),
    viewpointMap: snapshot.viewpointMap
      ? cloneViewpointMap(snapshot.viewpointMap)
      : undefined,
    publishDraft: snapshot.publishDraft
      ? {
          ...snapshot.publishDraft,
          consensus: [...snapshot.publishDraft.consensus],
          disputes: [...snapshot.publishDraft.disputes],
          questions: [...snapshot.publishDraft.questions],
          claimSources: snapshot.publishDraft.claimSources?.map((source) => ({ ...source })),
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

function cloneViewpointMap(map: ViewpointMap): ViewpointMap {
  return {
    support: [...map.support],
    oppose: [...map.oppose],
    neutral: [...map.neutral],
    facts: [...map.facts],
    disputes: [...map.disputes],
    followups: [...map.followups],
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

const EXPERIMENT_VARIANT_IDS: IdeaVariantId[] = ["A", "B", "C"];

function experimentTopicFromIdea(idea: string): Topic {
  return {
    id: `idea-${Buffer.from(idea).toString("base64url").slice(0, 14)}`,
    title: idea,
    source: "mock",
    hotScore: 82,
    debateScore: 88,
    evidenceScore: 76,
    discussionPotential: 90,
    controversyLevel: "medium",
    reason: "用户输入的脑洞，适合先做社区小样本测试。",
  };
}

function cloneVariants(variants: IdeaVariant[]): IdeaVariant[] {
  return variants.map((variant) => ({ ...variant }));
}

function selectedVariants(experiment: IdeaExperiment, selectedVariantIds?: IdeaVariantId[]): IdeaVariant[] {
  const ids = selectedVariantIds?.length ? selectedVariantIds : experiment.selectedVariantIds;
  const idSet = new Set(ids);
  return experiment.variants.filter((variant) => idSet.has(variant.id));
}

function publishDraftFromPreview(preview: ExperimentPostPreview): PublishDraft {
  return {
    title: preview.title,
    opening: preview.body,
    consensus: preview.optionComments.map((comment) => `${comment.variantId}：${comment.title}`),
    disputes: preview.optionComments.map((comment) => comment.content),
    questions: ["你更想用哪个？为什么？", "你觉得哪个方向最不像普通 AI 工具？"],
    disclosure: preview.disclosure,
  };
}

function fallbackFeedback(variants: IdeaVariant[]): VariantFeedback[] {
  const defaultScores: Record<IdeaVariantId, Omit<VariantFeedback, "variantId" | "typicalComments"> & { typicalComments: string[] }> = {
    A: {
      likes: 32,
      comments: 6,
      quality: "low",
      currentJudgment: "容易撞车，像普通 AI 写作助手。",
      typicalComments: ["这不就是 AI 写作助手吗？", "快是快，但我看不出为什么非得在知乎用。"],
    },
    B: {
      likes: 75,
      comments: 18,
      quality: "medium",
      currentJudgment: "有实用性，但需要社区反馈增强。",
      typicalComments: ["防撞有用，但最好加真实用户投票。", "查相似内容这一步对创作者挺实际。"],
    },
    C: {
      likes: 129,
      comments: 34,
      quality: "high",
      currentJudgment: "最有潜力，知乎社区参与感强。",
      typicalComments: ["这个更像知乎社区产品，不只是 AI 工具。", "让大家投票和吐槽，比 AI 自评可信。"],
    },
  };

  return variants.map((variant) => ({
    variantId: variant.id,
    ...defaultScores[variant.id],
    typicalComments: [...defaultScores[variant.id].typicalComments],
  }));
}

function cloneExperiment(experiment: IdeaExperiment): IdeaExperiment {
  return {
    ...experiment,
    variants: cloneVariants(experiment.variants),
    selectedVariantIds: [...experiment.selectedVariantIds],
    postPreview: experiment.postPreview
      ? {
          ...experiment.postPreview,
          optionComments: experiment.postPreview.optionComments.map((comment) => ({ ...comment })),
        }
      : undefined,
    publishResult: experiment.publishResult
      ? {
          ...experiment.publishResult,
          optionCommentIds: [...experiment.publishResult.optionCommentIds],
        }
      : undefined,
    feedback: experiment.feedback?.map((item) => ({
      ...item,
      typicalComments: [...item.typicalComments],
    })),
    report: experiment.report
      ? {
          ...experiment.report,
          whyWinner: [...experiment.report.whyWinner],
          userConcerns: [...experiment.report.userConcerns],
          mvpFeatures: [...experiment.report.mvpFeatures],
          nextActions: [...experiment.report.nextActions],
        }
      : undefined,
    technicalSnapshot: experiment.technicalSnapshot ? cloneSnapshot(experiment.technicalSnapshot) : undefined,
    modelUsages: experiment.modelUsages?.map((usage) => ({ ...usage })),
    nodeResults: experiment.nodeResults?.map((node) => ({ ...node, modelUsage: node.modelUsage ? { ...node.modelUsage } : undefined })),
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

  async generateIdeaExperiment(input: {
    idea: string;
    selectedVariantIds?: IdeaVariantId[];
    modelPolicy?: Partial<ModelPolicy>;
  }): Promise<IdeaExperiment> {
    const idea = input.idea.replace(/\s+/g, " ").trim();
    if (!idea) {
      throw new Error("请输入一个脑洞，才能开始试验。");
    }

    const service = this.withModelPolicy(input.modelPolicy);
    const topic = experimentTopicFromIdea(idea);
    const hotTopics = await service.getRadar().catch(() => [] as Topic[]);
    const evidence = await service.cache.getOrSet(`experiment:evidence:${topic.id}`, () =>
      service.zhihuProvider.searchEvidence(topic),
    ).catch(() => [] as Evidence[]);
    const node = startNode("topic_scoring", "想法试验版本生成节点");
    const variantResult = await service.llmProvider.generateIdeaVariants({
      idea,
      similarEvidence: evidence,
      hotTopics,
    });
    const doneNode = finishNode(node, "已生成 3 个可测试版本", variantResult.usage);
    const technicalSnapshot: RoundtableSnapshot = appendNode(
      {
        stage: "prepare",
        selectedTopic: topic,
        rewrittenQuestion: `这个脑洞最值得测试的差异化方向是什么？`,
        evidence,
        turns: [],
        statusMessage: "想法试验后台证据和版本已准备",
      },
      doneNode,
    );

    return {
      id: `exp-${Date.now()}`,
      idea,
      stage: "Generated",
      variants: cloneVariants(variantResult.value).sort((a, b) => EXPERIMENT_VARIANT_IDS.indexOf(a.id) - EXPERIMENT_VARIANT_IDS.indexOf(b.id)),
      selectedVariantIds: input.selectedVariantIds?.length ? input.selectedVariantIds : ["A", "B", "C"],
      statusMessage: "已生成 3 个可测试版本",
      technicalSnapshot,
      modelUsages: technicalSnapshot.modelUsages ?? [],
      nodeResults: technicalSnapshot.nodeResults ?? [],
    };
  }

  createExperimentPublishPreview(input: {
    experiment: IdeaExperiment;
    selectedVariantIds?: IdeaVariantId[];
  }): IdeaExperiment {
    const experiment = cloneExperiment(input.experiment);
    const variants = selectedVariants(experiment, input.selectedVariantIds);
    if (experiment.stage !== "Generated" && experiment.stage !== "PublishConfirm") {
      throw new Error(`发布预览只能在 Generated/PublishConfirm 阶段生成，当前阶段是 ${experiment.stage}。`);
    }
    if (!variants.length) {
      throw new Error("至少选择一个版本，才能生成圈子测试帖。");
    }

    const preview: ExperimentPostPreview = {
      title: "我有 3 个 AI Hackathon 项目方向，想请大家帮忙选一个最有意思的",
      body: [
        `原始脑洞：${experiment.idea}`,
        "",
        "我把它拆成了几个可测试版本，想请大家帮忙判断哪个更像知乎社区里真正有价值的产品：",
        ...variants.map((variant) => `${variant.id}：${variant.title} - ${variant.oneLiner}`),
        "",
        "你更想用哪个？为什么？也欢迎直接吐槽哪里像普通 AI 工具。",
      ].join("\n"),
      optionComments: variants.map((variant) => ({
        variantId: variant.id,
        title: `${variant.id} ${variant.title}`,
        content: `${variant.id} ${variant.title}：${variant.oneLiner}`,
      })),
      disclosure: "本文由 AI 想法试验场辅助整理，发布前经过用户确认；系统会回收点赞、评论和回复生成试验报告。",
    };

    return {
      ...experiment,
      stage: "PublishConfirm",
      selectedVariantIds: variants.map((variant) => variant.id),
      postPreview: preview,
      statusMessage: "圈子测试帖和 A/B/C 评论已生成，等待用户确认",
    };
  }

  async confirmExperimentPublish(input: {
    experiment: IdeaExperiment;
    ringId?: string;
    allowLiveWrite?: boolean;
  }): Promise<IdeaExperiment> {
    const experiment = cloneExperiment(input.experiment);

    if (!experiment.postPreview) {
      throw new Error("发布确认缺少 postPreview。请先调用 publish-preview，让用户看到主帖和选项评论后再确认。");
    }
    this.assertLiveWriteAllowed(input.allowLiveWrite);

    const publishResult = await this.zhihuProvider.publishDraft({
      draft: publishDraftFromPreview(experiment.postPreview),
      ringId: input.ringId,
    });
    const optionCommentIds: string[] = [];

    for (const comment of experiment.postPreview.optionComments) {
      const created = await this.zhihuProvider.createComment({
        publishId: publishResult.id,
        content: comment.content,
      });
      optionCommentIds.push(created.id);
    }

    const node = finishNode(startNode("publish", "想法试验发布节点"), "用户确认后已发布主帖和 A/B/C 评论");
    const technicalSnapshot = experiment.technicalSnapshot
      ? appendNode(experiment.technicalSnapshot, node)
      : undefined;

    return {
      ...experiment,
      stage: "Collecting",
      publishResult: {
        id: publishResult.id,
        url: publishResult.url,
        mode: publishResult.mode,
        createdAt: publishResult.createdAt,
        optionCommentIds,
      },
      technicalSnapshot,
      nodeResults: technicalSnapshot?.nodeResults ?? experiment.nodeResults ?? [],
      modelUsages: technicalSnapshot?.modelUsages ?? experiment.modelUsages ?? [],
      statusMessage: "实验进行中，正在收集点赞和评论反馈",
    };
  }

  async collectExperimentFeedback(input: {
    experiment: IdeaExperiment;
  }): Promise<IdeaExperiment> {
    const experiment = cloneExperiment(input.experiment);
    const variants = selectedVariants(experiment);
    if (experiment.stage !== "Collecting" && experiment.stage !== "ReportReady") {
      throw new Error(`反馈收集只能在 Collecting/ReportReady 阶段调用，当前阶段是 ${experiment.stage}。`);
    }

    const comments = await this.zhihuProvider.listComments({
      topicId: experiment.technicalSnapshot?.selectedTopic?.id ?? experiment.id,
      publishId: experiment.publishResult?.id,
    }).catch(() => [] as string[]);
    const fallback = fallbackFeedback(variants);
    const feedback = comments.length >= 3
      ? fallback.map((item, index) => ({
          ...item,
          comments: Math.max(item.comments, Math.ceil(comments.length / Math.max(1, variants.length))),
          typicalComments: comments.slice(index, index + 2).length ? comments.slice(index, index + 2) : item.typicalComments,
        }))
      : fallback;
    const node = finishNode(startNode("comment_feedback", "想法试验反馈收集节点"), comments.length >= 3 ? "已读取真实评论并生成反馈面板" : "真实样本不足，已使用演示反馈兜底");
    const technicalSnapshot = experiment.technicalSnapshot
      ? appendNode(experiment.technicalSnapshot, node)
      : undefined;

    return {
      ...experiment,
      stage: "Collecting",
      feedback,
      demoData: comments.length < 3,
      technicalSnapshot,
      nodeResults: technicalSnapshot?.nodeResults ?? experiment.nodeResults ?? [],
      modelUsages: technicalSnapshot?.modelUsages ?? experiment.modelUsages ?? [],
      statusMessage: comments.length >= 3 ? "已收集真实评论反馈" : "当前样本较少，已启用演示数据",
    };
  }

  async buildExperimentReport(input: {
    experiment: IdeaExperiment;
    modelPolicy?: Partial<ModelPolicy>;
  }): Promise<IdeaExperiment> {
    const service = this.withModelPolicy(input.modelPolicy);
    const collected = input.experiment.feedback
      ? cloneExperiment(input.experiment)
      : await service.collectExperimentFeedback({ experiment: input.experiment });
    const feedback = collected.feedback ?? fallbackFeedback(selectedVariants(collected));
    const node = startNode("readiness_check", "想法试验报告节点");
    const reportResult = await service.llmProvider.buildExperimentReport({
      idea: collected.idea,
      variants: selectedVariants(collected),
      feedback,
    });
    const doneNode = finishNode(node, "已生成最终方向、MVP 和路演金句", reportResult.usage);
    const technicalSnapshot = collected.technicalSnapshot
      ? appendNode(collected.technicalSnapshot, doneNode)
      : undefined;

    return {
      ...collected,
      stage: "ReportReady",
      feedback,
      report: {
        ...reportResult.value,
        whyWinner: [...reportResult.value.whyWinner],
        userConcerns: [...reportResult.value.userConcerns],
        mvpFeatures: [...reportResult.value.mvpFeatures],
        nextActions: [...reportResult.value.nextActions],
      },
      technicalSnapshot,
      modelUsages: technicalSnapshot?.modelUsages ?? [...(collected.modelUsages ?? []), reportResult.usage],
      nodeResults: technicalSnapshot?.nodeResults ?? [...(collected.nodeResults ?? []), doneNode],
      statusMessage: "试验报告已生成",
    };
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

    for (let index = 0; index < SPEAKERS.length; index += 1) {
      current = (await this.generateDebateTurn(current, index)).snapshot;
    }

    return (await this.buildDebateDone(current)).snapshot;
  }

  private async generateDebateTurn(
    snapshot: RoundtableSnapshot,
    index: number,
  ): Promise<{ snapshot: RoundtableSnapshot; turn: DebateTurn; node: WorkflowNodeResult }> {
    const current = cloneSnapshot(snapshot);
    const topic = requireTopic(current);
    const rewrittenQuestion = current.rewrittenQuestion ?? topic.title;
    const speaker = SPEAKERS[index];
    if (!speaker) {
      throw new Error(`圆桌发言序号 ${index} 超出范围。`);
    }

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
    const turn = {
      ...applied.value,
      evidenceIds: [...applied.value.evidenceIds],
      claimSources: applied.value.claimSources?.map((source) => ({ ...source })),
    };

    return {
      snapshot: {
        ...applied.snapshot,
        turns: [...applied.snapshot.turns, turn],
        statusMessage: `圆桌发言 ${index + 1}/${SPEAKERS.length}`,
      },
      turn,
      node: applied.node,
    };
  }

  private async buildDebateDone(
    snapshot: RoundtableSnapshot,
  ): Promise<{ snapshot: RoundtableSnapshot; node: WorkflowNodeResult }> {
    const current = cloneSnapshot(snapshot);
    const topic = requireTopic(current);
    const consensusNode = startNode("viewpoint_map", "观点地图生成节点");
    const viewpointResult = await this.llmProvider.buildConsensus({
      topic,
      rewrittenQuestion: current.rewrittenQuestion ?? topic.title,
      evidence: current.evidence,
      turns: current.turns,
    });
    const applied = applyUsage(current, viewpointResult, consensusNode, "已生成观点地图、共识、争议和追问");

    return {
      snapshot: {
        ...applied.snapshot,
        stage: "debate",
        viewpointMap: cloneViewpointMap(applied.value),
        statusMessage: "圆桌已完成",
      },
      node: applied.node,
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

  async confirmPublish(
    snapshot: RoundtableSnapshot,
    ringId?: string,
    options: { allowLiveWrite?: boolean } = {},
  ): Promise<PublishResult> {
    if (snapshot.stage !== "publish" || !snapshot.publishDraft) {
      throw new Error("confirmPublish 需要 publish 阶段和发布稿。");
    }
    this.assertLiveWriteAllowed(options.allowLiveWrite);

    return this.zhihuProvider.publishDraft({ draft: snapshot.publishDraft, ringId });
  }

  async confirmPublishWithSnapshot(
    snapshot: RoundtableSnapshot,
    ringId?: string,
    options: { allowLiveWrite?: boolean } = {},
  ): Promise<{ snapshot: RoundtableSnapshot; publishResult: PublishResult }> {
    if (snapshot.stage !== "publish" || !snapshot.publishDraft) {
      throw new Error(`confirmPublishWithSnapshot 只能在 publish 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    const publishSnapshot: RoundtableSnapshot = cloneSnapshot(snapshot);
    const publishDraft = publishSnapshot.publishDraft;
    if (!publishDraft) {
      throw new Error("confirmPublishWithSnapshot 缺少发布稿。");
    }
    let publishResult: PublishResult;
    let nodeSummary = "用户确认后已发布/模拟发布";
    try {
      publishResult = await this.confirmPublish(publishSnapshot, ringId, options);
    } catch (error) {
      if (this.zhihuProvider.mode !== "live" || process.env.ZHIHU_PUBLISH_FALLBACK_TO_MOCK === "false") {
        throw error;
      }
      publishResult = await new MockZhihuProvider().publishDraft({ draft: publishDraft, ringId });
      const message = error instanceof Error ? error.message : "真实发布失败";
      nodeSummary = `真实发布失败，已转为模拟发布：${message}`;
    }
    const node = finishNode(startNode("publish", "发布节点"), nodeSummary);

    return {
      snapshot: appendNode(publishSnapshot, node),
      publishResult,
    };
  }

  async createHostComment(
    input: { publishId: string; content: string },
    options: { allowLiveWrite?: boolean } = {},
  ): Promise<CommentCreateResult> {
    if (!input.content.trim()) {
      throw new Error("createHostComment 需要非空评论内容。");
    }
    this.assertLiveWriteAllowed(options.allowLiveWrite);

    return this.zhihuProvider.createComment(input);
  }

  async react(input: { targetId: string; type: ReactionType }, options: { allowLiveWrite?: boolean } = {}): Promise<ReactionResult> {
    this.assertLiveWriteAllowed(options.allowLiveWrite);
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

  private assertLiveWriteAllowed(allowLiveWrite?: boolean): void {
    if (this.zhihuProvider.mode === "live" && !allowLiveWrite && process.env.ALLOW_LIVE_WRITES !== "1") {
      throw new Error("live 写操作需要显式用户确认；设置 ALLOW_LIVE_WRITES=1 仅用于手动联调。");
    }
  }

  async analyzeFeedback(
    snapshot: RoundtableSnapshot,
    publishResult?: Pick<PublishResult, "id"> & Partial<Pick<PublishResult, "mode">>,
  ): Promise<RoundtableSnapshot> {
    if (snapshot.stage !== "publish" || !snapshot.publishDraft) {
      throw new Error(`analyzeFeedback 只能在 publish 阶段调用，当前阶段是 ${snapshot.stage}。`);
    }

    const topic = requireTopic(snapshot);
    const comments = publishResult?.mode === "mock"
      ? await new MockZhihuProvider().listComments({ topicId: topic.id })
      : await this.zhihuProvider.listComments({
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
    const publishResult = input.publish
      ? await service.confirmPublish(drafted, input.ringId, { allowLiveWrite: input.allowLivePublish })
      : undefined;
    const published = input.publish
      ? appendNode(
          drafted,
          finishNode(startNode("publish", "发布节点"), publishResult ? "用户确认后已发布/模拟发布" : "未发布"),
        )
      : drafted;
    const snapshot = input.publish ? await service.analyzeFeedback(published, publishResult) : published;

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
      for (let index = 0; index < SPEAKERS.length; index += 1) {
        const applied = await service.generateDebateTurn(current, index);
        current = applied.snapshot;
        yield { type: "debate_turn", snapshot: cloneSnapshot(current), turn: applied.turn, node: applied.node };
      }

      const debateDone = await service.buildDebateDone(current);
      const done = debateDone.snapshot;
      yield { type: "debate_done", snapshot: cloneSnapshot(done), node: debateDone.node };

      const drafted = await service.generatePublishDraft(done);
      const publishResult = input.publish
        ? await service.confirmPublish(drafted, input.ringId, { allowLiveWrite: input.allowLivePublish })
        : undefined;
      const publishNode = finishNode(startNode(input.publish ? "publish" : "publish_confirm", input.publish ? "发布节点" : "发布预览节点"), input.publish ? "用户确认后已发布/模拟发布" : "已生成发布预览");
      const publishSnapshot = appendNode(drafted, publishNode);
      yield { type: "publish", snapshot: cloneSnapshot(publishSnapshot), publishResult, node: publishNode };

      if (!input.publish) {
        return;
      }

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
