'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Organization, SupportMessage } from '@/types'
import { AlertOctagon, CheckCircle2, Mail, RefreshCw, XCircle } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

type TabFilter = 'all' | 'open' | 'resolved'

function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').slice(0, 7).join(' ')
  return words.length < cleaned.length ? words + '…' : words
}

const DOT_COLORS: Record<SupportMessage['status'], string> = {
  open:     'bg-orange-400',
  resolved: 'bg-emerald-400',
}

const BADGE_COLORS: Record<SupportMessage['status'], string> = {
  open:     'bg-orange-50 text-orange-700 border border-orange-200',
  resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

export default function EscalationsPage() {
  const { session } = useAuth()
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabFilter>('all')
  const [resolving, setResolving] = useState<string | null>(null)

  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]))

  function load() {
    if (!session) return
    setLoading(true)
    setError(null)
    Promise.all([
      api.support.list(session.access_token),
      api.organizations.list(session.access_token),
    ])
      .then(([msgs, os]) => {
        setMessages(msgs as SupportMessage[])
        setOrgs(os as Organization[])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load escalations.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [session])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve(id: string) {
    if (!session) return
    setResolving(id)
    try {
      await api.support.resolve(id, session.access_token)
      setMessages(prev =>
        prev.map(m => m.id === id ? { ...m, status: 'resolved' as const } : m),
      )
    } catch { /* silent */ }
    finally { setResolving(null) }
  }

  const counts = {
    all:      messages.length,
    open:     messages.filter(m => m.status === 'open').length,
    resolved: messages.filter(m => m.status === 'resolved').length,
  }

  const filtered = tab === 'all' ? messages : messages.filter(m => m.status === tab)

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})` },
    { key: 'open',     label: `New (${counts.open})` },
    { key: 'resolved', label: `Resolved (${counts.resolved})` },
  ]

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Escalations</h1>
          <p className="mt-1 text-sm text-slate-500">Client support requests and issues</p>
        </div>
        {counts.open > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
            <AlertOctagon className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">
              {counts.open} new ticket{counts.open !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 w-fit rounded-xl border border-white/70 bg-white/60 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? 'bg-white text-[#d99600] shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500">
          <span className="flex items-center gap-2"><XCircle className="h-4 w-4" />{error}</span>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Tickets */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-panel rounded-[1.5rem] p-5">
              <div className="flex items-start gap-4">
                <div className="shimmer-cool h-5 w-5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="shimmer-cool h-4 w-48 rounded" />
                  <div className="shimmer-cool h-3 w-64 rounded" />
                  <div className="shimmer-cool h-3 w-full rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 opacity-60" />
          <p className="text-lg font-medium text-slate-700">
            {counts.all === 0 ? 'No escalations yet' : 'No tickets in this category'}
          </p>
          <p className="text-sm text-slate-400">
            {counts.all === 0
              ? 'All client requests will appear here.'
              : 'Select a different tab to view other tickets.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(msg => (
            <div
              key={msg.id}
              className="glass-panel rounded-[1.5rem] p-5 transition hover:shadow-[0_18px_50px_rgba(240,165,0,0.08)]"
            >
              <div className="flex items-start gap-4">
                {/* Status dot */}
                <div className="mt-1 flex-shrink-0">
                  <span className={`block h-2.5 w-2.5 rounded-full ${DOT_COLORS[msg.status]}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {deriveTitle(msg.message)}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold capitalize ${BADGE_COLORS[msg.status]}`}>
                      {msg.status === 'open' ? 'New' : 'Resolved'}
                    </span>
                  </div>
                  {/* Org · email — matches prototype "AcmeCorp · email@..." format */}
                  <p className="text-xs font-medium mb-2">
                    <span className="text-slate-700 font-semibold">
                      {orgMap[msg.organization_id] ?? 'Unknown Org'}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-[#d99600]">{msg.email}</span>
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                    {msg.message}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {formatDistanceToNow(parseISO(msg.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 flex-col gap-2">
                  <a
                    href={`mailto:${msg.email}?subject=Re: Your support request`}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Reply
                  </a>
                  {msg.status === 'open' && (
                    <button
                      onClick={() => handleResolve(msg.id)}
                      disabled={resolving === msg.id}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {resolving === msg.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {resolving === msg.id ? 'Resolving…' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
