export type Message = {
 id: string
 channel_id: string
 content: string
 author: { id: string }
 attachments?: unknown[]
 message_reference?: unknown
 messageReference?: unknown
 type?: number
}
export type HTTP = {
 post(options: object): Promise<{ body?: { id?: string } }>
 del(options: object): Promise<unknown>
}
export type Endpoints = { MESSAGES(id: string): string; MESSAGE(channel: string, message: string): string }

export function canReplaceEdit(message: Message, content: unknown): boolean {
 return typeof content === 'string' && content.trim().length > 0 &&
  !message.attachments?.length && !message.message_reference && !message.messageReference &&
  (message.type == null || message.type === 0)
}

export async function replaceMessage(http: HTTP, endpoints: Endpoints, message: Message, content: string, deleting: boolean, sleep: (ms: number) => Promise<unknown>) {
 const response = await http.post({
  url: endpoints.MESSAGES(message.channel_id),
  body: { content, nonce: message.id, flags: 4096, tts: false, mobile_network_type: 'unknown', allowed_mentions: { parse: [], replied_user: false } },
 })
 const replacement = response?.body?.id
 if (!replacement || replacement === message.id) throw new Error('Replacement ID was not confirmed')
 await sleep(500)
 if (deleting) {
  await http.del({ url: endpoints.MESSAGE(message.channel_id, replacement) })
  await sleep(100)
 }
 await http.del({ url: endpoints.MESSAGE(message.channel_id, message.id) })
 return response
}
