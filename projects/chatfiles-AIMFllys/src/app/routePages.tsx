import { createElement, lazy, type ComponentType } from 'react'
import type { Tab } from './navigation'

const OverviewPage = lazy(() => import('../pages/OverviewPage'))
const ChatPage = lazy(() => import('../pages/ChatPage'))
const FilesPage = lazy(() => import('../pages/FilesPage'))
const InsightsPage = lazy(() => import('../pages/InsightsPage'))
const AcademicsPage = lazy(() => import('../pages/AcademicsPage'))
const MediaPage = lazy(() => import('../pages/MediaPage'))
const KnowledgePage = lazy(() => import('../pages/KnowledgePage'))
const SummaryPage = lazy(() => import('../pages/SummaryPage'))
const CluesPage = lazy(() => import('../pages/CluesPage'))
const SynthesisPage = lazy(() => import('../pages/SynthesisPage'))
const DatabasesPage = lazy(() => import('../pages/DatabasesPage'))
const CandidatesPage = lazy(() => import('../pages/CandidatesPage'))
const AISettingsPage = lazy(() => import('../pages/AISettingsPage'))

const pageComponents: Record<Tab, ComponentType> = {
  overview: OverviewPage,
  chat: ChatPage,
  files: FilesPage,
  insights: InsightsPage,
  academics: AcademicsPage,
  media: MediaPage,
  knowledge: KnowledgePage,
  summary: SummaryPage,
  clues: CluesPage,
  synthesis: SynthesisPage,
  databases: DatabasesPage,
  candidates: CandidatesPage,
  ai: AISettingsPage,
}

export function RoutePage({ page }: { page: Tab }) {
  return createElement(pageComponents[page])
}
