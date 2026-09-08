import { z } from 'zod/v4'
import type {
  DatabaseAnalysis,
  InsightNugget,
  InsightsResponse,
  InsightSummary,
  KnowledgeBase,
  KnowledgeSection,
  CourseItem,
  Overview,
  ValueCandidate,
  ValueCandidateIndex,
} from './insights.js'
import type {
  ChatClueDossier,
  ChatClueGroup,
  ChatSummary,
  ChatSynthesis,
  ChatSynthesisSection,
  SummaryInsight,
  TextExtract,
} from './chatResearch.js'
import type { SourceFileManifest, SourceIndexedFile } from './files.js'

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const objectSchema = <Value extends object>() => z.custom<Value>(
  (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
)

export const overviewSchema = z.object({
  chat: z.object({
    conversations: countSchema,
    messages: countSchema,
    textMessages: countSchema,
    contacts: countSchema,
  }).strict(),
  files: z.object({ archived: countSchema, indexed: countSchema, bytes: countSchema }).strict(),
  insights: z.object({ conversations: countSchema, nuggets: countSchema }).strict(),
}).strict() satisfies z.ZodType<Overview>

export const insightsResponseSchema = z.object({
  convCount: countSchema,
  nuggetCount: countSchema,
  byCategory: z.record(z.string(), z.array(objectSchema<InsightNugget>())),
  summaries: z.array(objectSchema<InsightSummary>()),
  boards: z.record(z.string(), z.string()),
}).strict() satisfies z.ZodType<InsightsResponse>

export const sourceFileManifestSchema = z.object({
  generatedAt: z.string(),
  roots: z.array(z.string()),
  files: z.array(objectSchema<SourceIndexedFile>()),
  stats: z.object({
    files: countSchema,
    bytes: countSchema,
    databaseCandidates: countSchema,
    mediaCandidates: countSchema,
    textCandidates: countSchema,
  }).strict(),
}).strict() satisfies z.ZodType<SourceFileManifest>

export const knowledgeBaseSchema = z.object({
  generatedAt: z.string(),
  sourceStatus: z.array(objectSchema<KnowledgeBase['sourceStatus'][number]>()),
  coursePlan: z.array(objectSchema<CourseItem>()),
  sections: z.array(objectSchema<KnowledgeSection>()),
}).strict() satisfies z.ZodType<KnowledgeBase>

export const chatSummarySchema = z.object({
  generatedAt: z.string(),
  coverage: objectSchema<ChatSummary['coverage']>(),
  boards: z.array(objectSchema<SummaryInsight>()),
  textExtracts: z.array(objectSchema<TextExtract>()),
}).strict() satisfies z.ZodType<ChatSummary>

export const chatClueDossierSchema = z.object({
  generatedAt: z.string(),
  totals: objectSchema<ChatClueDossier['totals']>(),
  groups: z.array(objectSchema<ChatClueGroup>()),
}).strict() satisfies z.ZodType<ChatClueDossier>

export const chatSynthesisSchema = z.object({
  generatedAt: z.string(),
  totals: objectSchema<ChatSynthesis['totals']>(),
  sections: z.array(objectSchema<ChatSynthesisSection>()),
}).strict() satisfies z.ZodType<ChatSynthesis>

export const databaseAnalysisSchema = z.object({
  generatedAt: z.string(),
  totals: objectSchema<DatabaseAnalysis['totals']>(),
  databases: z.array(objectSchema<DatabaseAnalysis['databases'][number]>()),
}).strict() satisfies z.ZodType<DatabaseAnalysis>

export const valueCandidateIndexSchema = z.object({
  generatedAt: z.string(),
  totals: objectSchema<ValueCandidateIndex['totals']>(),
  byBucket: z.record(z.string(), countSchema),
  byPreview: z.record(z.string(), countSchema),
  candidates: z.array(objectSchema<ValueCandidate>()),
}).strict() satisfies z.ZodType<ValueCandidateIndex>
