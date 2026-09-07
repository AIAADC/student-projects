import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { queryArtifacts } from './artifactQuery.js'

test('returns normalized association, source, materialization, and capability axes from a v2 catalog', () => {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  try {
    assetDb.exec(`
      CREATE TABLE artifacts(
        asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
        url TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,
        materialization TEXT,preview_status TEXT,link_status TEXT,association_status TEXT,
        confirmation_status TEXT,
        association_evidence TEXT,source_presence TEXT
      );
      INSERT INTO artifacts VALUES
      (
        '${'a'.repeat(64)}','conv','document','resource','规范资料.pdf','pdf',NULL,4,100,
        '成员','证据','ready','ready','confirmed','exact','confirmed','lookup_evidence','present'
      ),(
        '${'e'.repeat(64)}','conv','link','link','不应公开的部分关联','link','https://example.test/',
        NULL,100,'成员','','ready','ready','confirmed','partial','confirmed','message_text','not_applicable'
      );
    `)
    wechatDb.exec('CREATE TABLE messages(conv_id TEXT,type INTEGER,text TEXT,sender_name TEXT)')

    const page = queryArtifacts(assetDb, wechatDb, {
      collection: 'library', tab: 'all', query: '', limit: 10, offset: 0,
    })

    const item = page.items[0]
    assert.equal(item?.itemType, 'artifact')
    if (item?.itemType !== 'artifact') throw new Error('Expected an artifact item')
    assert.equal(item.availability, 'ready')
    assert.deepEqual(item.association, { status: 'exact', evidence: 'lookup_evidence' })
    assert.deepEqual(item.source, { presence: 'present' })
    assert.deepEqual(item.materialization, { status: 'ready' })
    assert.deepEqual(item.capability, { previewStatus: 'ready' })
    assert.equal(page.items.length, 1)
  } finally {
    assetDb.close()
    wechatDb.close()
  }
})

test('preserves normalized failure states when preview capability is unavailable', () => {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  try {
    assetDb.exec(`
      CREATE TABLE artifacts(
        asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
        url TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,
        materialization TEXT,preview_status TEXT,link_status TEXT,association_status TEXT,
        confirmation_status TEXT,
        association_evidence TEXT,source_presence TEXT
      );
      INSERT INTO artifacts VALUES
        ('${'b'.repeat(64)}','conv','document','resource','解密失败.dat','image',NULL,4,100,
         '成员','','decrypt_failed','unavailable','confirmed','exact','confirmed','lookup_evidence','present'),
        ('${'c'.repeat(64)}','conv','document','resource','来源冲突.pdf','pdf',NULL,NULL,100,
         '成员','','not_attempted','unavailable','confirmed','exact','confirmed','lookup_evidence','ambiguous'),
        ('${'d'.repeat(64)}','conv','document','resource','编码不支持.bin','download',NULL,4,100,
         '成员','','unsupported_codec','unavailable','confirmed','exact','confirmed','lookup_evidence','present');
    `)
    wechatDb.exec('CREATE TABLE messages(conv_id TEXT,type INTEGER,text TEXT,sender_name TEXT)')

    const page = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 10, offset: 0 })
    const states = new Map(page.items.flatMap((item) => (
      item.itemType === 'artifact'
        ? [[item.name, {
          availability: item.availability,
          materialization: item.materialization.status,
          previewCapability: item.capability.previewStatus,
        }] as const]
        : []
    )))
    assert.deepEqual(states.get('解密失败.dat'), {
      availability: 'decrypt_failed', materialization: 'decrypt_failed', previewCapability: 'unavailable',
    })
    assert.deepEqual(states.get('来源冲突.pdf'), {
      availability: 'not_attempted', materialization: 'not_attempted', previewCapability: 'unavailable',
    })
    assert.deepEqual(states.get('编码不支持.bin'), {
      availability: 'unsupported_codec', materialization: 'unsupported_codec', previewCapability: 'unavailable',
    })
  } finally {
    assetDb.close()
    wechatDb.close()
  }
})
