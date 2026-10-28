import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { canReplaceEdit, replaceMessage } from './operation'
import type { Message, HTTP, Endpoints } from './operation'
import type { JsonStorage } from '@valenced/json-storage'
import type { FC, ReactElement, ReactNode } from 'react'

const { ActionSheet, ActionSheetRow, TableCheckboxRow, AlertModal, AlertActionButton } = Design
const alertKey = 'mihile.silent-actions.error'
type Settings = { enabled: boolean }
type Tree = ReactElement<{children?: ReactNode}>
type Sheet = FC<{message: Message}>
type EditActions = { sendMessage: unknown; editMessage(channel: string, id: string, data: {content?: unknown}): Promise<unknown> }
type DeleteActions = { deleteMessage(channel: string, id: string, ...rest: unknown[]): Promise<unknown> }
type MessageStore = { getMessage(channel: string, id: string): Message | undefined }
let http: HTTP | undefined
let endpoints: Endpoints | undefined
let storage: JsonStorage<Settings>
let editReady = false
let deleteReady = false
const busy = new Set<string>()
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function error(message: string) {
 AlertActionCreators.openAlert(alertKey, <AlertModal title="Silent Actions" content={message} actions={<AlertActionButton text="OK" variant="primary" />} />)
}
function getMessage(channel: string, id: string) {
 return (Stores.MessageStore as unknown as MessageStore)?.getMessage(channel, id)
}
function own(message: Message) {
 const auth = Stores.AuthenticationStore as unknown as { getId(): string }
 return !!message.author?.id && message.author.id === auth?.getId()
}
async function run(message: Message, content: string, deleting: boolean) {
 if (busy.has(message.id)) throw new Error('Action already in progress')
 if (!http || !endpoints) {
  error('Discord message services are unavailable. No action was performed.')
  throw new Error('Discord message services unavailable')
 }
 busy.add(message.id)
 try {
  return await replaceMessage(http, endpoints, message, content, deleting, sleep)
 } catch (e) {
  console.error('[Silent Actions]', e)
  error('The action failed. A replacement may have been sent or deleted. Check the channel before retrying.')
  throw e
 } finally { busy.delete(message.id) }
}
function findSheet(element: unknown): Tree | undefined {
 if (Array.isArray(element)) { for (const child of element) { const found = findSheet(child); if (found) return found } return }
 if (!element || typeof element !== 'object') return
 const node = element as Tree
 if (node.type === ActionSheet) return node
 return findSheet(node.props?.children)
}
function Toggle() {
 const enabled = storage.use()?.enabled ?? true
 const ready = !!http && !!endpoints && editReady && deleteReady
 return <ActionSheetRow.Group><TableCheckboxRow label="Silent Actions" subLabel={ready ? 'Apply to your edits and deletes' : 'Message actions unavailable'} value="silent-actions" checked={enabled} onPress={() => storage.set({enabled: !enabled})} /></ActionSheetRow.Group>
}
export default plugin<{jsonStorage: Settings}>({
 jsonStorage: {load: true, default: {enabled: true}},
 start({cleanup, plugin, jsonStorage}) {
  storage = jsonStorage
  cleanup(getModules(withProps<{HTTP: HTTP}>('HTTP'), x => { if (typeof (x.HTTP as Partial<HTTP>)?.post === 'function' && typeof (x.HTTP as Partial<HTTP>)?.del === 'function') http = x.HTTP }))
  cleanup(getModules(withProps<{Endpoints: Endpoints}>('Endpoints'), x => { if (typeof (x.Endpoints as Partial<Endpoints>)?.MESSAGES === 'function' && typeof (x.Endpoints as Partial<Endpoints>)?.MESSAGE === 'function') endpoints = x.Endpoints }))
  cleanup(getModules(withProps<EditActions>('sendMessage', 'editMessage'), actions => {
   editReady = true
   cleanup(instead(actions, 'editMessage', function (args, original) {
    if (!(storage.cache?.enabled ?? true)) return Reflect.apply(original, this, args)
    const [channel, id, data] = args
    const message = getMessage(channel, id)
    if (!message || !own(message)) {
     error('Could not verify the message owner. Disable Silent Actions to edit normally.')
     return Promise.reject(new Error('Message owner unavailable'))
    }
    if (!canReplaceEdit(message, data?.content)) {
     error('This message cannot be replaced safely. Disable Silent Actions to edit it normally.')
     return Promise.reject(new Error('Unsupported silent edit'))
    }
    return run(message, data.content as string, false)
   }))
  }))
  cleanup(getModules(withProps<DeleteActions>('deleteMessage'), actions => {
   if (typeof actions.deleteMessage !== 'function') return
   deleteReady = true
   cleanup(instead(actions, 'deleteMessage', function (args, original) {
    if (!(storage.cache?.enabled ?? true)) return Reflect.apply(original, this, args)
    const [channel, id] = args
    if (typeof channel !== 'string' || typeof id !== 'string' || !/^\d+$/.test(channel) || !/^\d+$/.test(id)) return Reflect.apply(original, this, args)
    const message = getMessage(channel, id)
    if (!message) {
     error('Could not verify the message owner. Disable Silent Actions to delete normally.')
     return Promise.reject(new Error('Message owner unavailable'))
    }
    if (!own(message)) return Reflect.apply(original, this, args)
    return run(message, '** **', true)
   }))
  }))
  cleanup(getModules(withName<Sheet>('LongPressMessageActionSheet'), mod => {
   const namespace = mod as unknown as {default: Sheet}
   cleanup(instead(namespace, 'default', (args, original) => {
    const tree = Reflect.apply(original, undefined, args) as Tree
    try {
     const sheet = findSheet(tree)
     if (sheet) sheet.props.children = [...[sheet.props.children].flat().filter(Boolean), <Toggle key="silent-actions" />]
    } catch (e) { plugin.reportError(`Silent Actions menu: ${String(e)}`) }
    return tree
   }))
  }, {returnNamespace: true}))
  cleanup(() => { http = undefined; endpoints = undefined; editReady = false; deleteReady = false; AlertActionCreators.dismissAlert(alertKey) })
 }
})
