'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { UploadZone } from '@/components/upload/UploadZone'
import { api, invalidateApiCache } from '@/lib/api'
import { useDashboardStore } from '@/store/dashboard'
import type { UploadStatus } from '@/types'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 30  // 60 seconds total

export default function UploadPage() {
  const { session, user, organizations } = useAuth()
  const { organizationId } = useDashboardStore()
  const router = useRouter()
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reportName, setReportName] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setUploadStatus(undefined)
    setIsSubmitting(false)
  }, [organizationId])

  if (user && user.role !== 'admin') {
    router.replace('/dashboard')
    return null
  }

  async function handleUpload(file: File) {
    const targetOrgId = user?.role === 'admin' ? organizationId : user?.organization?.id
    if (!session || !targetOrgId) return
    const normalizedReportName = reportName.trim() || file.name.replace(/\.[^.]+$/, '')
    setIsSubmitting(true)
    setUploadStatus({ status: 'uploading', message: 'Uploading file…' })

    try {
      const { dataset_id } = await api.datasets.upload(file, targetOrgId, session.access_token, normalizedReportName)

      api.events.log({ event_type: 'dataset_uploaded', event_metadata: { dataset_id } }, session.access_token).catch(() => {})
      setUploadStatus({ status: 'processing', dataset_id, message: 'Processing CSV…' })

      // Poll the dataset status field: queued → processing → completed | failed
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const data = await api.datasets.get(dataset_id, session.access_token)

          if (data) {

            if (data.status === 'completed') {
              clearInterval(pollRef.current!)
              pollRef.current = null
              setUploadStatus({ status: 'done', dataset_id, message: 'Dataset ready!' })
              setReportName('')
              invalidateApiCache()
              setTimeout(() => router.push('/dashboard/datasets'), 1200)
              return
            }

            if (data.status === 'failed') {
              clearInterval(pollRef.current!)
              pollRef.current = null
              setUploadStatus({
                status: 'error',
                message: data.error_message ?? 'Processing failed. Please check your CSV and try again.',
              })
              setIsSubmitting(false)
              return
            }

            // status is 'queued' or 'processing' — keep polling
            setUploadStatus({
              status: 'processing',
              dataset_id,
              message: data.status === 'queued' ? 'Queued…' : 'Processing CSV…',
            })
          }
        } catch {
          // Transient poll error — keep trying until max attempts
        }

        if (attempts >= POLL_MAX_ATTEMPTS) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setUploadStatus({
            status: 'error',
            message: 'Processing timed out. The server may still be working — check Datasets in a moment.',
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

  function handleRetry() {
    setUploadStatus(undefined)
    setIsSubmitting(false)
  }

  const activeOrganizationName = organizations.find((org) => org.id === organizationId)?.name
    ?? user?.organization?.name

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Upload Dataset</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV file to {activeOrganizationName ?? 'the selected organization'}. Ensure columns have clear headers. Max 100 MB.
        </p>
      </div>

      <div className="glass-panel rounded-[1.6rem] p-5">
        <label htmlFor="report-name" className="text-sm font-medium text-slate-700">
          Report name
        </label>
        <input
          id="report-name"
          type="text"
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          placeholder="Meta Ads Weekly Report"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-cyan-200 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
        />
        <p className="mt-2 text-xs text-slate-500">
          Clients will use this name in the Overview report dropdown. If left blank, we’ll use the CSV filename.
        </p>
      </div>

      <UploadZone
        onFileSelected={handleUpload}
        onRetry={handleRetry}
        disabled={isSubmitting}
        status={uploadStatus}
      />
    </div>
  )
}
