'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import {
  Users,
  Upload,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react'
import { formatDistanceToNow, subDays, isAfter, parseISO, isWithinInterval } from 'date-fns'

const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

type ClientFilter = 'all' | 'active' | 'issues' | 'inactive'
type ClientStatus = 'active' | 'issues' | 'inactive'

interface ClientRow {
  org: Organization
  status: ClientStatus
  lastUpload: Date | null
  lastReport: Date | null
  errorCount: number
}

function deriveClientRows(orgs: Organization[], datasets: Dataset[]): ClientRow[] {
  return orgs.map(org => {
    const orgDatasets = datasets.filter(d => d.organization_id === org.id)
    const failed = orgDatasets.filter(d => d.status === 'failed')
    const completed = orgDatasets.filter(d => d.status === 'completed')

    const status: ClientStatus =
      failed.length > 0 ? 'issues' : completed.length > 0 ? 'active' : 'inactive'

    const lastUpload =
      orgDatasets.length > 0
        ? new Date(Math.max(...orgDatasets.map(d => parseISO(d.uploaded_at).getTime())))
        : null

    const lastReport =
      completed.length > 0
        ? new Date(Math.max(...completed.map(d => parseISO(d.uploaded_at).getTime())))
        : null

    return { org, status, lastUpload, lastReport, errorCount: failed.length }
  })
}

function computeTrend(current: number, previous: number): { value: string; positive: boolean } | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return { value: '+100%', positive: true }
  const pct = ((current - previous) / previous) * 100
  const sign = pct >= 0 ? '+' : ''
  return { value: `${sign}${Math.round(pct)}%`, positive: pct >= 0 }
}

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  trend?: { value: string; positive: boolean } | null
  iconColor: string
  iconBg: string
  loading?: boolean
}

function KpiCard({ label, value, icon: Icon, trend, iconColor, iconBg, loading }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      {loading ? (
        <div className="space-y-2">
          <div className="shimmer-cool h-3 w-24 rounded" />
          <div className="shimmer-cool h-8 w-12 rounded-lg" />
          <div className="shimmer-cool h-3 w-20 rounded" />
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1.5 text-3xl font-bold text-slate-800">{value}</p>
            {trend ? (
              <div
                className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                  trend.positive ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {trend.positive ? (
                  <TrendingUp className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <TrendingDown className="h-3 w-3 flex-shrink-0" />
                )}
                <span>{trend.value} vs last week</span>
              </div>
            ) : (
              <div className="mt-1 h-4" />
            )}
          </div>
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
          >
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_CONFIG: Record<ClientStatus, { label: string; dot: string; badge: string }> = {
  active: {
    label: 'Active',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  issues: {
    label: 'Issues',
    dot: 'bg-red-400',
    badge: 'bg-red-50 text-red-700 border border-red-200',
  },
  inactive: {
    label: 'Inactive',
    dot: 'bg-slate-300',
    badge: 'bg-slate-50 text-slate-500 border border-slate-200',
  },
}

const ACTIVITY_STATUS_CONFIG = {
  completed: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Upload completed' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Upload failed' },
  processing: { icon: RefreshCw, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Processing' },
  queued: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-50', label: 'Queued' },
}

export default function AdminOverviewPage() {
  const { session } = useAuth()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rangeDays, setRangeDays] = useState(7)
  const [showRangeMenu, setShowRangeMenu] = useState(false)
  const rangeMenuRef = useRef<HTMLDivElement>(null)
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async (token: string) => {
    setLoading(true)
    setError(null)
    try {
      const [nextOrgs, nextDatasets] = await Promise.all([
        api.organizations.list(token),
        api.datasets.list(token, undefined, true),
      ])
      setOrgs(nextOrgs)
      setDatasets(nextDatasets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    void fetchData(session.access_token)
  }, [session, fetchData])

  // ── KPI computation ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date()
    const periodStart = subDays(now, rangeDays)
    const prevPeriodStart = subDays(now, rangeDays * 2)

    const inPeriod = (d: Dataset) => isAfter(parseISO(d.uploaded_at), periodStart)
    const inPrevPeriod = (d: Dataset) =>
      isWithinInterval(parseISO(d.uploaded_at), { start: prevPeriodStart, end: periodStart })

    const periodDatasets = datasets.filter(inPeriod)
    const prevDatasets = datasets.filter(inPrevPeriod)

    const completed = periodDatasets.filter(d => d.status === 'completed')
    const prevCompleted = prevDatasets.filter(d => d.status === 'completed')
    const failed = periodDatasets.filter(d => d.status === 'failed')
    const prevFailed = prevDatasets.filter(d => d.status === 'failed')
    const pending = datasets.filter(d => d.status === 'processing' || d.status === 'queued')

    const mostRecent =
      datasets.length > 0
        ? datasets.reduce((a, b) =>
            parseISO(a.uploaded_at) > parseISO(b.uploaded_at) ? a : b,
          )
        : null

    return {
      activeClients: orgs.length,
      reportsGenerated: completed.length,
      reportsTrend: computeTrend(completed.length, prevCompleted.length),
      failedUploads: failed.length,
      failedTrend: computeTrend(failed.length, prevFailed.length),
      pendingReports: pending.length,
      lastUpload: mostRecent
        ? formatDistanceToNow(parseISO(mostRecent.uploaded_at), { addSuffix: false })
        : 'Never',
    }
  }, [orgs, datasets, rangeDays])

  // ── Client health rows ────────────────────────────────────────────────────
  const clientRows = useMemo(() => deriveClientRows(orgs, datasets), [orgs, datasets])

  const filteredRows = useMemo(() => {
    let rows = clientRows
    if (clientFilter !== 'all') rows = rows.filter(r => r.status === clientFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.org.name.toLowerCase().includes(q))
    }
    return rows
  }, [clientRows, clientFilter, search])

  const filterCounts = useMemo(
    () => ({
      all: clientRows.length,
      active: clientRows.filter(r => r.status === 'active').length,
      issues: clientRows.filter(r => r.status === 'issues').length,
      inactive: clientRows.filter(r => r.status === 'inactive').length,
    }),
    [clientRows],
  )

  // ── Recent activity (latest 10 dataset events) ───────────────────────────
  const recentActivity = useMemo(() => {
    const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]))
    return [...datasets]
      .sort((a, b) => parseISO(b.uploaded_at).getTime() - parseISO(a.uploaded_at).getTime())
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        orgName: orgMap[d.organization_id] ?? 'Unknown',
        status: d.status,
        uploadedAt: parseISO(d.uploaded_at),
        fileName: d.report_name ?? d.file_name,
      }))
  }, [datasets, orgs])

  // Close date-range dropdown on outside click
  useEffect(() => {
    if (!showRangeMenu) return
    const handler = (e: MouseEvent) => {
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(e.target as Node)) {
        setShowRangeMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRangeMenu])

  const selectedRangeLabel =
    DATE_RANGE_OPTIONS.find(o => o.days === rangeDays)?.label ?? 'Last 7 days'

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Admin Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor system health and client activity</p>
        </div>

        {/* Date range selector */}
        <div className="relative" ref={rangeMenuRef}>
          <button
            onClick={() => setShowRangeMenu(v => !v)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {selectedRangeLabel}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {showRangeMenu && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {DATE_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => { setRangeDays(opt.days); setShowRangeMenu(false) }}
                  className={`flex w-full items-center px-4 py-2.5 text-sm transition hover:bg-slate-50 ${
                    opt.days === rangeDays ? 'font-semibold text-[#d99600]' : 'text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500">
          <span>{error}</span>
          {session && (
            <button
              onClick={() => fetchData(session.access_token)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Active Clients"
          value={kpis.activeClients}
          icon={Users}
          iconColor="text-[#d99600]"
          iconBg="bg-amber-50"
          loading={loading}
        />
        <KpiCard
          label="Reports Generated"
          value={kpis.reportsGenerated}
          icon={CheckCircle2}
          trend={kpis.reportsTrend}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          loading={loading}
        />
        <KpiCard
          label="Failed Uploads"
          value={kpis.failedUploads}
          icon={AlertTriangle}
          trend={kpis.failedTrend}
          iconColor="text-red-500"
          iconBg="bg-red-50"
          loading={loading}
        />
        <KpiCard
          label="Pending Reports"
          value={kpis.pendingReports}
          icon={Clock}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
          loading={loading}
        />
        <KpiCard
          label="Last Upload"
          value={loading ? '—' : `${kpis.lastUpload}${kpis.lastUpload !== 'Never' ? ' ago' : ''}`}
          icon={Upload}
          iconColor="text-blue-500"
          iconBg="bg-blue-50"
          loading={loading}
        />
      </div>

      {/* Client Health + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Client Health table */}
        <div className="glass-panel rounded-[1.75rem] xl:col-span-2">
          <div className="border-b border-white/60 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-800">Client Health</h2>
          </div>

          {/* Search + filters */}
          <div className="flex flex-col gap-3 border-b border-white/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search clients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 py-2 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'active', 'issues', 'inactive'] as ClientFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setClientFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                    clientFilter === f
                      ? 'bg-slate-800 text-white'
                      : 'bg-white/70 text-slate-500 hover:bg-white hover:text-slate-800'
                  }`}
                >
                  {f === 'all' ? `All (${filterCounts.all})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${filterCounts[f]})`}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="space-y-0 divide-y divide-white/50">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="shimmer-cool h-4 w-32 rounded" />
                    <div className="shimmer-cool h-5 w-16 rounded-full" />
                    <div className="shimmer-cool ml-auto h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Users className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">No clients match this filter</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/40">
                    {['CLIENT', 'STATUS', 'LAST UPLOAD', 'LAST REPORT', 'ERRORS', 'ACTIONS'].map(col => (
                      <th
                        key={col}
                        className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {filteredRows.map(({ org, status, lastUpload, lastReport, errorCount }) => {
                    const cfg = STATUS_CONFIG[status]
                    return (
                      <tr key={org.id} className="group transition hover:bg-white/40">
                        <td className="px-6 py-4">
                          <span className="font-medium text-slate-800">{org.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {lastUpload
                            ? formatDistanceToNow(lastUpload, { addSuffix: true })
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {lastReport
                            ? formatDistanceToNow(lastReport, { addSuffix: true })
                            : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {errorCount > 0 ? (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-200">
                              {errorCount} error{errorCount !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/admin/clients/${org.id}`}
                              className="text-sm font-medium text-[#d99600] hover:underline"
                            >
                              View
                            </Link>
                            <Link
                              href={`/admin/clients/${org.id}`}
                              className="flex items-center gap-0.5 text-sm text-slate-500 hover:text-slate-800"
                            >
                              Manage
                              <ChevronDown className="h-3 w-3 -rotate-90" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-panel rounded-[1.75rem]">
          <div className="flex items-center justify-between border-b border-white/60 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>

          <div className="divide-y divide-white/40">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-6 py-4">
                  <div className="shimmer-cool mt-0.5 h-7 w-7 flex-shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <div className="shimmer-cool h-3.5 w-36 rounded" />
                    <div className="shimmer-cool h-3 w-20 rounded" />
                  </div>
                </div>
              ))
            ) : recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Activity className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              recentActivity.map(event => {
                const cfg = ACTIVITY_STATUS_CONFIG[event.status]
                const Icon = cfg.icon
                return (
                  <div key={event.id} className="flex items-start gap-3 px-6 py-4">
                    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {cfg.label} for{' '}
                        <span className="text-slate-800">{event.orgName}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDistanceToNow(event.uploadedAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
