import assert from 'node:assert/strict'
import test from 'node:test'

import {
  chatClueDossierSchema,
  chatSummarySchema,
  chatSynthesisSchema,
  databaseAnalysisSchema,
  insightsResponseSchema,
  knowledgeBaseSchema,
  overviewSchema,
  sourceFileManifestSchema,
  valueCandidateIndexSchema,
} from './uiData.js'

test('validates the top-level shape of every lazy-page data product', () => {
  assert.equal(overviewSchema.safeParse({
    chat: { conversations: 1, messages: 2, textMessages: 2, contacts: 1 },
    files: { archived: 0, indexed: 0, bytes: 0 },
    insights: { conversations: 0, nuggets: 0 },
  }).success, true)
  assert.equal(insightsResponseSchema.safeParse({
    convCount: 0, nuggetCount: 0, byCategory: {}, summaries: [], boards: {},
  }).success, true)
  assert.equal(sourceFileManifestSchema.safeParse({
    generatedAt: '2026-07-13T12:34:56.000Z', roots: [], files: [],
    stats: { files: 0, bytes: 0, databaseCandidates: 0, mediaCandidates: 0, textCandidates: 0 },
  }).success, true)
  assert.equal(knowledgeBaseSchema.safeParse({
    generatedAt: '2026-07-13T12:34:56.000Z', sourceStatus: [], coursePlan: [], sections: [],
  }).success, true)
  assert.equal(chatSummarySchema.safeParse({ generatedAt: 'x', coverage: {}, boards: [], textExtracts: [] }).success, true)
  assert.equal(chatClueDossierSchema.safeParse({ generatedAt: 'x', totals: {}, groups: [] }).success, true)
  assert.equal(chatSynthesisSchema.safeParse({ generatedAt: 'x', totals: {}, sections: [] }).success, true)
  assert.equal(databaseAnalysisSchema.safeParse({ generatedAt: 'x', totals: {}, databases: [] }).success, true)
  assert.equal(valueCandidateIndexSchema.safeParse({
    generatedAt: 'x', totals: {}, byBucket: {}, byPreview: {}, candidates: [],
  }).success, true)
})

test('rejects missing or wrongly typed page collections instead of casting them', () => {
  assert.equal(overviewSchema.safeParse({ chat: {}, files: {}, insights: {} }).success, false)
  assert.equal(insightsResponseSchema.safeParse({
    convCount: 0, nuggetCount: 0, byCategory: [], summaries: [], boards: {},
  }).success, false)
  assert.equal(sourceFileManifestSchema.safeParse({
    generatedAt: 'x', roots: [], files: {}, stats: {},
  }).success, false)
  assert.equal(knowledgeBaseSchema.safeParse({
    generatedAt: 'x', sourceStatus: [], coursePlan: [], sections: '坏数据',
  }).success, false)
  assert.equal(chatSummarySchema.safeParse({ generatedAt: 'x', coverage: {}, boards: {}, textExtracts: [] }).success, false)
})
