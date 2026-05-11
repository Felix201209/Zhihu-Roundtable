import { z } from "zod";
import type {
  ClaimSource,
  CommentInsight,
  AgentBrief,
  DebateQuality,
  DebateTurn,
  EvidencePool,
  ExperimentReport,
  IdeaVariant,
  PublishDraft,
  PublishPackage,
  TopicScore,
  ViewpointMap,
} from "../core/types.js";

const NonEmptyStringSchema = z.string().trim().min(1);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFromItem(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const record = asRecord(value);
  for (const key of ["text", "content", "claim", "point", "summary", "title", "reason", "comment", "question", "label"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }

  if (Object.keys(record).length > 0) {
    return JSON.stringify(record);
  }

  return "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = stringFromItem(value);
    return single ? [single] : [];
  }

  return value
    .map(stringFromItem)
    .filter(Boolean);
}

function normalizeViewpointMapInput(input: unknown): unknown {
  const record = asRecord(input);
  return {
    support: stringArray(record.support),
    oppose: stringArray(record.oppose),
    neutral: stringArray(record.neutral),
    facts: stringArray(record.facts),
    disputes: stringArray(record.disputes),
    followups: stringArray(record.followups ?? record.followUpQuestions ?? record.questions),
  };
}

function normalizeCommentInsightInput(input: unknown): unknown {
  const record = asRecord(input);
  const sentiment = asRecord(record.sentiment);
  return {
    sentiment: {
      support: Number(sentiment.support ?? record.supportCount ?? record.support ?? 0) || 0,
      oppose: Number(sentiment.oppose ?? record.opposeCount ?? record.oppose ?? 0) || 0,
      neutral: Number(sentiment.neutral ?? record.neutralCount ?? record.neutral ?? 0) || 0,
    },
    highQualityComments: stringArray(record.highQualityComments ?? record.qualityComments ?? record.representativeComments ?? record.comments),
    newDisputes: stringArray(record.newDisputes ?? record.disputes ?? record.newOpposingViews),
    nextRoundSuggestions: stringArray(record.nextRoundSuggestions ?? record.suggestions ?? record.nextQuestions ?? record.followups),
  };
}

export const ClaimSourceSchema: z.ZodType<ClaimSource> = z
  .object({
    id: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    type: z.enum(["zhihu", "global", "ai_reasoning", "comment", "unverified"]),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict();

export const QuestionRewriteSchema = z
  .object({
    rewrittenQuestion: NonEmptyStringSchema,
    rationale: NonEmptyStringSchema,
    evidenceIds: z.array(NonEmptyStringSchema),
  })
  .strict();

export const DebateTurnSchema: z.ZodType<DebateTurn> = z
  .object({
    id: NonEmptyStringSchema,
    speaker: z.enum(["liu", "expert", "opponent", "public"]),
    content: NonEmptyStringSchema,
    evidenceIds: z.array(NonEmptyStringSchema),
    claimSources: z.array(ClaimSourceSchema).optional(),
    claim: NonEmptyStringSchema.optional(),
    nextQuestion: NonEmptyStringSchema.optional(),
  })
  .strict();

export const ViewpointMapSchema: z.ZodType<ViewpointMap> = z
  .object({
    support: z.array(NonEmptyStringSchema),
    oppose: z.array(NonEmptyStringSchema),
    neutral: z.array(NonEmptyStringSchema),
    facts: z.array(NonEmptyStringSchema),
    disputes: z.array(NonEmptyStringSchema),
    followups: z.array(NonEmptyStringSchema),
  })
  .strict();

export const PublishDraftSchema: z.ZodType<PublishDraft> = z
  .object({
    title: NonEmptyStringSchema,
    opening: NonEmptyStringSchema,
    consensus: z.array(NonEmptyStringSchema),
    disputes: z.array(NonEmptyStringSchema),
    questions: z.array(NonEmptyStringSchema),
    claimSources: z.array(ClaimSourceSchema).optional(),
    disclosure: NonEmptyStringSchema,
  })
  .strict();

export const CommentInsightSchema: z.ZodType<CommentInsight> = z
  .object({
    sentiment: z
      .object({
        support: z.number().min(0),
        oppose: z.number().min(0),
        neutral: z.number().min(0),
      })
      .strict(),
    highQualityComments: z.array(NonEmptyStringSchema),
    newDisputes: z.array(NonEmptyStringSchema),
    nextRoundSuggestions: z.array(NonEmptyStringSchema),
  })
  .strict();

export const TopicScoreSchema: z.ZodType<TopicScore> = z
  .object({
    topicId: NonEmptyStringSchema,
    debateScore: z.number().min(0).max(100),
    evidenceScore: z.number().min(0).max(100),
    discussionPotential: z.number().min(0).max(100),
    controversyLevel: z.enum(["low", "medium", "high"]),
    reason: NonEmptyStringSchema,
  })
  .strict();

export const TopicScoresSchema = z.array(TopicScoreSchema);

export const EvidenceSchema = z
  .object({
    id: NonEmptyStringSchema,
    source: z.enum(["zhihu", "global", "mock"]),
    title: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
    url: z.string().url().optional(),
    author: NonEmptyStringSchema.optional(),
    publishedAt: NonEmptyStringSchema.optional(),
    relevanceScore: z.number().optional(),
    favoriteCount: z.number().min(0).optional(),
    commentCount: z.number().min(0).optional(),
    stance: z.enum(["support", "oppose", "neutral", "background"]),
    qualityScore: z.number().min(0).max(100),
  })
  .strict();

export const EvidencePoolSchema: z.ZodType<EvidencePool> = z
  .object({
    evidence: z.array(EvidenceSchema),
    stancePreview: z
      .object({
        support: z.array(NonEmptyStringSchema),
        oppose: z.array(NonEmptyStringSchema),
        neutral: z.array(NonEmptyStringSchema),
        background: z.array(NonEmptyStringSchema),
      })
      .strict(),
    warnings: z.array(NonEmptyStringSchema),
  })
  .strict();

export const AgentBriefSchema: z.ZodType<AgentBrief> = z
  .object({
    speaker: z.enum(["liu", "expert", "opponent", "public"]),
    mission: NonEmptyStringSchema,
    tone: NonEmptyStringSchema,
    mustUseEvidenceIds: z.array(NonEmptyStringSchema),
    avoid: z.array(NonEmptyStringSchema),
  })
  .strict();

export const AgentBriefsSchema = z.array(AgentBriefSchema);

export const DebateQualitySchema: z.ZodType<DebateQuality> = z
  .object({
    publishable: z.boolean(),
    score: z.number().min(0).max(100),
    reasons: z.array(NonEmptyStringSchema),
    risks: z.array(NonEmptyStringSchema),
  })
  .strict();

export const PublishPackageSchema: z.ZodType<PublishPackage> = z
  .object({
    draft: PublishDraftSchema,
    titleOptions: z.array(NonEmptyStringSchema).min(1).max(5),
    quality: DebateQualitySchema,
  })
  .strict();

export const IdeaVariantSchema: z.ZodType<IdeaVariant> = z
  .object({
    id: z.enum(["A", "B", "C"]),
    title: NonEmptyStringSchema,
    oneLiner: NonEmptyStringSchema,
    highlight: NonEmptyStringSchema,
    risk: NonEmptyStringSchema,
  })
  .strict();

export const IdeaVariantsSchema = z
  .array(IdeaVariantSchema)
  .length(3)
  .refine((items) => new Set(items.map((item) => item.id)).size === 3, {
    message: "Idea variants must contain A/B/C exactly once.",
  });

export const IdeaVariantsObjectSchema = z
  .object({
    variants: IdeaVariantsSchema,
  })
  .strict();

export const ExperimentReportSchema: z.ZodType<ExperimentReport> = z
  .object({
    recommendedVariantId: z.enum(["A", "B", "C"]),
    recommendedTitle: NonEmptyStringSchema,
    conclusion: NonEmptyStringSchema,
    whyWinner: z.array(NonEmptyStringSchema).min(1),
    userConcerns: z.array(NonEmptyStringSchema).min(1),
    finalPositioning: NonEmptyStringSchema,
    pitchLine: NonEmptyStringSchema,
    mvpFeatures: z.array(NonEmptyStringSchema).min(1),
    nextActions: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();

export const parseDebateTurn = (input: unknown): DebateTurn =>
  DebateTurnSchema.parse(input);

export const parseQuestionRewrite = (input: unknown) =>
  QuestionRewriteSchema.parse(input);

export const validateQuestionRewrite = (input: unknown) =>
  QuestionRewriteSchema.safeParse(input);

export const validateDebateTurn = (input: unknown) =>
  DebateTurnSchema.safeParse(input);

export const parseViewpointMap = (input: unknown): ViewpointMap =>
  ViewpointMapSchema.parse(normalizeViewpointMapInput(input));

export const validateViewpointMap = (input: unknown) =>
  ViewpointMapSchema.safeParse(normalizeViewpointMapInput(input));

export const parsePublishDraft = (input: unknown): PublishDraft =>
  PublishDraftSchema.parse(input);

export const validatePublishDraft = (input: unknown) =>
  PublishDraftSchema.safeParse(input);

export const parseCommentInsight = (input: unknown): CommentInsight =>
  CommentInsightSchema.parse(normalizeCommentInsightInput(input));

export const validateCommentInsight = (input: unknown) =>
  CommentInsightSchema.safeParse(normalizeCommentInsightInput(input));

export const parseTopicScores = (input: unknown): TopicScore[] =>
  TopicScoresSchema.parse(input);

export const validateTopicScores = (input: unknown) =>
  TopicScoresSchema.safeParse(input);

export const parseEvidencePool = (input: unknown): EvidencePool =>
  EvidencePoolSchema.parse(input);

export const validateEvidencePool = (input: unknown) =>
  EvidencePoolSchema.safeParse(input);

export const parseAgentBriefs = (input: unknown): AgentBrief[] =>
  AgentBriefsSchema.parse(input);

export const validateAgentBriefs = (input: unknown) =>
  AgentBriefsSchema.safeParse(input);

export const parsePublishPackage = (input: unknown): PublishPackage =>
  PublishPackageSchema.parse(input);

export const validatePublishPackage = (input: unknown) =>
  PublishPackageSchema.safeParse(input);

export const parseIdeaVariants = (input: unknown): IdeaVariant[] => {
  const candidate = typeof input === "object" && input !== null && "variants" in input
    ? (input as { variants: unknown }).variants
    : input;

  return IdeaVariantsSchema.parse(candidate);
};

export const validateIdeaVariants = (input: unknown) =>
  IdeaVariantsSchema.safeParse(
    typeof input === "object" && input !== null && "variants" in input
      ? (input as { variants: unknown }).variants
      : input,
  );

export const parseExperimentReport = (input: unknown): ExperimentReport =>
  ExperimentReportSchema.parse(input);

export const validateExperimentReport = (input: unknown) =>
  ExperimentReportSchema.safeParse(input);
