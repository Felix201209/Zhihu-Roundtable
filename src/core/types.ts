export type Topic = {
  id: string;
  title: string;
  source?: "zhihu_hot" | "ring" | "mock";
  hotScore: number;
  debateScore: number;
  evidenceScore: number;
  reason: string;
  controversyLevel?: "low" | "medium" | "high";
  discussionPotential?: number;
};

export type Evidence = {
  id: string;
  source: "zhihu" | "global" | "mock";
  title: string;
  summary: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  relevanceScore?: number;
  favoriteCount?: number;
  commentCount?: number;
  stance: "support" | "oppose" | "neutral" | "background";
  qualityScore: number;
};

export type ClaimSource = {
  id: string;
  label: string;
  type: "zhihu" | "global" | "ai_reasoning" | "comment" | "unverified";
  confidence: "high" | "medium" | "low";
};

export type DebateTurn = {
  id: string;
  speaker: "liu" | "expert" | "opponent" | "public";
  content: string;
  evidenceIds: string[];
  claimSources?: ClaimSource[];
  claim?: string;
  nextQuestion?: string;
};

export type ViewpointMap = {
  support: string[];
  oppose: string[];
  neutral: string[];
  facts: string[];
  disputes: string[];
  followups: string[];
};

export type PublishDraft = {
  title: string;
  opening: string;
  consensus: string[];
  disputes: string[];
  questions: string[];
  claimSources?: ClaimSource[];
  disclosure: string;
};

export type CommentInsight = {
  sentiment: {
    support: number;
    oppose: number;
    neutral: number;
  };
  highQualityComments: string[];
  newDisputes: string[];
  nextRoundSuggestions: string[];
};

export type ModelProviderName = "mock" | "kimi" | "deepseek-v4-flash" | "deepseek-v4-pro" | "custom";

export type ModelRole =
  | "topic_scoring"
  | "question"
  | "evidence"
  | "briefing"
  | "debate"
  | "synthesis"
  | "publish"
  | "feedback";

export type IdeaExperimentStage =
  | "Draft"
  | "Generated"
  | "PublishConfirm"
  | "Collecting"
  | "ReportReady"
  | "Iterate";

export type IdeaVariantId = "A" | "B" | "C";

export type IdeaVariant = {
  id: IdeaVariantId;
  title: string;
  oneLiner: string;
  highlight: string;
  risk: string;
};

export type ExperimentOptionComment = {
  variantId: IdeaVariantId;
  title: string;
  content: string;
};

export type ExperimentPostPreview = {
  title: string;
  body: string;
  optionComments: ExperimentOptionComment[];
  disclosure: string;
};

export type VariantFeedbackQuality = "low" | "medium" | "high";

export type VariantFeedback = {
  variantId: IdeaVariantId;
  likes: number;
  comments: number;
  quality: VariantFeedbackQuality;
  currentJudgment: string;
  typicalComments: string[];
};

export type ExperimentPublishResult = {
  id: string;
  url: string;
  mode: "mock" | "live";
  createdAt: string;
  optionCommentIds: string[];
};

export type ExperimentReport = {
  recommendedVariantId: IdeaVariantId;
  recommendedTitle: string;
  conclusion: string;
  whyWinner: string[];
  userConcerns: string[];
  finalPositioning: string;
  pitchLine: string;
  mvpFeatures: string[];
  nextActions: string[];
};

export type IdeaExperiment = {
  id: string;
  idea: string;
  stage: IdeaExperimentStage;
  variants: IdeaVariant[];
  selectedVariantIds: IdeaVariantId[];
  postPreview?: ExperimentPostPreview;
  publishResult?: ExperimentPublishResult;
  feedback?: VariantFeedback[];
  report?: ExperimentReport;
  demoData?: boolean;
  statusMessage: string;
  technicalSnapshot?: RoundtableSnapshot;
  modelUsages?: ModelUsage[];
  nodeResults?: WorkflowNodeResult[];
};

export type ModelPolicy = {
  mode: "mock" | "auto" | "live";
  kimiModel: string;
  deepseekFlashModel: string;
  deepseekProModel: string;
  defaultProvider: ModelProviderName;
  roleMap: Partial<Record<ModelRole, ModelProviderName>>;
  fallbackToMock: boolean;
};

export type ModelUsage = {
  provider: ModelProviderName;
  model: string;
  role: ModelRole;
  task: string;
  fallbackUsed: boolean;
  latencyMs?: number;
  attempts?: number;
  errorMessage?: string;
};

export type TopicScore = {
  topicId: string;
  debateScore: number;
  evidenceScore: number;
  discussionPotential: number;
  controversyLevel: "low" | "medium" | "high";
  reason: string;
};

export type EvidencePool = {
  evidence: Evidence[];
  stancePreview: {
    support: string[];
    oppose: string[];
    neutral: string[];
    background: string[];
  };
  warnings: string[];
};

export type AgentBrief = {
  speaker: DebateTurn["speaker"];
  mission: string;
  tone: string;
  mustUseEvidenceIds: string[];
  avoid: string[];
};

export type DebateQuality = {
  publishable: boolean;
  score: number;
  reasons: string[];
  risks: string[];
};

export type PublishPackage = {
  draft: PublishDraft;
  titleOptions: string[];
  quality: DebateQuality;
};

export type ApiQuotaKey =
  | "hot_list"
  | "zhihu_search"
  | "global_search"
  | "ring_detail"
  | "publish_pin"
  | "comment_list"
  | "comment_create"
  | "reaction";

export type ApiQuotaStatus = {
  key: ApiQuotaKey;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
};

export type ReactionType = "support" | "oppose" | "inspired" | "neutral";

export type HackathonRubricItem = {
  key: "ai_value" | "innovation" | "completion" | "ux" | "pitch";
  label: string;
  weight: number;
  score: number;
  reasons: string[];
  risks: string[];
};

export type HackathonReadinessReport = {
  totalScore: number;
  awardTargets: string[];
  items: HackathonRubricItem[];
  strongestProof: string[];
  missingProof: string[];
  demoChecklist: string[];
};

export type WorkflowNodeId =
  | "oauth"
  | "hot_list"
  | "topic_cleaning"
  | "topic_scoring"
  | "topic_selection"
  | "question_rewrite"
  | "evidence_pool"
  | "agent_briefing"
  | "debate"
  | "viewpoint_map"
  | "publish_draft"
  | "publish_confirm"
  | "publish"
  | "reaction"
  | "comment_feedback"
  | "comment_create"
  | "readiness_check"
  | "demo_mode";

export type WorkflowNodeResult = {
  id: WorkflowNodeId;
  label: string;
  status: "pending" | "running" | "completed" | "fallback" | "failed";
  summary: string;
  modelUsage?: ModelUsage;
  startedAt: string;
  completedAt?: string;
};

export type RoundtableStage =
  | "radar"
  | "prepare"
  | "debate"
  | "publish"
  | "feedback";

export type RoundtableSnapshot = {
  stage: RoundtableStage;
  selectedTopic?: Topic;
  rewrittenQuestion?: string;
  evidence: Evidence[];
  stancePreview?: EvidencePool["stancePreview"];
  agentBriefs?: AgentBrief[];
  turns: DebateTurn[];
  viewpointMap?: ViewpointMap;
  publishDraft?: PublishDraft;
  titleOptions?: string[];
  debateQuality?: DebateQuality;
  commentInsight?: CommentInsight;
  nodeResults?: WorkflowNodeResult[];
  modelUsages?: ModelUsage[];
  statusMessage: string;
};

export type CommunityActionResult = {
  kind: "reaction" | "comment";
  id: string;
  mode: "mock" | "live";
  summary: string;
  createdAt: string;
};
