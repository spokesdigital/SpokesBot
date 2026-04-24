'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization, SupportMessage } from '@/types'
import {
  Activity,
  Upload,
  FileBarChart,
  MessageSquare,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import { format, parseISO, isAfter, isBefore } from 'date-fns'

type ActionType = 'upload' | 'report' | 'support'
type StatusType = 'success' | 'failed' | 'processing'

interface ActivityEntry {
  id: string
  actionType: ActionType
  actionLabel: string
  client: string
  clientOrgId: string
  user: string
  timestamp: Date
  status: StatusType
}

type FilterTab = 'all' | ActionType

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  upload:  { label: 'Upload',           icon: Upload,        color: 'text-amber-700',   bg: 'bg-amber-50' },
  report:  { label: 'Report Generated', icon: FileBarChart,  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  support: { label: 'Support',          icon: MessageSquare, color: 'text-blue-700',    bg: 'bg-blue-50' },
}

const STATUS_BADGE: Record<StatusType, { label: string; className: string; icon: React.ElementType }> = {
  success:    { label: 'Success',    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: CheckCircle2 },
  failed:     { label: 'Failed',     className: 'bg-red-50 text-red-600 border border-red-200',            icon: XCircle },
  processing: { label: 'Processing', className: 'bg-amber-50 text-amber-700 border border-amber-200',      icon: RefreshCw },
}

function buildActivity(
  datasets: Dataset[],
  messages: SupportMessage[],
  orgMap: Record<string, string>,
  adminEmail: string,
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  for (const ds of datasets) {
    const client = orgMap[ds.organization_id] ?? '—'
    const status: StatusType =
      ds.status === 'completed' ? 'success' : ds.status === 'failed' ? 'failed' : 'processing'

    // Upload event
    entries.push({
      id: `upload-${ds.id}`,
      actionType: 'upload',
      actionLabel: 'Upload',
      client,
      clientOrgId: ds.organization_id,
      user: adminEmail,
      timestamp: parseISO(ds.uploaded_at),
      status,
    })

    // Separate "Report Generated" event for completed datasets
    if (ds.status === 'completed') {
      entries.push({
        id: `report-${ds.id}`,
        actionType: 'report',
        actionLabel: 'Report Generated',
        client,
        clientOrgId: ds.organization_id,
        user: adminEmail,
        timestamp: parseISO(ds.updated_at),
        status: 'success',
      })
    }
  }

  for (const msg of messages) {
    entries.push({
      id: `support-${msg.id}`,
      actionType: 'support',
      actionLabel: 'Support',
      client: orgMap[msg.organization_id] ?? '—',
      clientOrgId: msg.organization_id,
      user: msg.email,
      timestamp: parseISO(msg.created_at),
      status: msg.status === 'resolved' ? 'success' : 'processing',
    })
  }

  return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export default function ActivityPage() {
  const { session, user } = useAuth()

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [selectedOrg, setSelectedOrg] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const orgMap = useMemo(() => Object.fromEntries(orgs.map(o => [o.id, o.name])), [orgs])

  useEffect(() => {
    if (!session) return
    setError(null)
    Promise.all([
      api.datasets.list(session.access_token, undefined, true),
      api.organizations.list(session.access_token),
      api.support.list(session.access_token),
    ])
      .then(([ds, os, msgs]) => {
        setDatasets(ds)
        setOrgs(os)
        setMessages(msgs as SupportMessage[])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load activity.'))
      .finally(() => setLoading(false))
  }, [session])

  const allEntries = useMemo(
    () => buildActivity(datasets, messages, orgMap, user?.email ?? 'admin'),
    [datasets, messages, orgMap, user],
  )

  const filtered = useMemo(() => {
    let rows = allEntries
    if (activeTab !== 'all') rows = rows.filter(r => r.actionType === activeTab)
    if (selectedOrg !== 'all') rows = rows.filter(r => r.clientOrgId === selectedOrg)
    if (dateFrom) {
      const from = new Date(dateFrom)
      rows = rows.filter(r => isAfter(r.timestamp, from) || r.timestamp.toDateString() === from.toDateString())
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      rows = rows.filter(r => isBefore(r.timestamp, to))
    }
    return rows
  }, [allEntries, activeTab, selectedOrg, dateFrom, dateTo])

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'upload', label: 'Upload' },
    { key: 'report', label: 'Report' },
    { key: 'support', label: 'Support' },
  ]

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Activity Logs</h1>
        <p className="mt-1 text-sm text-slate-500">Track all system actions and events</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-white/70 bg-white/60 p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                activeTab === tab.key
                  ? 'bg-white text-[#d99600] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Client dropdown */}
        <div className="relative">
          <select
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
          >
            <option value="all">All Clients</option>
            {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
          />
          <span>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-panel rounded-[1.75rem] divide-y divide-white/40">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="shimmer-cool h-5 w-24 rounded-full" />
              <div className="shimmer-cool h-4 w-28 rounded" />
              <div className="shimmer-cool h-3 w-36 rounded" />
              <div className="shimmer-cool ml-auto h-3 w-28 rounded" />
              <div className="shimmer-cool h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Activity className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No activity found</p>
          <p className="text-sm text-slate-400">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden rounded-[1.75rem]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/50 bg-white/20">
                  {['ACTION', 'CLIENT', 'USER', 'TIMESTAMP', 'STATUS'].map(col => (
                    <th key={col} className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {filtered.map(entry => {
                  const aCfg = ACTION_CONFIG[entry.actionType]
                  const AIcon = aCfg.icon
                  const sCfg = STATUS_BADGE[entry.status]
                  const SIcon = sCfg.icon
                  return (
                    <tr key={entry.id} className="transition hover:bg-white/40">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${aCfg.bg} ${aCfg.color}`}>
                          <AIcon className="h-3 w-3" />
                          {aCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {entry.clientOrgId ? (
                          <Link href={`/admin/clients/${entry.clientOrgId}`} className="text-sm font-medium text-slate-800 hover:text-[#d99600]">
                            {entry.client}
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{entry.user}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {format(entry.timestamp, 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${sCfg.className}`}>
                          <SIcon className={`h-3 w-3 ${entry.status === 'processing' ? 'animate-spin' : ''}`} />
                          {sCfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/40 px-6 py-3 text-xs text-slate-400">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
