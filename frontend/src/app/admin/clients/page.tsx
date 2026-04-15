'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import { Users, ChevronRight, Database, Plus, Trash2, AlertTriangle, X, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ClientsPage() {
  const { session } = useAuth()
  const requestSeqRef = useRef(0)

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── New client dialog ─────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── Delete confirmation ───────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
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
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to load. Please try again.')
    } finally {
      if (requestId === requestSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const id = window.setTimeout(() => void fetchData(session.access_token), 0)
    return () => { window.clearTimeout(id); requestSeqRef.current += 1 }
  }, [session, fetchData])

  const datasetCountByOrg = datasets.reduce<Record<string, number>>((acc, d) => {
    acc[d.organization_id] = (acc[d.organization_id] ?? 0) + 1
    return acc
  }, {})

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

  async function handleDelete(orgId: string) {
    if (!session) return
    setConfirmDelete(null)
    setDeleting(orgId)
    const removed = orgs.find(o => o.id === orgId)
    setOrgs(prev => prev.filter(o => o.id !== orgId))
    try {
      await api.organizations.delete(orgId, session.access_token)
    } catch (e) {
      if (removed) setOrgs(prev => [...prev, removed].sort((a, b) => a.name.localeCompare(b.name)))
      setError(e instanceof Error ? e.message : 'Failed to remove client.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Clients Console</h1>
          <p className="mt-1 text-sm text-slate-500">
            {orgs.length} organization{orgs.length !== 1 ? 's' : ''} on the platform
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); setNewName('') }}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#f0a500] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d99600] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Client
        </button>
      </div>

      {/* New client dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/60 bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">New Client Organisation</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Organisation name
                </label>
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
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0a500] py-2.5 text-sm font-semibold text-white transition hover:bg-[#d99600] disabled:opacity-60"
                >
                  {creating
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Plus className="h-3.5 w-3.5" />}
                  {creating ? 'Creating…' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Org list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-panel flex items-center justify-between rounded-[1.5rem] p-5">
              <div className="flex items-center gap-4">
                <div className="shimmer-cool h-11 w-11 flex-shrink-0 rounded-2xl" />
                <div className="space-y-2">
                  <div className="shimmer-cool h-4 w-36 rounded" />
                  <div className="shimmer-cool h-3 w-48 rounded" />
                </div>
              </div>
              <div className="shimmer-cool h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Users className="w-12 h-12 opacity-30" />
          <p className="text-lg font-medium">No clients yet</p>
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); setNewName('') }}
            className="flex items-center gap-1.5 text-sm text-[#f0a500] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add your first client
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => {
            const count = datasetCountByOrg[org.id] ?? 0
            const isConfirming = confirmDelete === org.id
            const isDeleting = deleting === org.id
            return (
              <div
                key={org.id}
                className="glass-panel flex items-center justify-between rounded-[1.5rem] p-5 transition-all hover:border-[#f0a500]/40 hover:shadow-[0_18px_50px_rgba(240,165,0,0.12)]"
              >
                {/* Clickable org info */}
                <Link href={`/admin/clients/${org.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-br from-[#ffe48a]/30 to-[#ecab00]/20">
                    <Users className="h-5 w-5 text-[#d99600]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{org.name}</p>
                    <p className="text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {count} dataset{count !== 1 ? 's' : ''}
                      </span>
                      {' · '}
                      Created {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </Link>

                {/* Delete + Manage */}
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <span className="text-xs font-medium text-red-600">Remove client?</span>
                      <button
                        onClick={() => handleDelete(org.id)}
                        className="ml-1 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-red-600"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg p-0.5 text-slate-400 transition hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(org.id)}
                      disabled={isDeleting}
                      title="Remove client"
                      className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/70 hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <Link href={`/admin/clients/${org.id}`} className="flex items-center gap-1 text-slate-400">
                    <span className="text-sm">Manage</span>
                    <ChevronRight className="w-4 h-4" />
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
