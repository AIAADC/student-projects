import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { canonicalPersonId } from '../../pipeline/wechat/personIdentity.js'
import { createFixtureRoot, md5, owner, peer, room, runParser } from './parseWeChatTestFixtures.js'

test('builds a non-destructive identity-aligned next database from strict snapshot coverage', () => {
  const root = createFixtureRoot()
  try {
    const first = runParser(root)
    assert.equal(first.status, 0, first.stderr || first.stdout)

    const bundleDir = path.join(root, 'data', 'wechat.next')
    const dbPath = path.join(bundleDir, 'wechat.db')
    const indexPath = path.join(bundleDir, 'index.json')
    const transcriptDir = path.join(bundleDir, 'transcripts')
    assert.equal(fs.existsSync(bundleDir), true)
    assert.equal(fs.statSync(bundleDir).isDirectory(), true)
    assert.equal(fs.existsSync(dbPath), true)
    assert.equal(fs.existsSync(indexPath), true)
    assert.equal(fs.existsSync(transcriptDir), true)
    assert.deepEqual(fs.readdirSync(bundleDir).sort(), ['index.json', 'transcripts', 'wechat.db'])
    assert.equal(fs.existsSync(path.join(root, 'data', 'wechat.next.db')), false)
    assert.equal(fs.existsSync(path.join(root, 'data', 'wechat', 'index.next.json')), false)
    assert.equal(fs.existsSync(path.join(root, 'work', 'chat-text-v2', 'fixture-run')), false)
    assert.equal(fs.existsSync(path.join(root, 'data', 'wechat.db')), false)
    assert.equal(fs.existsSync(path.join(root, 'work', 'chat-text')), false)

    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const conversations = db.prepare('SELECT account, owner, username FROM conversations ORDER BY username')
        .all()
        .map((row) => ({ ...row }))
      assert.deepEqual(conversations, [
        { account: 'snapshot-new', owner, username: room },
        { account: 'snapshot-new', owner, username: peer },
      ])

      const privateRows = db.prepare(`
        SELECT canonical_seq, server_id, CAST(raw_type AS TEXT) AS raw_type, type, sender, person_id,
          sender_source, sender_audit, source_adapter, source_db, local_id, source_sort_seq, text
        FROM messages WHERE conv_id=? ORDER BY canonical_seq
      `).all(`wx:${owner}:${peer}`).map((row) => ({ ...row }))
      assert.deepEqual(privateRows, [
        {
          canonical_seq: 0, server_id: '1002', raw_type: '1', type: 1, sender: peer,
          person_id: canonicalPersonId(owner, peer), sender_source: 'message-name2id', sender_audit: '',
          source_adapter: 'regular', source_db: 'message_1.db', local_id: 5, source_sort_seq: 10,
          text: '对端先发出的中文',
        },
        {
          canonical_seq: 1, server_id: '1004', raw_type: '1', type: 1, sender: peer,
          person_id: canonicalPersonId(owner, peer), sender_source: 'message-name2id', sender_audit: '',
          source_adapter: 'biz', source_db: 'biz_message_0.db', local_id: 7, source_sort_seq: 15,
          text: '企业消息进入统一顺序',
        },
        {
          canonical_seq: 2, server_id: '1001', raw_type: '9223372032559808513', type: 1, sender: owner,
          person_id: canonicalPersonId(owner, owner), sender_source: 'message-name2id', sender_audit: '',
          source_adapter: 'regular', source_db: 'message_0.db', local_id: 1, source_sort_seq: 20,
          text: '机主发出的中文',
        },
        {
          canonical_seq: 3, server_id: '0', raw_type: '1', type: 1, sender: '', person_id: null,
          sender_source: 'unknown', sender_audit: 'private-direction-unknown', source_adapter: 'regular',
          source_db: 'message_0.db', local_id: 2, source_sort_seq: 30, text: '身份未知但正文保留',
        },
      ])
      assert.deepEqual(
        db.prepare('SELECT username,display_name FROM people ORDER BY username').all().map((row) => ({ ...row })),
        [
          { username: room, display_name: '中文项目群' },
          { username: owner, display_name: '机主' },
          { username: peer, display_name: '陈同学' },
          { username: 'wxid_member', display_name: '群成员甲' },
        ].sort((left, right) => left.username.localeCompare(right.username)),
      )
      assert.equal(
        db.prepare("SELECT count(*) AS total FROM messages WHERE time_precision='second' AND archive_day='2023-11-15'")
          .get()?.total,
        5,
      )
      assert.equal(
        db.prepare("SELECT count(*) AS total FROM messages WHERE sender_audit='group-prefix-mismatch'").get()?.total,
        0,
      )
      assert.deepEqual(
        db.prepare(`
          SELECT run_id, status, schema_version, time_zone, selected_snapshot_count, selected_source_count,
            source_unit_count, excluded_source_row_count,
            source_conversation_count, source_message_count, output_conversation_count,
            output_message_count, output_text_count, deduplicated_message_count
          FROM parse_runs
        `).all().map((row) => ({ ...row })),
        [{
          run_id: 'fixture-run',
          status: 'complete',
          schema_version: 2,
          time_zone: 'Asia/Shanghai',
          selected_snapshot_count: 1,
          selected_source_count: 5,
          source_unit_count: 7,
          excluded_source_row_count: 3,
          source_conversation_count: 2,
          source_message_count: 6,
          output_conversation_count: 2,
          output_message_count: 5,
          output_text_count: 5,
          deduplicated_message_count: 1,
        }],
      )
      assert.deepEqual(
        db.prepare(`
          SELECT domain,source_db,source_table,discovered_rows,parsed_rows,
            deduplicated_rows,excluded_rows,exclusion_reason
          FROM source_inventory ORDER BY source_db,source_table
        `).all().map((row) => ({ ...row })),
        [
          ['biz', 'biz_message_0.db', `Msg_${md5(peer)}`, 1, 1, 0, 0, null],
          ['regular', 'message_0.db', `Msg_${md5(peer)}`, 3, 2, 1, 0, null],
          ['regular', 'message_1.db', `Msg_${md5(peer)}`, 1, 1, 0, 0, null],
          ['regular', 'message_1.db', `Msg_${md5(room)}`, 1, 1, 0, 0, null],
          ['resource', 'message_resource.db', 'MessageResourceDetail', 1, 0, 0, 1, 'deferred_resource_adapter'],
          ['resource', 'message_resource.db', 'MessageResourceInfo', 1, 0, 0, 1, 'deferred_resource_adapter'],
          ['media', 'media_0.db', 'VoiceInfo', 1, 0, 0, 1, 'deferred_media_adapter'],
        ].sort((left, right) => `${left[1]}\0${left[2]}`.localeCompare(`${right[1]}\0${right[2]}`))
          .map(([domain, source_db, source_table, discovered_rows, parsed_rows, deduplicated_rows, excluded_rows, exclusion_reason]) => ({
            domain, source_db, source_table, discovered_rows, parsed_rows, deduplicated_rows, excluded_rows, exclusion_reason,
          })),
      )
    } finally {
      db.close()
    }

    const transcriptFiles = fs.readdirSync(transcriptDir).filter((name) => name.endsWith('.txt'))
    assert.equal(transcriptFiles.length, 2)
    const transcriptText = transcriptFiles
      .map((name) => fs.readFileSync(path.join(transcriptDir, name), 'utf8'))
      .join('\n')
    assert.match(transcriptText, /机主发出的中文/)
    assert.match(transcriptText, /群聊中文正文/)
    assert.match(transcriptText, /\[2023-11-15 06:13:20 \+08:00\]/u)
    assert.match(transcriptText, /time-zone: Asia\/Shanghai/u)
    assert.equal(transcriptText.includes('\uFFFD'), false)

    const before = fs.readFileSync(dbPath)
    const second = runParser(root)
    assert.notEqual(second.status, 0)
    assert.match(second.stderr, /already exists/i)
    assert.deepEqual(fs.readFileSync(dbPath), before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('keeps transcript filenames and index summaries on Unicode code-point boundaries', () => {
  const root = createFixtureRoot({ boundaryUnicode: true })
  try {
    const result = runParser(root)
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const bundleDir = path.join(root, 'data', 'wechat.next')
    const index = JSON.parse(fs.readFileSync(path.join(bundleDir, 'index.json'), 'utf8')) as {
      conversations: Array<{ username: string, summary: string }>
    }
    const peerEntry = index.conversations.find((entry) => entry.username === peer)
    const emoji = String.fromCodePoint(0x1f600)
    assert.equal(peerEntry?.summary, `${'摘'.repeat(119)}${emoji}`)
    assert.equal(peerEntry?.summary.includes('\uFFFD'), false)

    const transcriptFiles = fs.readdirSync(path.join(bundleDir, 'transcripts'))
    const peerSuffix = `__${md5(peer).slice(0, 8)}.txt`
    const peerTranscript = transcriptFiles.find((name) => name.endsWith(peerSuffix))
    assert.equal(peerTranscript, `${'陈'.repeat(79)}${emoji}${peerSuffix}`)
    assert.equal(peerTranscript?.includes('\uFFFD'), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('uses one configured archive time zone for database days and transcript seconds', () => {
  const root = createFixtureRoot()
  try {
    const result = runParser(root, 'America/Los_Angeles')
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const bundleDir = path.join(root, 'data', 'wechat.next')
    const db = new DatabaseSync(path.join(bundleDir, 'wechat.db'), { readOnly: true })
    try {
      assert.deepEqual(
        db.prepare('SELECT DISTINCT archive_day FROM messages').all().map((row) => ({ ...row })),
        [{ archive_day: '2023-11-14' }],
      )
      assert.equal(db.prepare("SELECT value FROM bundle_metadata WHERE key='time_zone'").get()?.value, 'America/Los_Angeles')
    } finally {
      db.close()
    }
    const transcript = fs.readdirSync(path.join(bundleDir, 'transcripts'))
      .map((name) => fs.readFileSync(path.join(bundleDir, 'transcripts', name), 'utf8'))
      .join('\n')
    assert.match(transcript, /\[2023-11-14 14:13:20 -08:00\]/u)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function assertNoFinalOutputs(root: string) {
  assert.equal(fs.existsSync(path.join(root, 'data', 'wechat.next')), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'wechat.next.db')), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'wechat', 'index.next.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'work', 'chat-text-v2', 'fixture-run')), false)
}

for (const [name, options, pattern] of [
  ['rejects conflicting duplicate semantics without publishing final artifacts', { conflictingDuplicate: true }, /conflicting duplicate/i],
  ['rejects conflicting evidence-key semantics without publishing final artifacts', { conflictingEvidence: true }, /duplicate exact evidence key/i],
  ['rejects duplicate exact evidence keys even when message semantics match', { duplicateExactEvidence: true }, /duplicate exact evidence key/i],
  ['rejects repeated evidence after its first row was folded by server identity', { repeatedFoldedEvidence: true }, /duplicate exact evidence key/i],
] as const) {
  test(name, () => {
    const root = createFixtureRoot(options)
    try {
      const result = runParser(root)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, pattern)
      assertNoFinalOutputs(root)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
}

test('does not treat a changed message body as strict snapshot coverage', () => {
  const root = createFixtureRoot({ changedSharedMessage: true })
  try {
    const result = runParser(root)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /ambiguous account snapshots/i)
    assertNoFinalOutputs(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
