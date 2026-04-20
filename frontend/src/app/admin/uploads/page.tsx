'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Dataset, Organization } from '@/types'
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  X,
  FileText,
  RotateCcw,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ACCEPTED_EXTS = ['.csv', '.xlsx', '.xls']

const REPORT_TYPE_OPTIONS = [
  { value: 'overview',    label: 'Overview Report' },
  { value: 'google_ads',  label: 'Google Ads' },
  { value: 'meta_ads',   label: 'Meta Ads' },
]

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ACCEPTED_EXTS.includes(ext)) return 'Only CSV or XLSX files are accepted.'
  if (file.size > MAX_FILE_SIZE) return 'File exceeds 50 MB limit.'
  if (file.size === 0) return 'File is empty.'
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: Dataset['status'] }) {
  const cfg: Record<Dataset['status'], string> = {
    completed:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
    failed:     'bg-red-50 text-red-600 border border-red-200',
    processing: 'bg-amber-50 text-amber-700 border border-amber-200',
    queued:     'bg-slate-50 text-slate-600 border border-slate-200',
  }
  const labels: Record<Dataset['status'], string> = {
    completed: 'Success', failed: 'Failed', processing: 'Processing', queued: 'Queued',
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cfg[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function UploadsPage() {
  const { session } = useAuth()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data ─────────────────────────────────────────────────────────────────
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // ── Upload form state ─────────────────────────────────────────────────────
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [reportType, setReportType] = useState('overview')
  const [reportName, setReportName] = useState('')
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]))

  const fetchHistory = useCallback(async (token: string) => {
    try {
      const [nextOrgs, nextDatasets] = await Promise.all([
        api.organizations.list(token),
        api.datasets.list(token, undefined, true),
      ])
      setOrgs(nextOrgs)
      setDatasets(nextDatasets)
    } catch { /* silent */ }
    finally { setLoadingHistory(false) }
  }, [])

  useEffect(() => {
    if (!session) return
    void fetchHistory(session.access_token)
  }, [session, fetchHistory])

  // ── File handling ─────────────────────────────────────────────────────────
  function stageFile(file: File) {
    const err = validateFile(file)
    if (err) { setFileError(err); setStagedFile(null); return }
    setFileError(null)
    setStagedFile(file)
    setUploadState('idle')
    setUploadError(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) stageFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) stageFile(file)
  }

  function clearFile() {
    setStagedFile(null)
    setFileError(null)
    setUploadState('idle')
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!session || !stagedFile || !selectedOrgId) return
    setUploadState('uploading')
    setUploadError(null)
    try {
      const { dataset_id } = await api.datasets.upload(
        stagedFile,
        selectedOrgId,
        session.access_token,
        reportName.trim() || undefined,
        reportType,
      )
      setUploadState('processing')
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const ds = await api.datasets.get(dataset_id, session.access_token)
          if (ds.status === 'completed' || ds.status === 'failed') {
            clearInterval(pollRef.current!)
            setUploadState(ds.status === 'completed' ? 'done' : 'error')
            if (ds.status === 'failed') setUploadError(ds.error_message ?? 'Processing failed.')
            void fetchHistory(session.access_token)
          }
        } catch { /* poll failure — keep trying */ }
        if (attempts >= 30) {
          clearInterval(pollRef.current!)
          setUploadState('error')
          setUploadError('Timed out waiting for processing.')
        }
      }, 2000)
    } catch (e) {
      setUploadState('error')
      setUploadError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const canUpload = !!selectedOrgId && !!stagedFile && uploadState === 'idle'

  return (
    <div className="space-y-8 px-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Data Uploads</h1>
        <p className="mt-1 text-sm text-slate-500">Upload and manage client data files</p>
      </div>

      {/* Upload zone card */}
      <div className="glass-panel rounded-[1.75rem] p-6">
        <h2 className="mb-5 text-base font-semibold text-slate-800">Upload New File</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-5">
          {/* Client selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500 uppercase tracking-wider">Client</label>
            <div className="relative">
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-8 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              >
                <option value="">Select a client…</option>
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Report type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500 uppercase tracking-wider">Report Type</label>
            <div className="relative">
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-8 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
              >
                {REPORT_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Report name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500 uppercase tracking-wider">Report Name <span className="text-slate-400 normal-case">(optional)</span></label>
            <input
              type="text"
              value={reportName}
              onChange={e => setReportName(e.target.value)}
              placeholder="e.g. Q1 2025 Report"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20"
            />
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !stagedFile && fileInputRef.current?.click()}
          className={`relative flex min-h-[180px] flex-col items-center justify-center rounded-[1.25rem] border-2 border-dashed transition-all
            ${isDragging ? 'border-[#f0a500] bg-amber-50/50' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white/60'}
            ${!stagedFile ? 'cursor-pointer' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileInput}
            className="hidden"
          />

          {uploadState === 'done' ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="font-semibold text-emerald-700">Upload complete!</p>
              <p className="text-sm text-slate-500">File processed successfully.</p>
              <button onClick={(e) => { e.stopPropagation(); clearFile(); setReportName('') }} className="mt-1 text-xs text-[#d99600] hover:underline">
                Upload another file
              </button>
            </div>
          ) : uploadState === 'error' ? (
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <p className="font-semibold text-red-600">Upload failed</p>
              <p className="text-sm text-slate-500">{uploadError}</p>
              <button onClick={(e) => { e.stopPropagation(); clearFile() }} className="mt-1 text-xs text-[#d99600] hover:underline">
                Try again
              </button>
            </div>
          ) : uploadState === 'uploading' || uploadState === 'processing' ? (
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-8 w-8 animate-spin text-[#f0a500]" />
              <p className="text-sm font-medium text-slate-700">
                {uploadState === 'uploading' ? 'Uploading…' : 'Processing CSV…'}
              </p>
            </div>
          ) : stagedFile ? (
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
                <FileText className="h-6 w-6 text-[#f0a500]" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{stagedFile.name}</p>
                <p className="text-sm text-slate-500">{formatBytes(stagedFile.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); clearFile() }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
              {fileError && <p className="text-xs text-red-500">{fileError}</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <Upload className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <p className="font-medium text-slate-700">
                  Drag & drop files here, or{' '}
                  <span className="text-[#d99600] hover:underline">browse</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">CSV, XLSX up to 50MB</p>
              </div>
              {fileError && <p className="text-xs text-red-500">{fileError}</p>}
            </div>
          )}
        </div>

        {/* Upload button */}
        {stagedFile && uploadState === 'idle' && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className="flex items-center gap-2 rounded-xl bg-[#f0a500] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d99600] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Upload File
            </button>
          </div>
        )}
      </div>

      {/* Upload History */}
      <div className="glass-panel overflow-hidden rounded-[1.75rem]">
        <div className="border-b border-white/60 px-6 py-5">
          <h2 className="text-base font-semibold text-slate-800">Upload History</h2>
        </div>

        {loadingHistory ? (
          <div className="divide-y divide-white/40">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <div className="shimmer-cool h-4 w-48 rounded" />
                <div className="shimmer-cool h-4 w-28 rounded" />
                <div className="shimmer-cool h-4 w-24 rounded" />
                <div className="shimmer-cool ml-auto h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Upload className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">No uploads yet. Upload your first file above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/40 bg-white/20">
                  {['FILE NAME', 'CLIENT', 'UPLOAD DATE', 'STATUS', 'ACTIONS'].map(col => (
                    <th key={col} className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {datasets.map(ds => (
                  <tr key={ds.id} className="transition hover:bg-white/40">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="font-medium text-slate-800 truncate max-w-[220px]">
                          {ds.report_name ?? ds.file_name}
                        </span>
                      </div>
                      {ds.report_name && ds.report_name !== ds.file_name && (
                        <p className="mt-0.5 pl-7 text-xs text-slate-400 truncate max-w-[220px]">{ds.file_name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/clients/${ds.organization_id}`}
                        className="text-sm font-medium text-[#d99600] hover:underline"
                      >
                        {orgMap[ds.organization_id] ?? '—'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(parseISO(ds.uploaded_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ds.status} />
                    </td>
                    <td className="px-6 py-4">
                      {ds.status === 'failed' ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/clients/${ds.organization_id}`}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Link>
                          <Link
                            href={`/admin/clients/${ds.organization_id}`}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition"
                          >
                            Fix &amp; Re-upload →
                          </Link>
                        </div>
                      ) : ds.status === 'completed' ? (
                        <Link
                          href={`/admin/clients/${ds.organization_id}`}
                          className="text-xs font-medium text-[#d99600] hover:underline"
                        >
                          View →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
