import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod/v4'

import { ApiClientError, readJson } from './client.js'
import * as client from './client.js'

const schema = z.object({ value: z.string() }).strict()

test('validates status, JSON content type, and response schema centrally', async () => {
  const valid = await readJson('/api/value', schema, {
    fetchImpl: async () => new Response(JSON.stringify({ value: '中文🙂' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  })
  assert.deepEqual(valid, { value: '中文🙂' })

  for (const [response, code] of [
    [new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }), 'request_failed'],
    [new Response('{}', { status: 200, headers: { 'content-type': 'text/html' } }), 'invalid_content_type'],
    [new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }), 'invalid_json'],
    [new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }), 'invalid_response'],
  ] as const) {
    await assert.rejects(
      readJson('/api/value', schema, { fetchImpl: async () => response }),
      (error: unknown) => error instanceof ApiClientError && error.code === code,
    )
  }
})

test('validates status and content type for text and binary responses', async () => {
  const api = client as typeof client & {
    readText?: FetchText
    readBlob?: FetchBlob
    readArrayBuffer?: FetchArrayBuffer
  }
  assert.equal(typeof api.readText, 'function')
  assert.equal(typeof api.readBlob, 'function')
  assert.equal(typeof api.readArrayBuffer, 'function')
  if (!api.readText || !api.readBlob || !api.readArrayBuffer) return

  assert.equal(await api.readText('/text', {
    fetchImpl: async () => new Response('中文🙂', { headers: { 'content-type': 'text/plain' } }),
  }), '中文🙂')
  assert.equal(await api.readText('/json-text', {
    fetchImpl: async () => new Response('{"中文":true}', { headers: { 'content-type': 'application/json' } }),
  }), '{"中文":true}')
  assert.equal((await api.readBlob('/blob', {
    fetchImpl: async () => new Response('bytes', { headers: { 'content-type': 'application/octet-stream' } }),
  })).size, 5)
  assert.equal((await api.readArrayBuffer('/buffer', {
    fetchImpl: async () => new Response('data', { headers: { 'content-type': 'application/zip' } }),
  })).byteLength, 4)
  await assert.rejects(
    api.readBlob('/error', {
      fetchImpl: async () => new Response('{}', {
        status: 404, headers: { 'content-type': 'application/json' },
      }),
    }),
    (error: unknown) => error instanceof ApiClientError && error.code === 'request_failed',
  )
})

type FetchText = (url: string, options?: { signal?: AbortSignal, fetchImpl?: typeof fetch }) => Promise<string>
type FetchBlob = (url: string, options?: { signal?: AbortSignal, fetchImpl?: typeof fetch }) => Promise<Blob>
type FetchArrayBuffer = (
  url: string,
  options?: { signal?: AbortSignal, fetchImpl?: typeof fetch },
) => Promise<ArrayBuffer>
