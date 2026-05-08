import { z } from "zod";
import type {
  CommentInsight,
  AgentBrief,
  DebateQuality,
  DebateTurn,
  EvidencePool,
  PublishDraft,
  PublishPackage,
  TopicScore,
  ViewpointMap,
} from "../core/types.js";

const NonEmptyStringSchema = z.string().trim().min(1);

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

export const parseDebateTurn = (input: unknown): DebateTurn =>
  DebateTurnSchema.parse(input);

export const parseQuestionRewrite = (input: unknown) =>
  QuestionRewriteSchema.parse(input);

export const validateQuestionRewrite = (input: unknown) =>
  QuestionRewriteSchema.safeParse(input);

export const validateDebateTurn = (input: unknown) =>
  DebateTurnSchema.safeParse(input);

export const parseViewpointMap = (input: unknown): ViewpointMap =>
  ViewpointMapSchema.parse(input);

export const validateViewpointMap = (input: unknown) =>
  ViewpointMapSchema.safeParse(input);

export const parsePublishDraft = (input: unknown): PublishDraft =>
  PublishDraftSchema.parse(input);

export const validatePublishDraft = (input: unknown) =>
  PublishDraftSchema.safeParse(input);

export const parseCommentInsight = (input: unknown): CommentInsight =>
  CommentInsightSchema.parse(input);

export const validateCommentInsight = (input: unknown) =>
  CommentInsightSchema.safeParse(input);

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
