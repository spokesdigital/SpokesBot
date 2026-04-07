'use client'

import { useRef, useState } from 'react'
import type { UploadStatus } from '@/types'
import { UploadCloud, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface UploadZoneProps {
  onFileSelected: (file: File) => void
  onRetry?: () => void
  disabled?: boolean
  status?: UploadStatus
}

export function UploadZone({ onFileSelected, onRetry, disabled, status }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      alert('Only .csv files are accepted.')
      return
    }
    onFileSelected(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const isProcessing = status?.status === 'uploading' || status?.status === 'processing'
  const isDone = status?.status === 'done'
  const isError = status?.status === 'error'

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          glass-panel relative flex flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed p-12 cursor-pointer transition-all
          ${dragOver && !disabled ? 'border-emerald-300 bg-emerald-100/60' : 'border-white/70 hover:border-cyan-200'}
          ${disabled ? 'cursor-not-allowed opacity-60' : ''}
          ${isDone ? 'border-emerald-300 bg-emerald-100/65' : ''}
          ${isError ? 'border-red-300 bg-red-100/65' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />

        {isProcessing && (
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
        )}
        {isDone && (
          <CheckCircle className="w-12 h-12 text-emerald-400" />
        )}
        {isError && (
          <XCircle className="w-12 h-12 text-red-400" />
        )}
        {!status && (
          <UploadCloud className="h-12 w-12 text-cyan-500" />
        )}

        <div className="text-center">
          {isProcessing && (
            <>
              <p className="font-medium text-slate-800">{status.message}</p>
              <p className="mt-1 text-sm text-slate-500">This may take a moment…</p>
            </>
          )}
          {isDone && (
            <>
              <p className="font-medium text-emerald-600">Dataset ready!</p>
              <p className="mt-1 text-sm text-slate-500">Redirecting to datasets…</p>
            </>
          )}
          {isError && (
            <>
              <p className="font-medium text-red-500">Upload failed</p>
              <p className="mt-1 text-sm text-slate-500">{status?.message}</p>
            </>
          )}
          {!status && (
            <>
              <p className="font-medium text-slate-800">Drop your CSV here</p>
              <p className="mt-1 text-sm text-slate-500">or click to browse files</p>
            </>
          )}
        </div>

        {!status && (
          <p className="text-xs text-slate-500">Only .csv files accepted · Max 100 MB</p>
        )}
      </div>

      {isError && (
        <button
          onClick={onRetry ?? (() => inputRef.current?.click())}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 py-2.5 text-sm font-medium text-white shadow-[0_14px_30px_rgba(45,212,191,0.28)] transition-all hover:brightness-105"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
