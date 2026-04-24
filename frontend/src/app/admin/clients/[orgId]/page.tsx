'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { ClientOverviewDashboard } from '@/components/admin/ClientOverviewDashboard'
import { ChannelPage } from '@/components/dashboard/ChannelPage'
import { AdminCSVUpload } from '@/components/admin/AdminCSVUpload'
import type { Dataset, Organization } from '@/types'
import {
  ArrowLeft,
  AlertTriangle,
  Database,
  Trash2,
  X,
  LayoutDashboard,
  Upload,
  BarChart2,
  Share2,
  UserMinus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'



type MainTab = 'data' | 'client-view'
type ClientViewTab = 'overview' | 'google-ads' | 'meta-ads'

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = use(params)
  const { session } = useAuth()
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()

  const [org, setOrg] = useState<Organization | null>(null)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removingOrg, setRemovingOrg] = useState(false)
  const [confirmRemoveOrg, setConfirmRemoveOrg] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('data')
  const [clientViewTab, setClientViewTab] = useState<ClientViewTab>('overview')

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



  async function handleDelete(id: string) {
    if (!session || deleting === id) return
    setConfirming(null)
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

  async function handleRemoveOrg() {
    if (!session) return
    setRemovingOrg(true)
    setConfirmRemoveOrg(false)
    try {
      await api.organizations.delete(orgId, session.access_token)
      toastSuccess(`${org?.name ?? 'Client'} removed.`)
      router.replace('/admin/clients')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove client.'
      setError(msg)
      toastError(msg)
    } finally {
      setRemovingOrg(false)
    }
  }

  return (
    <div className="min-h-full bg-[#fcfaf7]">
      {/* Page header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e7e1d6] bg-white px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/clients"
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Back to Clients Console"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-[0.75rem] font-bold tracking-[0.1em] text-[#8a93a5] uppercase">
              Admin › Clients
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[#252b36]">
              {loading ? '…' : (org?.name ?? 'Unknown Client')}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Database className="w-4 h-4" />
            {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
          </span>
          {confirmRemoveOrg ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
              <span className="text-xs font-medium text-red-600">Remove this client?</span>
              <button
                onClick={handleRemoveOrg}
                disabled={removingOrg}
                className="ml-1 rounded-lg bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {removingOrg ? 'Removing…' : 'Yes, remove'}
              </button>
              <button
                onClick={() => setConfirmRemoveOrg(false)}
                className="rounded-lg p-0.5 text-slate-400 transition hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemoveOrg(true)}
              title="Remove this client"
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
            >
              <UserMinus className="h-3.5 w-3.5" />
              Remove Client
            </button>
          )}
        </div>
      </header>

      {/* Main tab bar */}
      <div className="border-b border-[#e7e1d6] bg-white px-4 sm:px-6 md:px-8">
        <nav className="flex gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={mainTab === 'data'}
            onClick={() => setMainTab('data')}
            className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'data'
                ? 'border-[#f0a500] text-[#f0a500]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Upload className="w-4 h-4" />
            Data Management
          </button>
          <button
            role="tab"
            aria-selected={mainTab === 'client-view'}
            onClick={() => setMainTab('client-view')}
            className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'client-view'
                ? 'border-[#f0a500] text-[#f0a500]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Client View
          </button>
        </nav>
      </div>

      {/* ── DATA MANAGEMENT TAB ── */}
      {mainTab === 'data' && (
        <div className="space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* ── Channel uploads (Google Ads + Meta Ads) ── */}
          <section>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Upload Datasets</h2>
            <p className="mb-5 text-sm text-slate-500">
              CSV and Excel files are processed and immediately reflected in the client&apos;s dashboard.
            </p>
            <AdminCSVUpload orgId={orgId} onUploadComplete={loadData} />
          </section>



          {/* Dataset list */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Uploaded Datasets</h2>
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
                <p className="text-sm">No datasets yet — upload a file above.</p>
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
                            {dataset.report_type.replace(/_/g, ' ')}
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
          </section>
        </div>
      )}

      {/* ── CLIENT VIEW TAB ── */}
      {mainTab === 'client-view' && (
        <div>
          {/* Impersonation banner */}
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 md:px-8 text-sm text-amber-700">
            <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            <span>
              Viewing as <strong>{org?.name ?? orgId}</strong> — data is scoped to this client&apos;s organization.
            </span>
          </div>

          {/* Client-view sub-nav */}
          <div className="border-b border-[#e7e1d6] bg-white px-4 sm:px-6 md:px-8">
            <nav className="flex gap-1" role="tablist">
              <button
                role="tab"
                aria-selected={clientViewTab === 'overview'}
                onClick={() => setClientViewTab('overview')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  clientViewTab === 'overview'
                    ? 'border-[#252b36] text-[#252b36]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Overview
              </button>
              <button
                role="tab"
                aria-selected={clientViewTab === 'google-ads'}
                onClick={() => setClientViewTab('google-ads')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  clientViewTab === 'google-ads'
                    ? 'border-[#4285f4] text-[#4285f4]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Google Ads
              </button>
              <button
                role="tab"
                aria-selected={clientViewTab === 'meta-ads'}
                onClick={() => setClientViewTab('meta-ads')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  clientViewTab === 'meta-ads'
                    ? 'border-[#1877f2] text-[#1877f2]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                Meta Ads
              </button>
            </nav>
          </div>

          {/* Render the correct dashboard component for this client */}
          {clientViewTab === 'overview' && (
            <ClientOverviewDashboard orgId={orgId} orgName={org?.name} />
          )}
          {clientViewTab === 'google-ads' && (
            <ChannelPage
              reportType="google_ads"
              channelName="Google Ads"
              accentColor="#4285f4"
              accentLight="#e8f0fe"
              accentText="#1a56a7"
              targetOrgId={orgId}
            />
          )}
          {clientViewTab === 'meta-ads' && (
            <ChannelPage
              reportType="meta_ads"
              channelName="Meta Ads"
              accentColor="#1877f2"
              accentLight="#e7f0fd"
              accentText="#1254b0"
              targetOrgId={orgId}
            />
          )}
        </div>
      )}
    </div>
  )
}
