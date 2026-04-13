'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { SupportMessage } from '@/types'
import { Headphones, CheckCircle, Clock, Mail } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function SupportInboxPage() {
  const { session } = useAuth()
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    api.support
      .list(session.access_token, filter === 'all' ? undefined : filter)
      .then((data) => setMessages(data as SupportMessage[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session, filter])

  async function handleResolve(id: string) {
    if (!session) return
    setResolving(id)
    try {
      await api.support.resolve(id, session.access_token)
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'resolved' as const } : m)),
      )
    } catch {
      // silent
    } finally {
      setResolving(null)
    }
  }

  const openCount = messages.filter((m) => m.status === 'open').length

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="shimmer-cool h-24 rounded-[2rem] border border-white/60"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Support Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            {openCount > 0
              ? `${openCount} open message${openCount !== 1 ? 's' : ''}`
              : 'No open messages'}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/60 p-1 border border-white/70">
          {(['all', 'open', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-white text-[#d99600] shadow-sm border border-white/70'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Messages list */}
      {messages.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Headphones className="w-12 h-12 opacity-30" />
          <p className="text-lg font-medium">No messages yet</p>
          <p className="text-sm text-slate-400">
            Client support messages will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="glass-panel flex items-start gap-4 rounded-[1.5rem] p-5 transition-all hover:shadow-[0_18px_50px_rgba(240,165,0,0.08)]"
            >
              {/* Icon */}
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-br from-[#ffe48a]/30 to-[#ecab00]/20">
                <Mail className="h-5 w-5 text-[#d99600]" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {msg.email}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${
                      msg.status === 'open'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {msg.status === 'open' ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <CheckCircle className="h-3 w-3" />
                    )}
                    {msg.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {msg.message}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Resolve button */}
              {msg.status === 'open' && (
                <button
                  onClick={() => handleResolve(msg.id)}
                  disabled={resolving === msg.id}
                  className="flex-shrink-0 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2 text-xs font-semibold text-green-700 transition-all hover:bg-green-100 hover:border-green-300 disabled:opacity-50"
                >
                  {resolving === msg.id ? 'Resolving...' : 'Mark Resolved'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
