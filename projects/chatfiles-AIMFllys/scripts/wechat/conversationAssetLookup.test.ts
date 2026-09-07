import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  CANONICAL_LOCAL_LOOKUP_PREDICATE,
  CANONICAL_SERVER_LOOKUP_PREDICATE,
} from './conversationAssetBuilder.js'

test('canonical resource lookups bind every available identity index column', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE messages(
        source_snapshot TEXT,conv_id TEXT,source_db TEXT,source_table TEXT,local_id INTEGER,
        server_id TEXT,message_uid TEXT
      );
      CREATE INDEX idx_msg_evidence ON messages(conv_id,source_db,source_table,local_id);
      CREATE UNIQUE INDEX idx_msg_server ON messages(conv_id,server_id)
        WHERE server_id IS NOT NULL AND trim(server_id)<>'' AND server_id<>'0';
    `)
    const localPlan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT message_uid FROM messages m
      WHERE ${CANONICAL_LOCAL_LOOKUP_PREDICATE}
    `).all('snapshot', 'conv', 'message_0.db', 'Msg_0123456789abcdef0123456789abcdef', 42)
    const serverPlan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT message_uid FROM messages m
      WHERE ${CANONICAL_SERVER_LOOKUP_PREDICATE}
    `).all('snapshot', 'conv', '9001')
    assert.equal(String(localPlan[0]?.detail).includes('idx_msg_evidence'), true)
    assert.equal(String(serverPlan[0]?.detail).includes('idx_msg_server'), true)
  } finally {
    db.close()
  }
})
