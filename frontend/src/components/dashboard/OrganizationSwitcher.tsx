'use client'

import { useMemo, useState } from 'react'
import { Building2, Check, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'

export function OrganizationSwitcher() {
  const { user, organizations, createOrganization } = useAuth()
  const { organizationId, setOrganization } = useDashboardStore()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? user?.organization ?? null,
    [organizationId, organizations, user],
  )

  if (user?.role !== 'admin') return null

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await createOrganization(name.trim())
      setName('')
      setCreating(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create client.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-[1.4rem] border border-white/55 bg-white/45 p-3 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-emerald-100">
          <Building2 className="h-5 w-5 text-cyan-700" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Admin Workspace
          </p>
          <p className="truncate text-sm font-medium text-slate-800">
            {selectedOrganization?.name ?? 'Select a client'}
          </p>
        </div>
      </div>

      <select
        value={organizationId ?? ''}
        onChange={(e) => setOrganization(e.target.value || null)}
        className="glass-input w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>

      {creating ? (
        <form className="space-y-2" onSubmit={handleCreate}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New client organization"
            className="glass-input w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50/75 px-3 py-2 text-xs text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Client'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setName('')
                setError(null)
              }}
              className="glass-button rounded-xl px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="glass-button flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Client
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            Admin
          </div>
        </div>
      )}
    </div>
  )
}
