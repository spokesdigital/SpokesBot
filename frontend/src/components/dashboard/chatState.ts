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

  // Build two dedup indices for server messages:
  //   1. Full key (thread_id|role|content) — used when the local temp already has the real thread_id.
  //   2. Content-only key (role|content) — fallback for new-thread optimistic messages whose
  //      thread_id is '' (empty string) because the thread hadn't been created yet when the
  //      optimistic message was inserted. Without this fallback, the keys never match and the
  //      temp message survives alongside the server message, producing duplicates.
  const serverCountsFull = new Map<string, number>()
  const serverCountsContent = new Map<string, number>()
  for (const m of serverMessages) {
    const full = `${m.thread_id}|${m.role}|${m.content}`
    serverCountsFull.set(full, (serverCountsFull.get(full) ?? 0) + 1)
    const content = `${m.role}|${m.content}`
    serverCountsContent.set(content, (serverCountsContent.get(content) ?? 0) + 1)
  }

  const localConsumedFull = new Map<string, number>()
  const localConsumedContent = new Map<string, number>()

  for (const localMessage of currentMessages) {
    if (!isLocalMessageId(localMessage.id)) continue

    const fullKey = `${localMessage.thread_id}|${localMessage.role}|${localMessage.content}`
    const contentKey = `${localMessage.role}|${localMessage.content}`

    // Prefer the full key match (thread_id known). Fall back to content-only when
    // thread_id is '' — this is the new-thread case where the optimistic message
    // was inserted before the thread was created on the server.
    const useContentFallback = !localMessage.thread_id

    if (!useContentFallback) {
      const serverHas = serverCountsFull.get(fullKey) ?? 0
      const consumed = localConsumedFull.get(fullKey) ?? 0
      if (consumed < serverHas) {
        localConsumedFull.set(fullKey, consumed + 1)
        continue // server already has this copy — drop the temp
      }
    } else {
      const serverHas = serverCountsContent.get(contentKey) ?? 0
      const consumed = localConsumedContent.get(contentKey) ?? 0
      if (consumed < serverHas) {
        localConsumedContent.set(contentKey, consumed + 1)
        continue // server has a matching message — drop the temp
      }
    }

    // Server doesn't have this copy yet — keep the optimistic local message.
    merged.push(localMessage)
  }

  return sortMessagesChronologically(merged)
}
