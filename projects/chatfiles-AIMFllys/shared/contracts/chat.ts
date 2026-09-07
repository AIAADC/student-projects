export type { MessageDto, WechatMessage } from './chatIdentity.js'
export { messageDtoSchema } from './chatIdentity.js'
export type {
  TimelineBucket,
  TimelineCursor,
  TimelineDay,
  TimelineDayPage,
  TimelineMessage,
  TimelinePage,
  TimelinePageInfo,
  TimelineParticipant,
  TimelineParticipantPage,
} from './chatTimeline.js'
export type { LinkPreview, LinkPreviewStatus } from './linkPreview.js'

export type {
  SummaryInsight,
  TextExtract,
  ChatSummary,
  CompletionAuditItem,
  CompletionAudit,
  SourceTextExtract,
  SourceTextIndex,
  ChatExportMessage,
  ChatExportConversation,
  ChatExportIndex,
  ChatClueGroup,
  ChatClueDossier,
  ChatSynthesisItem,
  ChatSynthesisSection,
  ChatSynthesis,
  BinaryTextSnippet,
  BinaryTextIndex,
  LogTextIndex,
} from './chatResearch.js'

export type {
  WechatConversation,
  WechatConversationList,
  ChatArtifactTab,
  ChatArtifactAvailability,
  ChatArtifactCounts,
  ChatArtifactItem,
  ChatTextItem,
  ChatArtifactListItem,
  ChatArtifactPage,
  ChatArtifactCapability,
  ChatArtifactMetadata,
} from './chatLibrary.js'

export {
  chatArtifactAvailabilitySchema,
  chatArtifactCapabilitySchema,
  chatArtifactItemSchema,
  chatArtifactMetadataSchema,
  chatArtifactPageSchema,
  chatArtifactTabSchema,
  chatTextItemSchema,
  wechatConversationListSchema,
  wechatConversationSchema,
} from './chatLibrary.js'

export { wechatMessageSchema } from './chatIdentity.js'
export {
  timelineBucketSchema,
  timelineCursorSchema,
  timelineDayPageSchema,
  timelineDaySchema,
  timelineMessageSchema,
  timelinePageInfoSchema,
  timelinePageSchema,
  timelineParticipantSchema,
  timelineParticipantPageSchema,
} from './chatTimeline.js'
export { linkPreviewSchema, linkPreviewStatusSchema } from './linkPreview.js'
