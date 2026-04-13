'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { UploadZone } from '@/components/upload/UploadZone'
import { useToast } from '@/components/ui/Toast'
import type { Dataset, Organization, UploadStatus } from '@/types'
import { ArrowLeft, AlertTriangle, Database, Trash2, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 30

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = use(params)
  const { session } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()

  const [org, setOrg] = useState<Organization | null>(null)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reportName, setReportName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  // ID of the dataset currently showing the inline confirm prompt
  const [confirming, setConfirming] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean up poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const [orgs, ds] = await Promise.all([
        api.organizations.list(session.access_token),
        api.datasets.list(session.access_token, orgId),
      ])
      setOrg(orgs.find((o) => o.id === orgId) ?? null)
      setDatasets(ds)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [session, orgId])

  useEffect(() => {
    if (!session || !orgId) return
    void loadData()
  }, [session, orgId, loadData])

  async function handleUpload(file: File, reportType: 'overview' | 'google_ads' | 'meta_ads') {
    if (!session) return
    const normalizedReportName = reportName.trim() || file.name.replace(/\.[^.]+$/, '')
    setIsSubmitting(true)
    setUploadStatus({ status: 'uploading', message: 'Uploading file…' })

    try {
      const { dataset_id } = await api.datasets.upload(
        file,
        orgId,
        session.access_token,
        normalizedReportName,
        reportType
      )
      api.events
        .log(
          { event_type: 'dataset_uploaded', event_metadata: { dataset_id, org_id: orgId } },
          session.access_token,
        )
        .catch(() => {})
      setUploadStatus({ status: 'processing', dataset_id, message: 'Processing CSV…' })

      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const data = await api.datasets.get(dataset_id, session.access_token)
          if (data.status === 'completed') {
            clearInterval(pollRef.current!); pollRef.current = null
            setUploadStatus({ status: 'done', dataset_id, message: 'Dataset ready!' })
            setIsSubmitting(false)
            setReportName('')
            void loadData()
            toastSuccess('Dataset uploaded and ready.')
            setTimeout(() => setUploadStatus(undefined), 2000)
          } else if (data.status === 'failed') {
            clearInterval(pollRef.current!); pollRef.current = null
            setUploadStatus({
              status: 'error',
              message: data.error_message ?? 'Processing failed. Check your CSV and try again.',
            })
            setIsSubmitting(false)
          } else {
            setUploadStatus({
              status: 'processing',
              dataset_id,
              message: data.status === 'queued' ? 'Queued…' : 'Processing CSV…',
            })
          }
        } catch {
          // Transient poll error — keep trying
        }
        if (attempts >= POLL_MAX_ATTEMPTS) {
          clearInterval(pollRef.current!); pollRef.current = null
          setUploadStatus({
            status: 'error',
            message: 'Processing timed out. Check the Datasets list in a moment.',
          })
          setIsSubmitting(false)
        }
      }, POLL_INTERVAL_MS)
    } catch (e: unknown) {
      setUploadStatus({
        status: 'error',
        message: e instanceof Error ? e.message : 'Upload failed.',
      })
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!session || deleting === id) return
    setConfirming(null)
    // Optimistic: remove immediately so the UI feels instant; restore on failure.
    const removed = datasets.find((d) => d.id === id)
    setDatasets((prev) => prev.filter((d) => d.id !== id))
    setDeleting(id)
    try {
      await api.datasets.delete(id, session.access_token)
      toastSuccess('Dataset deleted.')
    } catch (e: unknown) {
      if (removed) setDatasets((prev) => [removed, ...prev])
      const msg = e instanceof Error ? e.message : 'Delete failed.'
      setError(msg)
      toastError(msg)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6 px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/clients"
          className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-800"
          title="Back to Clients Console"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            {loading ? '…' : (org?.name ?? 'Unknown Client')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500 backdrop-blur-xl">
          {error}
        </div>
      )}

      {/* Upload */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Upload Dataset</h2>
        <div className="glass-panel mb-4 rounded-[1.5rem] p-4">
          <label htmlFor="client-report-name" className="text-sm font-medium text-slate-700">
            Report name
          </label>
          <input
            id="client-report-name"
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Google Ads Monthly Report"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
          />
          <p className="mt-2 text-xs text-slate-500">
            This label appears in the client Overview report selector. Leave blank to use the CSV filename.
          </p>
        </div>
        <UploadZone
          onFileSelected={handleUpload}
          onRetry={() => { setUploadStatus(undefined); setIsSubmitting(false) }}
          disabled={isSubmitting}
          status={uploadStatus}
        />
      </div>

      {/* Dataset list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Datasets</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass-panel flex items-center justify-between rounded-[1.5rem] p-4">
                <div className="flex items-center gap-4">
                  <div className="shimmer-cool h-10 w-10 flex-shrink-0 rounded-2xl" />
                  <div className="space-y-2">
                    <div className="shimmer-cool h-4 w-48 rounded" />
                    <div className="shimmer-cool h-3 w-36 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="shimmer-cool h-5 w-20 rounded-full" />
                  <div className="shimmer-cool h-8 w-8 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : datasets.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center space-y-2 rounded-[2rem] py-16 text-slate-500">
            <Database className="w-10 h-10 opacity-30" />
            <p className="text-sm">No datasets yet — upload a CSV above.</p>
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
                    <Database className="h-5 w-5 text-[#f0a500]" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{dataset.report_name || dataset.file_name}</p>
                    <p className="text-sm text-slate-500">
                      <span className="uppercase tracking-wider text-[#f0a500] font-bold text-[10px] mr-2">
                        {dataset.report_type.replace('_', ' ')}
                      </span>
                      {dataset.report_name && dataset.report_name !== dataset.file_name ? `${dataset.file_name} · ` : ''}
                      {dataset.row_count?.toLocaleString() ?? '—'} rows
                      {' · '}
                      {dataset.column_headers.length} cols
                      {' · '}
                      {formatDistanceToNow(new Date(dataset.uploaded_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      dataset.status === 'completed'
                        ? 'bg-[#fff9e5] text-[#a36200]'
                        : dataset.status === 'failed'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {dataset.status}
                  </span>

                  {/* Inline delete confirm — no window.confirm() */}
                  {confirming === dataset.id ? (
                    <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <span className="text-xs font-medium text-red-600">Delete?</span>
                      <button
                        onClick={() => handleDelete(dataset.id)}
                        className="ml-1 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-red-600"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-lg p-0.5 text-slate-400 transition hover:text-slate-600"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(dataset.id)}
                      disabled={deleting === dataset.id}
                      className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/70 hover:text-red-500 disabled:opacity-50"
                      title="Delete dataset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
