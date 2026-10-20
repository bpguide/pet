import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHook, sameToken } from '../../src/shared/webhook.ts'

test('parses JSON, form, query and plain text bodies', () => {
  const j = parseHook('{"text":" hi ","title":"T","url":"https://a.b/c","duration":5}', 'application/json', {})
  assert.deepEqual(j, { text: 'hi', title: 'T', url: 'https://a.b/c', duration: 5 })
  assert.equal(parseHook('text=yo&url=http%3A%2F%2Fx.y', 'application/x-www-form-urlencoded', {}).url, 'http://x.y')
  assert.equal(parseHook('', '', { message: 'q' }).text, 'q')
  assert.equal(parseHook('plain words', 'text/plain', {}).text, 'plain words')
})

test('rejects empty, malformed and non-http links', () => {
  assert.equal(parseHook('', '', {}), null)
  assert.equal(parseHook('{bad', 'application/json', {}), null)
  assert.equal(parseHook('[1]', 'application/json', {}), null)
  assert.equal(parseHook('{"text":"x","url":"javascript:alert(1)"}', 'application/json', {}).url, undefined)
})

test('duration defaults, clamps and allows 0', () => {
  assert.equal(parseHook('{"text":"x"}', '', {}).duration, 30)
  assert.equal(parseHook('{"text":"x","duration":0}', '', {}).duration, 0)
  assert.equal(parseHook('{"text":"x","duration":99999}', '', {}).duration, 3600)
  assert.equal(parseHook('{"text":"x","duration":-1}', '', {}).duration, 30)
  assert.equal(parseHook(JSON.stringify({ text: 'a'.repeat(900) }), '', {}).text.length, 500)
})

test('token comparison', () => {
  assert.ok(sameToken('abc', 'abc'))
  assert.ok(!sameToken('abc', 'abd'))
  assert.ok(!sameToken('', ''))
})
