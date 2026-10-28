import { describe, expect, test } from 'bun:test'
import { canReplaceEdit, replaceMessage } from '../plugins/silent-actions/js/operation'
import type { HTTP, Message } from '../plugins/silent-actions/js/operation'

const message: Message = {id: '123', channel_id: '456', content: 'old', author: {id: 'me'}, type: 0}
const endpoints = {MESSAGES: (c: string) => `/channels/${c}/messages`, MESSAGE: (c: string, m: string) => `/channels/${c}/messages/${m}`}
const noWait = async (_: number) => {}
function mock(id: string | undefined = '789', failOn?: string) {
 const calls: Array<{method: string; url: string; body?: any}> = []
 const http: HTTP = {
  async post(options: any) { calls.push({method: 'post', ...options}); if (failOn === 'post') throw new Error('post failed'); return {body: {id}} },
  async del(options: any) { calls.push({method: 'del', ...options}); if (options.url.endsWith(failOn ?? 'never')) throw new Error('delete failed') },
 }
 return {calls, http}
}
describe('silent operations', () => {
 test('edit sends a replacement before deleting the original', async () => {
  const {calls, http} = mock()
  await replaceMessage(http, endpoints, message, 'new', false, noWait)
  expect(calls.map(x => x.method)).toEqual(['post', 'del'])
  expect(calls[0].body).toMatchObject({content: 'new', nonce: '123', flags: 0, allowed_mentions: {parse: []}})
  expect(calls[1].url).toEndWith('/123')
 })
 test('delete removes the placeholder before the original', async () => {
  const {calls, http} = mock()
  await replaceMessage(http, endpoints, message, '** **', true, noWait)
  expect(calls.map(x => x.url)).toEqual(['/channels/456/messages','/channels/456/messages/789','/channels/456/messages/123'])
 })
 test('no confirmed replacement means no deletes', async () => {
  for (const id of ['', '123']) {
   const {calls, http} = mock(id)
   await expect(replaceMessage(http, endpoints, message, 'new', true, noWait)).rejects.toThrow()
   expect(calls).toHaveLength(1)
  }
 })
 test('failed placeholder deletion leaves the original alone', async () => {
  const {calls, http} = mock('789', '789')
  await expect(replaceMessage(http, endpoints, message, '** **', true, noWait)).rejects.toThrow()
  expect(calls).toHaveLength(2)
 })
 test('refuses edits that would discard information', () => {
  expect(canReplaceEdit(message, 'new')).toBe(true)
  expect(canReplaceEdit({...message, attachments: [{}]}, 'new')).toBe(false)
  expect(canReplaceEdit({...message, messageReference: {}}, 'new')).toBe(false)
  expect(canReplaceEdit({...message, type: 19}, 'new')).toBe(false)
  expect(canReplaceEdit(message, '  ')).toBe(false)
 })
})
