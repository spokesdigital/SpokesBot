'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import { Users, ChevronRight, Database, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ClientsPage() {
  const { session } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback((token: string) => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.organizations.list(token),
      api.datasets.list(token, undefined, true),
    ])
      .then(([orgs, datasets]) => { setOrgs(orgs); setDatasets(datasets) })
      .catch(e => {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg || 'Failed to load. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!session) return
    fetchData(session.access_token)
  }, [session, fetchData])

  const datasetCountByOrg = datasets.reduce<Record<string, number>>((acc, d) => {
    acc[d.organization_id] = (acc[d.organization_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6 px-8 py-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Clients Console</h1>
        <p className="mt-1 text-sm text-slate-500">
          {orgs.length} organization{orgs.length !== 1 ? 's' : ''} on the platform
        </p>
      </div>

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
          <p className="text-sm">Create an organization in Supabase to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => {
            const count = datasetCountByOrg[org.id] ?? 0
            return (
              <Link
                key={org.id}
                href={`/admin/clients/${org.id}`}
                className="glass-panel flex items-center justify-between rounded-[1.5rem] p-5 transition-all hover:border-[#f0a500]/40 hover:shadow-[0_18px_50px_rgba(240,165,0,0.12)]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-br from-[#ffe48a]/30 to-[#ecab00]/20">
                    <Users className="h-5 w-5 text-[#d99600]" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{org.name}</p>
                    <p className="text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {count} dataset{count !== 1 ? 's' : ''}
                      </span>
                      {' · '}
                      Created {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="text-sm">Manage</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
