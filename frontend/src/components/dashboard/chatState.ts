import type { Message } from '@/types'

function isLocalMessageId(id: string) {
  return id.startsWith('temp-') || id.startsWith('stream-') || id.startsWith('error-')
}

function sortMessagesChronologically(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    return a.id.localeCompare(b.id)
  })
}

export function mergeServerMessages(serverMessages: Message[], currentMessages: Message[]) {
  const merged = [...serverMessages]

  // Count how many server messages already exist for each (role, content) pair.
  // When a user sends the same message twice, the server will eventually have
  // two copies. We must keep each local temp only if the server doesn't yet
  // have enough copies to account for it — otherwise the message disappears
  // from the UI in the window between the second send and the server sync.
  const serverCounts = new Map<string, number>()
  for (const m of serverMessages) {
    const key = `${m.thread_id}|${m.role}|${m.content}`
    serverCounts.set(key, (serverCounts.get(key) ?? 0) + 1)
  }

  const localConsumed = new Map<string, number>()
  for (const localMessage of currentMessages) {
    if (!isLocalMessageId(localMessage.id)) continue
    const key = `${localMessage.thread_id}|${localMessage.role}|${localMessage.content}`
    const serverHas = serverCounts.get(key) ?? 0
    const consumed = localConsumed.get(key) ?? 0
    if (consumed < serverHas) {
      // This local temp is already represented by a server message — drop it.
      localConsumed.set(key, consumed + 1)
    } else {
      // Server doesn't have this copy yet — keep the optimistic local message.
      merged.push(localMessage)
    }
  }

  return sortMessagesChronologically(merged)
}
