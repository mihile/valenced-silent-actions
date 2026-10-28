import { ActionSheetActionCreators, AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useState } from 'react'
import type { FC, ReactElement, ReactNode } from 'react'

const { ActionSheet, ActionSheetRow, AlertModal, AlertActionButton, TextInput } = Design
const alertKey = 'mihile.silent-actions'
type Message = { id: string; channel_id: string; content: string; author: { id: string }; attachments?: unknown[]; message_reference?: unknown; messageReference?: unknown; type?: number }
type Tree = ReactElement<{children?: ReactNode}>
type Sheet = FC<{message: Message}>
type HTTP = { post(options: object): Promise<{body?: {id?: string}}> ; del(options: object): Promise<unknown> }
type Endpoints = { MESSAGES(id: string): string; MESSAGE(channel: string, message: string): string }
let http: HTTP | undefined
let endpoints: Endpoints | undefined
const busy = new Set<string>()
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function run(message: Message, content: string, deleting: boolean) {
 if (busy.has(message.id)) return
 busy.add(message.id)
 let replacement: string | undefined
 try {
  if (!http || !endpoints) throw new Error('Discord HTTP modules are unavailable.')
  const response = await http.post({url: endpoints.MESSAGES(message.channel_id), body: {content, nonce: message.id, flags: 4096, tts: false, mobile_network_type: 'unknown', allowed_mentions: {parse: [], replied_user: false}}})
  replacement = response?.body?.id
  if (!replacement || replacement === message.id) throw new Error('Replacement ID was not confirmed. The original was not deleted.')
  await sleep(500)
  if (deleting) {
   await http.del({url: endpoints.MESSAGE(message.channel_id, replacement)})
   await sleep(100)
  }
  await http.del({url: endpoints.MESSAGE(message.channel_id, message.id)})
 } catch (error) {
  console.error('[Silent Actions]', error)
  AlertActionCreators.openAlert(alertKey + '.error', <AlertModal title="Silent action failed" content={replacement ? 'A replacement was sent, but a deletion failed. Check the channel before retrying.' : 'The original was not deleted. A replacement may have been sent; check the channel before retrying.'} actions={<AlertActionButton text="OK" variant="primary" />} />)
 } finally { busy.delete(message.id) }
}

function EditDialog({message}: {message: Message}) {
 const [content, setContent] = useState(message.content)
 return <AlertModal title="Silent Edit" content="Sends a replacement and deletes the original." extraContent={<TextInput label="Message" defaultValue={message.content} onChange={setContent} />} actions={<><AlertActionButton text="Cancel" variant="secondary" /><AlertActionButton text="Send" variant="primary" onPress={() => { if (content.trim() && content !== message.content) void run(message, content, false) }} /></>} />
}
function openDelete(message: Message) {
 AlertActionCreators.openAlert(alertKey, <AlertModal title="Silent Delete" content="Sends and deletes a placeholder, then deletes the original message." actions={<><AlertActionButton text="Cancel" variant="secondary" /><AlertActionButton text="Delete" variant="destructive" onPress={() => void run(message, '** **', true)} /></>} />)
}
function findSheet(element: unknown): Tree | undefined {
 if (Array.isArray(element)) { for (const child of element) { const found = findSheet(child); if (found) return found } return }
 if (!element || typeof element !== 'object') return
 const node = element as Tree
 if (node.type === ActionSheet) return node
 return findSheet(node.props?.children)
}
export default plugin({
 start({cleanup, plugin}) {
  cleanup(getModules(withProps<{HTTP: HTTP}>('HTTP'), x => { if (typeof (x.HTTP as Partial<HTTP>)?.post === 'function' && typeof (x.HTTP as Partial<HTTP>)?.del === 'function') http = x.HTTP }))
  cleanup(getModules(withProps<{Endpoints: Endpoints}>('Endpoints'), x => { if (typeof (x.Endpoints as Partial<Endpoints>)?.MESSAGES === 'function' && typeof (x.Endpoints as Partial<Endpoints>)?.MESSAGE === 'function') endpoints = x.Endpoints }))
  cleanup(getModules(withName<Sheet>('LongPressMessageActionSheet'), mod => {
   const namespace = mod as unknown as {default: Sheet}
   cleanup(instead(namespace, 'default', (args, original) => {
    const tree = Reflect.apply(original, undefined, args) as Tree
    try {
     const message = args[0]?.message
     const auth = Stores.AuthenticationStore as unknown as { getId(): string }
     if (!message || !http || !endpoints || message.author?.id !== auth?.getId() || !message.id || !message.channel_id || message.type && message.type !== 0 && message.type !== 19) return tree
     const sheet = findSheet(tree)
     if (!sheet) return tree
     const close = (fn: () => void) => () => { ActionSheetActionCreators.hideActionSheet(); fn() }
     const editable = !!message.content && !message.attachments?.length && !message.message_reference && !message.messageReference
     const group = <ActionSheetRow.Group key="silent-actions">{editable && <ActionSheetRow label="Silent Edit" onPress={close(() => AlertActionCreators.openAlert(alertKey, <EditDialog message={message} />))} />}<ActionSheetRow label="Silent Delete" variant="danger" onPress={close(() => openDelete(message))} /></ActionSheetRow.Group>
     sheet.props.children = [...[sheet.props.children].flat().filter(Boolean), group]
    } catch (error) { plugin.reportError(`Silent Actions menu: ${String(error)}`) }
    return tree
   }))
  }, {returnNamespace: true}))
  cleanup(() => { http = undefined; endpoints = undefined; AlertActionCreators.dismissAlert(alertKey) })
 }
})
