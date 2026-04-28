'use client'

import { useEffect, useState } from 'react'
import { Headphones } from 'lucide-react'
import { api } from '@/lib/api'

interface EscalationButtonProps {
  threadId: string
  token: string
  /** When true the button fades in from transparent — used for the idle-timer trigger. */
  fadeIn?: boolean
}

export function EscalationButton({ threadId, token, fadeIn = false }: EscalationButtonProps) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  // Start invisible when fadeIn is requested; a rAF on mount triggers the CSS transition.
  const [visible, setVisible] = useState(!fadeIn)

  useEffect(() => {
    if (!fadeIn) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [fadeIn])

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
    <div
      className="mt-2 flex"
      style={{
        opacity: visible ? 1 : 0,
        transition: fadeIn ? 'opacity 0.6s ease' : undefined,
      }}
    >
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
        <Headphones className="h-3.5 w-3.5 flex-shrink-0" />
        {sent ? 'Sent to Admin!' : sending ? 'Sending…' : 'Send query to Admin'}
      </button>
    </div>
  )
}
