'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import {
  Users,
  Plus,
  Trash2,
  X,
  RefreshCw,
  Search,
  LayoutList,
  LayoutGrid,
  ExternalLink,
  Pencil,
  Settings2,
  ChevronRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ── Helpers ──────────────────────────────────────────────────────────────────

type AccountStatus = 'active' | 'inactive'
type ReportStatus = 'up_to_date' | 'processing' | 'error' | 'missing'

function deriveUsername(name: string): string {
  const stopWords = new Set(['corp', 'inc', 'ltd', 'co', 'llc', 'digital', 'media', 'group', 'agency', 'solutions'])
  const words = name.toLowerCase().split(/\s+/).filter(w => !stopWords.has(w))
  return (words.join('').replace(/[^a-z0-9]/g, '') || name.toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 20)
}

function deriveAccountStatus(orgDatasets: Dataset[]): AccountStatus {
  return orgDatasets.some(d => d.status === 'completed') ? 'active' : 'inactive'
}

function deriveReportStatus(orgDatasets: Dataset[]): ReportStatus {
  if (orgDatasets.length === 0) return 'missing'
  if (orgDatasets.some(d => d.status === 'failed')) return 'error'
  if (orgDatasets.some(d => d.status === 'processing' || d.status === 'queued')) return 'processing'
  if (orgDatasets.some(d => d.status === 'completed')) return 'up_to_date'
  return 'missing'
}

function formatLastReport(date: Date | null): string {
  if (!date) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

interface ClientRow {
  org: Organization
  username: string
  accountStatus: AccountStatus
  reportStatus: ReportStatus
  lastUpload: Date | null
}

function buildRows(orgs: Organization[], datasets: Dataset[]): ClientRow[] {
  return orgs.map(org => {
    const orgDatasets = datasets.filter(d => d.organization_id === org.id)
    const lastUpload =
      orgDatasets.length > 0
        ? new Date(Math.max(...orgDatasets.map(d => parseISO(d.uploaded_at).getTime())))
        : null
    return {
      org,
      username: deriveUsername(org.name),
      accountStatus: deriveAccountStatus(orgDatasets),
      reportStatus: deriveReportStatus(orgDatasets),
      lastUpload,
    }
  })
}

// ── Badge configs ────────────────────────────────────────────────────────────

const ACCOUNT_STATUS_BADGE: Record<AccountStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  inactive: 'bg-slate-100 text-slate-500 border border-slate-200',
}

const REPORT_STATUS_CONFIG: Record<ReportStatus, { label: string; className: string }> = {
  up_to_date: { label: 'Up to date', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  processing:  { label: 'Processing', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  error:       { label: 'Error',      className: 'bg-red-50 text-red-600 border border-red-200' },
  missing:     { label: 'Missing',    className: 'bg-orange-50 text-orange-600 border border-orange-200' },
}

// ── Main page ────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid'

export default function ClientsPage() {
  const { session } = useAuth()
  const requestSeqRef = useRef(0)

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')

  // ── Create dialog ─────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── Edit dialog ───────────────────────────────────────────────────────────
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editName, setEditName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // ── Delete confirmation modal ─────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<Organization | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchData = useCallback(async (token: string) => {
    const requestId = requestSeqRef.current + 1
    requestSeqRef.current = requestId
    setLoading(true)
    setError(null)
    try {
      const [nextOrgs, nextDatasets] = await Promise.all([
        api.organizations.list(token),
        api.datasets.list(token, undefined, true),
      ])
      if (requestId !== requestSeqRef.current) return
      setOrgs(nextOrgs)
      setDatasets(nextDatasets)
    } catch (e) {
      if (requestId !== requestSeqRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load. Please try again.')
    } finally {
      if (requestId === requestSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const id = window.setTimeout(() => void fetchData(session.access_token), 0)
    return () => { window.clearTimeout(id); requestSeqRef.current += 1 }
  }, [session, fetchData])

  const rows = useMemo(() => {
    let r = buildRows(orgs, datasets)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => row.org.name.toLowerCase().includes(q) || row.username.includes(q))
    }
    return r
  }, [orgs, datasets, search])

  // ── Create ────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const org = await api.organizations.create({ name: newName.trim() }, session.access_token)
      setOrgs(prev => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setShowCreate(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create client.')
    } finally {
      setCreating(false)
    }
  }

  // ── Edit (rename) ─────────────────────────────────────────────────────────
  function openEdit(org: Organization) {
    setEditingOrg(org)
    setEditName(org.name)
    setEditError(null)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !editingOrg || !editName.trim()) return
    setEditing(true)
    setEditError(null)
    const trimmed = editName.trim()
    // Optimistic update
    setOrgs(prev =>
      prev.map(o => o.id === editingOrg.id ? { ...o, name: trimmed } : o)
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    try {
      const updated = await api.organizations.update(editingOrg.id, { name: trimmed }, session.access_token)
      // Sync with server response (id/created_at confirmed)
      setOrgs(prev =>
        prev.map(o => o.id === updated.id ? updated : o)
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setEditingOrg(null)
    } catch (e) {
      // Roll back optimistic update on failure
      setOrgs(prev =>
        prev.map(o => o.id === editingOrg.id ? editingOrg : o)
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setEditError(e instanceof Error ? e.message : 'Failed to rename client.')
    } finally {
      setEditing(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(org: Organization) {
    if (!session) return
    setConfirmDelete(null)
    setDeleting(org.id)
    setOrgs(prev => prev.filter(o => o.id !== org.id))
    try {
      await api.organizations.delete(org.id, session.access_token)
    } catch (e) {
      setOrgs(prev => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)))
      setError(e instanceof Error ? e.message : 'Failed to remove client.')
    } finally {
      setDeleting(null)
    }
  }

  // ── Shared action button strip ────────────────────────────────────────────
  function renderActions(org: Organization) {
    const isDeleting = deleting === org.id
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/admin/clients/${org.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open client dashboard in new tab"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
        <button
          onClick={() => openEdit(org)}
          title="Rename client"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <Link
          href={`/admin/clients/${org.id}`}
          title="Manage client"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Settings2 className="h-4 w-4" />
        </Link>
        <button
          onClick={() => setConfirmDelete(org)}
          disabled={isDeleting}
          title="Delete client"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
        >
          {isDeleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">Manage client accounts, uploads, and access</p>
        </div>
        <div className="flex items-center gap-2">
          {/* List / grid toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`rounded-lg p-2 transition ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`rounded-lg p-2 transition ${viewMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); setNewName('') }}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#f0a500] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d99600] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Add New Client
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500 backdrop-blur-xl">
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

      {/* Create dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/60 bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">New Client</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Organisation name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  autoFocus
                  disabled={creating}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
                />
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0a500] py-2.5 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
                >
                  {creating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {creating ? 'Creating…' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit (rename) dialog */}
      {editingOrg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setEditingOrg(null) }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/60 bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Rename Client</h2>
              <button onClick={() => setEditingOrg(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Organisation name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                  disabled={editing}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
                />
              </div>
              {editError && <p className="text-xs text-red-500">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditingOrg(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editing || !editName.trim() || editName.trim() === editingOrg.name}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0a500] py-2.5 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
                >
                  {editing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editing ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}
        >
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/60 bg-white p-7 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Delete Client</h2>
                <p className="text-xs text-slate-500">This cannot be undone</p>
              </div>
            </div>
            <p className="mb-6 text-sm text-slate-600">
              Are you sure you want to remove <span className="font-semibold text-slate-800">{confirmDelete.name}</span>? All associated data will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="glass-panel rounded-[1.75rem]">
          <div className="divide-y divide-white/40">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <div className="shimmer-cool h-4 w-32 rounded" />
                <div className="shimmer-cool h-4 w-20 rounded" />
                <div className="shimmer-cool h-5 w-14 rounded-full" />
                <div className="shimmer-cool ml-auto h-3 w-16 rounded" />
                <div className="shimmer-cool h-5 w-20 rounded-full" />
                <div className="shimmer-cool h-3 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Users className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No clients found</p>
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); setNewName('') }}
            className="flex items-center gap-1.5 text-sm text-[#f0a500] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add your first client
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* ── List view ── */
        <div className="glass-panel overflow-hidden rounded-[1.75rem]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/50 bg-white/30">
                  {['CLIENT NAME', 'USERNAME', 'STATUS', 'LAST UPLOAD', 'REPORT STATUS', 'CREATED ON', 'ACTIONS'].map(col => (
                    <th key={col} className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {rows.map(({ org, username, accountStatus, reportStatus, lastUpload }) => {
                  const rsCfg = REPORT_STATUS_CONFIG[reportStatus]
                  return (
                    <tr key={org.id} className="group transition hover:bg-white/40">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800">{org.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-slate-500">{username}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ACCOUNT_STATUS_BADGE[accountStatus]}`}>
                          {accountStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatLastReport(lastUpload)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${rsCfg.className}`}>
                          {rsCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {format(parseISO(org.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        {renderActions(org)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Grid view ── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ org, username, accountStatus, reportStatus, lastUpload }) => {
            const rsCfg = REPORT_STATUS_CONFIG[reportStatus]
            return (
              <div
                key={org.id}
                className="glass-panel flex flex-col gap-4 rounded-[1.75rem] p-5 transition hover:border-[#f0a500]/40 hover:shadow-[0_18px_50px_rgba(240,165,0,0.12)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{org.name}</p>
                    <p className="font-mono text-xs text-slate-400">{username}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ACCOUNT_STATUS_BADGE[accountStatus]}`}>
                    {accountStatus}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Last upload</span>
                  <span className="font-medium text-slate-700">{formatLastReport(lastUpload)}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Report status</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rsCfg.className}`}>
                    {rsCfg.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Created</span>
                  <span className="text-slate-600">{format(parseISO(org.created_at), 'MMM d, yyyy')}</span>
                </div>

                <div className="flex items-center justify-between border-t border-white/50 pt-3">
                  {renderActions(org)}
                  <Link
                    href={`/admin/clients/${org.id}`}
                    className="flex items-center gap-1 text-sm font-medium text-[#d99600] hover:underline"
                  >
                    Manage <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
