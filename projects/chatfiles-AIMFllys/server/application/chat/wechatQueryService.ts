import type { DatabaseSync } from 'node:sqlite'

import { isCanonicalWechatDatabase } from '../../domain/chat/canonicalWechatDatabase.js'
import { readWechatBundleIdentity } from '../../domain/chat/wechatBundleIdentity.js'
import {
  encodeTimelineAnchor,
  queryTimeline,
  type TimelineQueryInput,
} from '../../services/chatTimeline.js'
import {
  queryTimelineDays,
  queryTimelineParticipants,
  type TimelineDayQueryInput,
} from '../../services/chatTimelineFacets.js'
import { queryArtifacts, type ArtifactQueryInput } from '../../wechat/artifactQuery.js'

type DatabaseLease = { db: DatabaseSync | null; release: () => void }
type WechatQueryAdapters = {
  openWechatDatabase: () => DatabaseLease
  openProductDatabases: () => { wechat: DatabaseLease; artifacts: DatabaseLease }
}

export class WechatQueryError extends Error {
  constructor(public readonly code: 'not_found' | 'unavailable' | 'offset_not_satisfiable') {
    super(code)
    this.name = 'WechatQueryError'
  }
}

export function createWechatQueryService(adapters: WechatQueryAdapters) {
  function withTimelineDatabase<Result>(
    conversationId: string,
    execute: (database: DatabaseSync) => Result,
  ) {
    const lease = adapters.openWechatDatabase()
    if (!lease.db) throw new WechatQueryError('unavailable')
    try {
      if (!isCanonicalWechatDatabase(lease.db)) throw new WechatQueryError('unavailable')
      const exists = lease.db.prepare('SELECT 1 FROM conversations WHERE id=?').get(conversationId)
      if (!exists) throw new WechatQueryError('not_found')
      return execute(lease.db)
    } catch (error) {
      if (error instanceof WechatQueryError) throw error
      throw new WechatQueryError('unavailable')
    } finally {
      lease.release()
    }
  }

  return {
    conversations() {
      const lease = adapters.openWechatDatabase()
      if (!lease.db) throw new WechatQueryError('unavailable')
      try {
        const conversations = lease.db.prepare(`
          SELECT id, account, username, display, is_group, msg_count, text_count,
                 first_time, last_time, summary
          FROM conversations ORDER BY last_time DESC
        `).all()
        const totals = lease.db.prepare(`
          SELECT count(*) AS conversations, sum(msg_count) AS messages,
                 sum(text_count) AS textMessages FROM conversations
        `).get()
        return { ...readWechatBundleIdentity(lease.db),conversations,totals }
      } catch {
        throw new WechatQueryError('unavailable')
      } finally {
        lease.release()
      }
    },

    timeline(input: TimelineQueryInput & { aroundUid?: string }) {
      return withTimelineDatabase(input.conversationId, (database) => {
        const { aroundUid, ...timelineInput } = input
        if (!aroundUid) return queryTimeline(database, timelineInput)
        const around = encodeTimelineAnchor(database, input.conversationId, aroundUid)
        if (!around) throw new WechatQueryError('not_found')
        return queryTimeline(database, { ...timelineInput, around })
      })
    },

    timelineParticipants(input: { conversationId: string; query?: string }) {
      return withTimelineDatabase(input.conversationId, (database) => (
        queryTimelineParticipants(database, input)
      ))
    },

    timelineDays(input: TimelineDayQueryInput) {
      return withTimelineDatabase(input.conversationId, (database) => queryTimelineDays(database, input))
    },

    artifacts(input: ArtifactQueryInput) {
      const leases = adapters.openProductDatabases()
      const wechat = leases.wechat
      const artifacts = leases.artifacts
      try {
        if (!wechat.db || !artifacts.db || !isCanonicalWechatDatabase(wechat.db)) {
          throw new WechatQueryError('unavailable')
        }
        if (input.conversationId !== undefined) {
          const exists = wechat.db.prepare('SELECT 1 FROM conversations WHERE id=?').get(input.conversationId)
          if (!exists) throw new WechatQueryError('not_found')
        }
        const page = queryArtifacts(artifacts.db, wechat.db, input)
        if (page.offset > page.matchingTotal) throw new WechatQueryError('offset_not_satisfiable')
        return page
      } catch (error) {
        if (error instanceof WechatQueryError) throw error
        throw new WechatQueryError('unavailable')
      } finally {
        artifacts.release()
        wechat.release()
      }
    },
  }
}

export type WechatQueryService = ReturnType<typeof createWechatQueryService>
