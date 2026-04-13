'use client'

import { useMemo, useState } from 'react'
import { Building2, Check, ChevronDown, Plus, X } from 'lucide-react'
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
    <div className="space-y-2.5 rounded-[1.2rem] border border-[#f3e6a8] bg-[#fffdf5] p-2.5">
      {/* Current org display */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fff3cc] to-[#ffe8a0]">
          <Building2 className="h-4 w-4 text-[#a36200]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#b38000]">
            Active Client
          </p>
          <p className="truncate text-[0.82rem] font-medium text-slate-800">
            {selectedOrganization?.name ?? 'Select a client'}
          </p>
        </div>
      </div>

      {/* Org selector */}
      {organizations.length > 0 && (
        <div className="relative">
          <select
            value={organizationId ?? ''}
            onChange={(e) => setOrganization(e.target.value || null)}
            className="w-full appearance-none rounded-xl border border-[#f0e5c0] bg-white px-3 py-2 pr-7 text-[0.8rem] text-slate-700 outline-none transition focus:border-[#f5b800] focus:ring-2 focus:ring-[#f9c51b]/30"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>
      )}

      {/* Create form */}
      {creating ? (
        <form className="space-y-2" onSubmit={handleCreate}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New client name…"
            autoFocus
            className="w-full rounded-xl border border-[#f0e5c0] bg-white px-3 py-2 text-[0.8rem] text-slate-700 outline-none transition focus:border-[#f5b800] focus:ring-2 focus:ring-[#f9c51b]/30"
          />
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50/75 px-3 py-1.5 text-[0.75rem] text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 rounded-xl bg-[#f0a500] px-3 py-1.5 text-[0.8rem] font-medium text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setName(''); setError(null) }}
              className="flex items-center justify-center rounded-xl border border-[#e8e1d7] bg-white px-2.5 py-1.5 text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#f0e5c0] bg-white px-3 py-1.5 text-[0.8rem] font-medium text-[#a36200] transition hover:bg-[#fffbeb]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Client
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-[#f3e6a8] bg-[#fffbeb] px-2.5 py-1.5 text-[0.72rem] font-semibold text-[#a36200]">
            <Check className="h-3 w-3" />
            Admin
          </div>
        </div>
      )}
    </div>
  )
}
