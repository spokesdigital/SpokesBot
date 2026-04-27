'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { api, invalidateApiCache } from '@/lib/api'
import type { Dataset } from '@/types'
import { Database, Trash2, MessageSquare, UploadCloud } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function DatasetsPage() {
  const router = useRouter()
  const { session, organizations, user, loading } = useAuth()
  const { organizationId, activeDatasetId, setActiveDataset } = useDashboardStore()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    router.replace('/dashboard')
  }, [session, router])

  async function handleDelete(id: string) {
    if (!session || !confirm('Delete this dataset? This cannot be undone.')) return
    setDeleting(id)
    try {
      await api.datasets.delete(id, session.access_token)
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      invalidateApiCache()
      if (activeDatasetId === id) setActiveDataset(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleting(null)
    }
  }

  const activeOrganizationName = organizations.find((org) => org.id === organizationId)?.name
    ?? user?.organization?.name

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="shimmer-warm h-20 rounded-[1.5rem] border border-[#e8e1d7]" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Datasets</h1>
          <p className="mt-1 text-sm text-slate-500">
            {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}{' '}
            {activeOrganizationName ? `in ${activeOrganizationName}` : 'in your organization'}
          </p>
        </div>
        <a
          href="/datasets/upload"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#f9c51b] to-[#e69d00] px-4 py-2 text-sm font-medium text-[#1a1a1a] shadow-[0_14px_30px_rgba(240,165,0,0.28)] transition-all hover:brightness-105"
        >
          <UploadCloud className="w-4 h-4" />
          Upload CSV
        </a>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500 backdrop-blur-xl">
          {error}
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center space-y-3 rounded-[2rem] py-24 text-slate-500">
          <Database className="w-12 h-12 opacity-30" />
          <p className="text-lg font-medium">No datasets yet</p>
          <a href="/datasets/upload" className="text-sm text-[#d99600] hover:underline">
            Upload your first CSV →
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className={`flex cursor-pointer items-center justify-between rounded-[1.5rem] border p-4 transition-all ${
                activeDatasetId === dataset.id
                  ? 'glass-panel-strong border-emerald-200 bg-emerald-50/70'
                  : 'glass-panel hover:border-cyan-200'
              }`}
              onClick={() => setActiveDataset(dataset.id)}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70">
                  <Database className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{dataset.report_name || dataset.file_name}</p>
                  <p className="text-sm text-slate-500">
                    {dataset.report_name && dataset.report_name !== dataset.file_name ? `${dataset.file_name} · ` : ''}
                    {dataset.row_count.toLocaleString()} rows · {dataset.column_headers.length} columns ·{' '}
                    {formatDistanceToNow(new Date(dataset.uploaded_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/chat"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveDataset(dataset.id)
                  }}
                  className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/70 hover:text-emerald-500"
                  title="Chat about this dataset"
                >
                  <MessageSquare className="w-4 h-4" />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(dataset.id)
                  }}
                  disabled={deleting === dataset.id}
                  className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/70 hover:text-red-500 disabled:opacity-50"
                  title="Delete dataset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
