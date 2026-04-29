'use client'

import { useState } from 'react'
import { Headphones, Check } from 'lucide-react'
import { api } from '@/lib/api'

interface EscalationButtonProps {
  threadId: string
  token: string
}

export function EscalationButton({ threadId, token }: EscalationButtonProps) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleEscalate() {
    if (sent || sending || !threadId) return
    setSending(true)
    try {
      await api.threads.escalate(threadId, token)
      setSent(true)
    } catch {
      // silently fail so the button stays enabled for a retry
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-2 flex">
      <button
        type="button"
        onClick={handleEscalate}
        disabled={sent || sending || !threadId}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
          sent
            ? 'cursor-default border-green-200 bg-green-50 text-green-600'
            : 'border-[#e0deda] bg-white text-[#7a7775] hover:border-[#f0a500] hover:text-[#f0a500] disabled:opacity-60'
        }`}
      >
        {sent ? (
          <Check className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <Headphones className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        {sent ? 'Query Sent to Admin' : sending ? 'Sending…' : 'Escalate this Query'}
      </button>
    </div>
  )
}
