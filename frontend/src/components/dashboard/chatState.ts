import type { Message } from '@/types'

function isLocalMessageId(id: string) {
  return id.startsWith('temp-') || id.startsWith('stream-') || id.startsWith('error-')
}

function sameMessage(a: Message, b: Message) {
  return a.thread_id === b.thread_id && a.role === b.role && a.content === b.content
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

  for (const localMessage of currentMessages) {
    if (!isLocalMessageId(localMessage.id)) continue
    const alreadyPersisted = serverMessages.some((serverMessage) => sameMessage(serverMessage, localMessage))
    if (!alreadyPersisted) {
      merged.push(localMessage)
    }
  }

  return sortMessagesChronologically(merged)
}
