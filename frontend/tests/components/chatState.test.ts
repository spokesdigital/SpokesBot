import { mergeServerMessages } from '@/components/dashboard/chatState'

describe('chatState', () => {
  it('preserves optimistic local messages while server history is catching up', () => {
    const serverMessages = [
      {
        id: 'db-1',
        thread_id: 'thread-1',
        role: 'assistant' as const,
        content: 'Welcome back',
        created_at: '2026-04-15T09:00:00.000Z',
      },
    ]

    const currentMessages = [
      ...serverMessages,
      {
        id: 'temp-123',
        thread_id: 'thread-1',
        role: 'user' as const,
        content: "what is the last week's sale",
        created_at: '2026-04-15T09:00:05.000Z',
      },
    ]

    expect(mergeServerMessages(serverMessages, currentMessages)).toEqual(currentMessages)
  })

  it('drops a local optimistic message once the persisted server copy exists', () => {
    const currentMessages = [
      {
        id: 'temp-123',
        thread_id: 'thread-1',
        role: 'user' as const,
        content: "what is the last week's sale",
        created_at: '2026-04-15T09:00:05.000Z',
      },
    ]

    const serverMessages = [
      {
        id: 'db-2',
        thread_id: 'thread-1',
        role: 'user' as const,
        content: "what is the last week's sale",
        created_at: '2026-04-15T09:00:05.500Z',
      },
    ]

    expect(mergeServerMessages(serverMessages, currentMessages)).toEqual(serverMessages)
  })
})
