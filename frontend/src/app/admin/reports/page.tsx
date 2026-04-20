'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import {
  FileBarChart,
  RefreshCw,
  MoreVertical,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  X,
  Plus,
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

const REPORT_TYPE_LABELS: Record<string, string> = {
  overview: 'Overview',
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
}

function StatusBadge({ status }: { status: Dataset['status'] }) {
  const cfg: Record<Dataset['status'], { label: string; className: string; icon: React.ElementType }> = {
    completed:  { label: 'Completed',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: CheckCircle2 },
    failed:     { label: 'Failed',     className: 'bg-red-50 text-red-600 border border-red-200',            icon: XCircle },
    processing: { label: 'Processing', className: 'bg-amber-50 text-amber-700 border border-amber-200',      icon: RefreshCw },
    queued:     { label: 'Queued',     className: 'bg-slate-50 text-slate-600 border border-slate-200',      icon: Clock },
  }
  const { label, className, icon: Icon } = cfg[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  )
}

export default function ReportsPage() {
  const { session } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Generate report dialog
  const [showGenerate, setShowGenerate] = useState(false)
  const [genOrgId, setGenOrgId] = useState('')

  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]))

  const fetchData = useCallback(async (token: string) => {
    setLoading(true)
    setError(null)
    try {
      const [nextDatasets, nextOrgs] = await Promise.all([
        api.datasets.list(token, undefined, true),
        api.organizations.list(token),
      ])
      setDatasets(nextDatasets)
      setOrgs(nextOrgs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    void fetchData(session.access_token)
  }, [session, fetchData])

  async function handleDelete(datasetId: string) {
    if (!session) return
    setOpenMenu(null)
    setDeleting(datasetId)
    const removed = datasets.find(d => d.id === datasetId)
    setDatasets(prev => prev.filter(d => d.id !== datasetId))
    try {
      await api.datasets.delete(datasetId, session.access_token)
    } catch {
      if (removed) setDatasets(prev => [removed, ...prev])
    } finally {
      setDeleting(null)
    }
  }

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Generate and manage client reports</p>
        </div>
        <button
          onClick={() => { setShowGenerate(true); setGenOrgId('') }}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#f0a500] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d99600] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Generate Report
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500">
          <span>{error}</span>
          {session && (
            <button onClick={() => fetchData(session.access_token)} className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      )}

      {/* Generate report dialog */}
      {showGenerate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowGenerate(false) }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/60 bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Generate Report</h2>
              <button onClick={() => setShowGenerate(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Select a client to go to their data management page and upload or generate a new report.
            </p>
            <div className="relative mb-4">
              <select
                value={genOrgId}
                onChange={e => setGenOrgId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-8 text-sm text-slate-800 outline-none focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              >
                <option value="">Select a client…</option>
                {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowGenerate(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <Link
                href={genOrgId ? `/admin/clients/${genOrgId}` : '#'}
                onClick={() => genOrgId && setShowGenerate(false)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition ${genOrgId ? 'bg-[#f0a500] hover:bg-[#d99600]' : 'pointer-events-none bg-slate-200'}`}
              >
                <ExternalLink className="h-4 w-4" />
                Go to Client
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="glass-panel rounded-[1.75rem] divide-y divide-white/40">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="shimmer-cool h-4 w-32 rounded" />
              <div className="shimmer-cool h-3 w-24 rounded" />
              <div className="shimmer-cool h-5 w-20 rounded-full" />
              <div className="shimmer-cool ml-auto h-3 w-24 rounded" />
              <div className="shimmer-cool h-3 w-24 rounded" />
            </div>
          ))}
        </div>
      ) : datasets.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <FileBarChart className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No reports yet</p>
          <p className="text-sm text-slate-400">Upload client data to generate your first report.</p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden rounded-[1.75rem]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/50 bg-white/20">
                  {['CLIENT', 'REPORT TYPE', 'STATUS', 'GENERATED ON', 'LAST UPDATED', 'ACTIONS'].map(col => (
                    <th key={col} className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {datasets.map(ds => (
                  <tr key={ds.id} className={`transition hover:bg-white/40 ${deleting === ds.id ? 'opacity-40' : ''}`}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {orgMap[ds.organization_id] ?? '—'}
                        </p>
                        <p className="text-xs text-slate-400 truncate max-w-[180px]">
                          {ds.report_name ?? ds.file_name}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {REPORT_TYPE_LABELS[ds.report_type] ?? ds.report_type}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ds.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(parseISO(ds.uploaded_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(parseISO(ds.updated_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === ds.id ? null : ds.id) }}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenu === ds.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                            <Link
                              href={`/admin/clients/${ds.organization_id}`}
                              onClick={() => setOpenMenu(null)}
                              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> View Report
                            </Link>
                            <button
                              onClick={() => handleDelete(ds.id)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
