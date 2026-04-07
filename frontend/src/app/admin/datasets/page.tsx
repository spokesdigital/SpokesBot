'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import { Database } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function GlobalDatasetsPage() {
  const { session } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    Promise.all([
      api.datasets.list(session.access_token, undefined, true),
      api.organizations.list(session.access_token),
    ])
      .then(([datasets, orgs]) => { setDatasets(datasets); setOrgs(orgs) })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }, [session])

  const orgNameById = Object.fromEntries(orgs.map((o) => [o.id, o.name]))

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Global Datasets</h1>
        <p className="mt-1 text-sm text-slate-500">
          {datasets.length} dataset{datasets.length !== 1 ? 's' : ''} across all clients
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500 backdrop-blur-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-panel h-20 rounded-[1.5rem] animate-pulse" />
          ))}
        </div>
      ) : datasets.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Database className="w-12 h-12 opacity-30" />
          <p className="text-lg font-medium">No datasets yet</p>
          <p className="text-sm">Upload a CSV from a client&apos;s page to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className="glass-panel flex items-center justify-between rounded-[1.5rem] p-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/70">
                  <Database className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{dataset.report_name || dataset.file_name}</p>
                  <p className="text-sm text-slate-500">
                    {dataset.report_name && dataset.report_name !== dataset.file_name ? `${dataset.file_name} · ` : ''}
                    <Link
                      href={`/admin/clients/${dataset.organization_id}`}
                      className="text-emerald-600 hover:underline"
                    >
                      {orgNameById[dataset.organization_id] ?? dataset.organization_id}
                    </Link>
                    {' · '}
                    {dataset.row_count?.toLocaleString() ?? '—'} rows
                    {' · '}
                    {formatDistanceToNow(new Date(dataset.uploaded_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  dataset.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : dataset.status === 'failed'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {dataset.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
