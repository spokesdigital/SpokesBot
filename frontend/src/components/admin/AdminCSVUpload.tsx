'use client'

import { useRef, useState } from 'react'
import { UploadCloud, CheckCircle, XCircle, Loader2, FileText, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { api, invalidateApiCache } from '@/lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 30

// ─── Types ───────────────────────────────────────────────────────────────────

type UploadPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

interface SlotState {
  phase: UploadPhase
  file: File | null
  reportName: string
  message: string | null
  datasetId: string | null
}

interface ChannelConfig {
  reportType: 'google_ads' | 'meta_ads'
  label: string
  description: string
  accentColor: string        // Tailwind-compatible hex for inline style
  accentBg: string           // light tint class (tailwind)
  accentBorder: string       // tailwind border class
  accentText: string         // tailwind text class
}

export interface AdminCSVUploadProps {
  /** Target organization to upload datasets for. */
  orgId: string
  /** Called after any slot successfully completes, so the parent can refresh its dataset list. */
  onUploadComplete?: () => void
}

// ─── Channel configurations ───────────────────────────────────────────────────

const CHANNELS: ChannelConfig[] = [
  {
    reportType: 'google_ads',
    label: 'Google Ads',
    description: 'CSV or Excel — campaign performance, clicks, impressions, CPC, and ROAS',
    accentColor: '#4285f4',
    accentBg: 'bg-[#e8f0fe]',
    accentBorder: 'border-[#4285f4]/30',
    accentText: 'text-[#1a56a7]',
  },
  {
    reportType: 'meta_ads',
    label: 'Meta Ads',
    description: 'CSV or Excel — Facebook / Instagram spend, reach, CTR, and conversions',
    accentColor: '#1877f2',
    accentBg: 'bg-[#e7f0fd]',
    accentBorder: 'border-[#1877f2]/30',
    accentText: 'text-[#1254b0]',
  },
]

// ─── File validation ──────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return 'Only CSV or Excel (.xlsx / .xls) files are accepted.'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    return `File is ${sizeMB} MB — the maximum allowed size is 100 MB.`
  }
  if (file.size === 0) {
    return 'This file appears to be empty. Please check your export and try again.'
  }
  return null
}

// ─── ChannelSlot ─────────────────────────────────────────────────────────────

interface ChannelSlotProps {
  channel: ChannelConfig
  orgId: string
  session: { access_token: string } | null
  onUploadComplete?: () => void
}

function ChannelSlot({ channel, orgId, session, onUploadComplete }: ChannelSlotProps) {
  const { success: toastSuccess, error: toastError } = useToast()

  const [slot, setSlot] = useState<SlotState>({
    phase: 'idle',
    file: null,
    reportName: '',
    message: null,
    datasetId: null,
  })
  const [dragOver, setDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function reset() {
    stopPolling()
    setSlot({ phase: 'idle', file: null, reportName: '', message: null, datasetId: null })
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleFileCandidate(file: File) {
    const err = validateFile(file)
    if (err) {
      setSlot((s) => ({ ...s, phase: 'error', file: null, message: err }))
      return
    }
    setSlot((s) => ({ ...s, file, phase: 'idle', message: null }))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (slot.phase === 'uploading' || slot.phase === 'processing') return
    const file = e.dataTransfer.files[0]
    if (file) handleFileCandidate(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileCandidate(file)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!session || !slot.file) return
    const file = slot.file
    const reportName = slot.reportName.trim() || file.name.replace(/\.[^.]+$/, '')

    stopPolling()
    setSlot((s) => ({ ...s, phase: 'uploading', message: 'Uploading…' }))

    try {
      const { dataset_id } = await api.datasets.upload(
        file,
        orgId,
        session.access_token,
        reportName,
        channel.reportType,
      )

      api.events
        .log(
          {
            event_type: 'dataset_uploaded',
            event_metadata: { dataset_id, org_id: orgId, report_type: channel.reportType },
          },
          session.access_token,
        )
        .catch(() => {})

      setSlot((s) => ({ ...s, phase: 'processing', datasetId: dataset_id, message: 'Processing…' }))

      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const data = await api.datasets.get(dataset_id, session.access_token)

          if (data.status === 'completed') {
            stopPolling()
            setSlot((s) => ({ ...s, phase: 'done', message: 'Dataset ready!' }))
            toastSuccess(`${channel.label} dataset uploaded and ready.`)
            invalidateApiCache()
            onUploadComplete?.()
            // Auto-clear the done state after 4 s so the slot is ready for a new upload
            setTimeout(reset, 4_000)
          } else if (data.status === 'failed') {
            stopPolling()
            const msg = data.error_message ?? 'Processing failed — check your CSV and try again.'
            setSlot((s) => ({ ...s, phase: 'error', message: msg }))
            toastError(`${channel.label}: ${msg}`)
          } else {
            setSlot((s) => ({
              ...s,
              phase: 'processing',
              message: data.status === 'queued' ? 'Queued…' : 'Processing…',
            }))
          }
        } catch {
          // Transient network error — keep polling
        }

        if (attempts >= POLL_MAX_ATTEMPTS) {
          stopPolling()
          setSlot((s) => ({
            ...s,
            phase: 'error',
            message: 'Processing timed out. The dataset may still appear in a moment.',
          }))
        }
      }, POLL_INTERVAL_MS)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed.'
      setSlot((s) => ({ ...s, phase: 'error', message: msg }))
      toastError(`${channel.label}: ${msg}`)
    }
  }

  const isBusy = slot.phase === 'uploading' || slot.phase === 'processing'
  const isDone = slot.phase === 'done'
  const isError = slot.phase === 'error'
  const hasFile = !!slot.file && slot.phase === 'idle'

  return (
    <div className="flex flex-col gap-4">
      {/* Channel header */}
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-white text-xs font-bold"
          style={{ backgroundColor: channel.accentColor }}
        >
          {channel.label.charAt(0)}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{channel.label}</p>
          <p className="text-xs text-slate-500">{channel.description}</p>
        </div>
      </div>

      {/* Report name input (shown when a file is staged or uploading) */}
      {(hasFile || isBusy) && (
        <input
          type="text"
          value={slot.reportName}
          onChange={(e) => setSlot((s) => ({ ...s, reportName: e.target.value }))}
          placeholder={`e.g. ${channel.label} — April 2026`}
          disabled={isBusy}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#f0a500] focus:ring-2 focus:ring-[#f0a500]/20 disabled:opacity-60"
        />
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!isBusy) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isBusy && !hasFile && inputRef.current?.click()}
        className={[
          'relative flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-[1.4rem] border-2 border-dashed p-6 transition-all',
          isBusy || isDone ? 'cursor-default' : hasFile ? 'cursor-default' : 'cursor-pointer',
          dragOver && !isBusy
            ? `${channel.accentBg} ${channel.accentBorder}`
            : isDone
              ? 'border-emerald-300 bg-emerald-50'
              : isError
                ? 'border-red-300 bg-red-50'
                : hasFile
                  ? `${channel.accentBg} ${channel.accentBorder}`
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleInputChange}
          disabled={isBusy}
        />

        {/* Icon */}
        {isBusy && <Loader2 className="h-9 w-9 animate-spin" style={{ color: channel.accentColor }} />}
        {isDone && <CheckCircle className="h-9 w-9 text-emerald-500" />}
        {isError && !hasFile && <XCircle className="h-9 w-9 text-red-400" />}
        {!isBusy && !isDone && !isError && !hasFile && (
          <UploadCloud className="h-9 w-9 text-slate-400" />
        )}
        {hasFile && <FileText className="h-9 w-9" style={{ color: channel.accentColor }} />}

        {/* Text */}
        <div className="text-center">
          {isBusy && (
            <p className="text-sm font-medium text-slate-700">{slot.message}</p>
          )}
          {isDone && (
            <p className="text-sm font-semibold text-emerald-600">Dataset ready!</p>
          )}
          {isError && (
            <>
              <p className="text-sm font-semibold text-red-600">Upload failed</p>
              <p className="mt-1 max-w-[220px] text-xs text-red-500">{slot.message}</p>
            </>
          )}
          {hasFile && (
            <>
              <p className="text-sm font-medium text-slate-800 break-all max-w-[220px]">
                {slot.file!.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {(slot.file!.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </>
          )}
          {!isBusy && !isDone && !isError && !hasFile && (
            <>
              <p className="text-sm font-medium text-slate-700">Drop file here</p>
              <p className="mt-0.5 text-xs text-slate-500">or click to browse</p>
            </>
          )}
        </div>

        {/* Dismiss file (when staged) */}
        {hasFile && (
          <button
            onClick={(e) => { e.stopPropagation(); reset() }}
            className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
            title="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Size hint */}
      {!isBusy && !isDone && !isError && !hasFile && (
        <p className="text-center text-[11px] text-slate-400">CSV or Excel · max 100 MB</p>
      )}

      {/* Upload / Retry CTA */}
      {hasFile && (
        <button
          onClick={handleUpload}
          className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-[0.98]"
          style={{ backgroundColor: channel.accentColor }}
        >
          Upload {channel.label} File
        </button>
      )}
      {isError && (
        <button
          onClick={reset}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Try Again
        </button>
      )}
    </div>
  )
}

// ─── AdminCSVUpload ───────────────────────────────────────────────────────────

/**
 * Admin-only component with two dedicated drag-and-drop upload zones:
 * one for Google Ads CSVs and one for Meta Ads CSVs.
 *
 * Renders nothing if the current user is not an admin.
 */
export function AdminCSVUpload({ orgId, onUploadComplete }: AdminCSVUploadProps) {
  const { user, session } = useAuth()

  // Admin-only guard — renders nothing for non-admin users
  if (!user || user.role !== 'admin') return null

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Channel Reports</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Upload one CSV per channel. The client&apos;s dashboard updates immediately on completion.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {CHANNELS.map((channel) => (
          <div
            key={channel.reportType}
            className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
          >
            <ChannelSlot
              channel={channel}
              orgId={orgId}
              session={session}
              onUploadComplete={onUploadComplete}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
