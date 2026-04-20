'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, BarChart2, RefreshCw, Share2, TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { AnalyticsResult, Dataset } from '@/types'
import { getVerifiedMetricColumns } from '@/components/dashboard/verifiedMetrics'

// ── Types ─────────────────────────────────────────────────────────────────────

type DateFilter = 'last_30_days' | 'last_90_days' | 'last_180_days' | 'all_time'

type ChannelTotals = {
  impressions: number | null
  clicks: number | null
  cost: number | null
  revenue: number | null
}

type TrendPoint = {
  date: string
  total_revenue?: number
  total_cost?: number
}

// ── Metric definitions (mirrors dashboard page) ───────────────────────────────

const METRIC_DEFS = [
  {
    key: 'impressions',
    patterns: [/impression/i, /\bimpr\b/i, /\bviews?\b/i, /\breach\b/i],
  },
  {
    key: 'clicks',
    patterns: [/\bclick/i, /\bclicks\b/i, /\blink[\s_-]*click/i],
  },
  {
    key: 'cost',
    patterns: [/\bcost\b/i, /\bspend\b/i, /ad[\s_-]*spend/i, /amount[\s_-]*spent/i],
  },
  {
    key: 'revenue',
    patterns: [
      /\brevenue\b/i,
      /\bsales\b/i,
      /\bgmv\b/i,
      /\bpurchase[\s_-]*value/i,
      /\bconversion[\s_-]*value/i,
    ],
  },
]

// ── Aggregation helpers ───────────────────────────────────────────────────────

function extractTotals(result: AnalyticsResult | null, dataset: Dataset | null): ChannelTotals {
  if (!result || !dataset || !result.result) {
    return { impressions: null, clicks: null, cost: null, revenue: null }
  }

  const numericTotals = (result.result.numeric_totals ?? {}) as Record<string, number>
  const comparison = (result.result.comparison ?? {}) as Record<string, { current?: number }>
  const mappings = dataset.metric_mappings ?? {}
  const numericCols = Object.keys((result.result.numeric_summary ?? {}) as Record<string, unknown>)

  const get = (key: string): number | null => {
    // 1. Try explicit mapping
    let col = mappings[key]
    
    // 2. Fallback: Try pattern matching against available numeric columns
    if (!col || !numericCols.includes(col)) {
      const def = METRIC_DEFS.find(d => d.key === key)
      if (def) {
        col = numericCols.find(c => def.patterns.some(p => p.test(c))) ?? null
      }
    }

    if (!col) return null
    return comparison[col]?.current ?? numericTotals[col] ?? null
  }

  return { 
    impressions: get('impressions'), 
    clicks: get('clicks'), 
    cost: get('cost'), 
    revenue: get('revenue') 
  }
}

function extractTimeSeries(
  result: AnalyticsResult | null,
  dataset: Dataset | null,
  role: string,
): Map<string, number> {
  if (!result || !dataset || !result.result) return new Map()
  
  const mappings = dataset.metric_mappings ?? {}
  const numericCols = Object.keys((result.result.numeric_summary ?? {}) as Record<string, unknown>)
  
  // 1. Try explicit mapping
  let col = mappings[role]
  
  // 2. Fallback: Pattern matching
  if (!col || !numericCols.includes(col)) {
    const def = METRIC_DEFS.find(d => d.key === role)
    if (def) {
      col = numericCols.find(c => def.patterns.some(p => p.test(c))) ?? null
    }
  }

  if (!col) return new Map()

  const mts = (result.result.metric_time_series ?? {}) as Record<
    string,
    Record<string, Array<{ date: string; value: number }>>
  >
  const dateKey = dataset.detected_date_column ?? Object.keys(mts)[0]
  if (!dateKey) return new Map()
  return new Map((mts[dateKey]?.[col] ?? []).map((pt) => [pt.date, pt.value]))
}

function buildTrend(
  gRev: Map<string, number>,
  gCost: Map<string, number>,
  mRev: Map<string, number>,
  mCost: Map<string, number>,
): TrendPoint[] {
  const allDates = new Set([...gRev.keys(), ...gCost.keys(), ...mRev.keys(), ...mCost.keys()])
  return Array.from(allDates)
    .sort()
    .map((date) => {
      const tr = (gRev.get(date) ?? 0) + (mRev.get(date) ?? 0)
      const tc = (gCost.get(date) ?? 0) + (mCost.get(date) ?? 0)
      return { date, total_revenue: tr || undefined, total_cost: tc || undefined }
    })
    .filter((pt) => pt.total_revenue || pt.total_cost)
}

function safeSum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtNum = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const fmtCur = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtPct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(2)}%`)
const fmtRoas = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}x`)
const fmtCpc = (n: number | null) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
const fmtDate = (v: string) => {
  try { return format(parseISO(v), 'MMM d') } catch { return v }
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[#e8e1d7] bg-white px-4 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-slate-400">{label}</p>
      <p className="mt-3 text-[1.35rem] font-semibold tracking-tight text-slate-800">{value}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const DATE_LABELS: Record<DateFilter, string> = {
  last_30_days: '30 days',
  last_90_days: '90 days',
  last_180_days: '180 days',
  all_time: 'All time',
}

export function ClientOverviewDashboard({ orgId }: { orgId: string }) {
  const { session } = useAuth()

  const [dateFilter, setDateFilter] = useState<DateFilter>('all_time')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [googleAnalytics, setGoogleAnalytics] = useState<AnalyticsResult | null>(null)
  const [metaAnalytics, setMetaAnalytics] = useState<AnalyticsResult | null>(null)
  // Start false — the shimmer should only show once we know we have a session
  // and have actually kicked off a request. Starting true causes a premature
  // "loading" flash before auth has even hydrated.
  const [loadingDatasets, setLoadingDatasets] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Most recent completed dataset per channel
  const googleDataset = useMemo(
    () =>
      datasets
        .filter((d) => d.report_type === 'google_ads' && d.status === 'completed')
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0] ?? null,
    [datasets],
  )
  const metaDataset = useMemo(
    () =>
      datasets
        .filter((d) => d.report_type === 'meta_ads' && d.status === 'completed')
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0] ?? null,
    [datasets],
  )

  // Load datasets for this org — only start the shimmer once we know we
  // have an active session so there is no premature loading flash.
  useEffect(() => {
    if (!session) {
      // Auth not ready yet — keep loading=false so we don't flash a shimmer
      return
    }
    let cancelled = false
    setLoadingDatasets(true)
    setError(null)
    api.datasets
      .list(session.access_token, orgId)
      .then((ds) => { if (!cancelled) setDatasets(ds) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load datasets') })
      .finally(() => { if (!cancelled) setLoadingDatasets(false) })
    return () => { cancelled = true }
  }, [session, orgId])

  // Fetch Google Ads analytics
  useEffect(() => {
    if (!session || !googleDataset) {
      setGoogleAnalytics(null)
      setLoadingGoogle(false)
      return
    }
    let cancelled = false
    setLoadingGoogle(true)
    const dateCol = googleDataset.detected_date_column
    api.analytics
      .compute(
        {
          dataset_id: googleDataset.id,
          operation: 'auto',
          ...(dateCol && dateFilter !== 'all_time' ? { date_preset: dateFilter, date_column: dateCol } : {}),
        },
        session.access_token,
        orgId,
      )
      .then((r) => { if (!cancelled) setGoogleAnalytics(r) })
      .catch((e) => { if (!cancelled) { setGoogleAnalytics(null); setError(e instanceof Error ? `Google Ads: ${e.message}` : 'Google Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingGoogle(false) })
    return () => { cancelled = true }
  }, [session, googleDataset, dateFilter, orgId])

  // Fetch Meta Ads analytics
  useEffect(() => {
    if (!session || !metaDataset) {
      setMetaAnalytics(null)
      setLoadingMeta(false)
      return
    }
    let cancelled = false
    setLoadingMeta(true)
    const dateCol = metaDataset.detected_date_column
    api.analytics
      .compute(
        {
          dataset_id: metaDataset.id,
          operation: 'auto',
          ...(dateCol && dateFilter !== 'all_time' ? { date_preset: dateFilter, date_column: dateCol } : {}),
        },
        session.access_token,
        orgId,
      )
      .then((r) => { if (!cancelled) setMetaAnalytics(r) })
      .catch((e) => { if (!cancelled) { setMetaAnalytics(null); setError(e instanceof Error ? `Meta Ads: ${e.message}` : 'Meta Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingMeta(false) })
    return () => { cancelled = true }
  }, [session, metaDataset, dateFilter, orgId])

  // Derived metrics
  const googleTotals = useMemo(() => extractTotals(googleAnalytics, googleDataset), [googleAnalytics, googleDataset])
  const metaTotals = useMemo(() => extractTotals(metaAnalytics, metaDataset), [metaAnalytics, metaDataset])

  const combined = useMemo(() => {
    const impressions = safeSum(googleTotals.impressions, metaTotals.impressions)
    const clicks = safeSum(googleTotals.clicks, metaTotals.clicks)
    const cost = safeSum(googleTotals.cost, metaTotals.cost)
    const revenue = safeSum(googleTotals.revenue, metaTotals.revenue)
    const ctr = impressions && clicks ? clicks / impressions : null
    const roas = cost && revenue ? revenue / cost : null
    const avgCpc = clicks && cost ? cost / clicks : null
    return { impressions, clicks, cost, revenue, ctr, roas, avgCpc }
  }, [googleTotals, metaTotals])

  const trendData = useMemo(() => {
    const gRev = extractTimeSeries(googleAnalytics, googleDataset, 'revenue')
    const gCost = extractTimeSeries(googleAnalytics, googleDataset, 'cost')
    const mRev = extractTimeSeries(metaAnalytics, metaDataset, 'revenue')
    const mCost = extractTimeSeries(metaAnalytics, metaDataset, 'cost')
    return buildTrend(gRev, gCost, mRev, mCost)
  }, [googleAnalytics, googleDataset, metaAnalytics, metaDataset])

  // Grouped bar data: cost & revenue per channel
  const channelBarData = useMemo(
    () => [
      { metric: 'Cost', google: googleTotals.cost ?? 0, meta: metaTotals.cost ?? 0 },
      { metric: 'Revenue', google: googleTotals.revenue ?? 0, meta: metaTotals.revenue ?? 0 },
    ],
    [googleTotals, metaTotals],
  )

  const hasAnyData = googleDataset !== null || metaDataset !== null
  const loadingAnalytics = loadingGoogle || loadingMeta

  // Show shimmer if: (1) auth hasn't hydrated yet, OR (2) we're actively fetching datasets.
  // This prevents the instant "No channel data" flash on first render before any request fires.
  if (!session || loadingDatasets) {
    return (
      <div className="space-y-5 p-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-[1.4rem] border border-[#ebe4da] bg-white px-4 py-5">
              <div className="shimmer-cool h-3 w-20 rounded" />
              <div className="shimmer-cool mt-4 h-6 w-24 rounded" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="shimmer-cool h-[320px] rounded-[1.7rem]" />
          <div className="shimmer-cool h-[320px] rounded-[1.7rem]" />
        </div>
      </div>
    )
  }

  if (!hasAnyData) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 p-8 text-center bg-[#fcfaf7]">
        <TrendingUp className="h-12 w-12 text-slate-200" />
        <h2 className="text-xl font-semibold text-slate-700">No reports ready</h2>
        <p className="max-w-md text-sm text-slate-500">
          We haven&apos;t found any processed Google Ads or Meta Ads datasets for your workspace yet. 
          Performance data will appear here once your admin uploads and processes your initial CSV reports.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      {/* Header + date filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-800">Combined Channel Performance</h2>
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-400">v1.1.2</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">Aggregated across Google Ads and Meta Ads</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(Object.keys(DATE_LABELS) as DateFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                dateFilter === key
                  ? 'bg-[#f0a500] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {DATE_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Channel source badges */}
      <div className="flex flex-wrap gap-2">
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${
            googleDataset
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-slate-50 text-slate-400'
          }`}
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Google Ads
          {loadingGoogle ? (
            <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
          ) : (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                googleDataset ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {googleDataset ? 'Active' : 'No data'}
            </span>
          )}
        </div>
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${
            metaDataset
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-slate-50 text-slate-400'
          }`}
        >
          <Share2 className="h-3.5 w-3.5" />
          Meta Ads
          {loadingMeta ? (
            <RefreshCw className="h-3 w-3 animate-spin opacity-50" />
          ) : (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                metaDataset ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {metaDataset ? 'Active' : 'No data'}
            </span>
          )}
        </div>
      </div>

      {/* Combined KPI row */}
      {loadingAnalytics ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-[1.4rem] border border-[#ebe4da] bg-white px-4 py-5">
              <div className="shimmer-cool h-3 w-20 rounded" />
              <div className="shimmer-cool mt-4 h-6 w-24 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          <KPI label="Impressions" value={fmtNum(combined.impressions)} />
          <KPI label="Clicks" value={fmtNum(combined.clicks)} />
          <KPI label="Total Cost" value={fmtCur(combined.cost)} />
          <KPI label="Revenue" value={fmtCur(combined.revenue)} />
          <KPI label="ROAS" value={fmtRoas(combined.roas)} />
          <KPI label="CTR" value={fmtPct(combined.ctr)} />
          <KPI label="Avg CPC" value={fmtCpc(combined.avgCpc)} />
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        {/* Revenue vs Cost Trend */}
        <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Revenue vs Cost Trend</h3>
            <span className="text-[11px] text-slate-400">Combined · {trendData.length} data points</span>
          </div>
          {loadingAnalytics ? (
            <div className="mt-4 shimmer-cool h-[280px] rounded-[1.2rem]" />
          ) : trendData.length > 0 ? (
            <div className="mt-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ov_rev" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#f0a500" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#f0a500" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="ov_cost" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e4e9f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#8a93a5', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtDate}
                    interval={Math.max(0, Math.ceil(trendData.length / 7) - 1)}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fill: '#8a93a5', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) => `$${Math.round(v).toLocaleString('en-US')}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e8e1d7',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
                    }}
                    formatter={(v: number) =>
                      `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    }
                    labelFormatter={(v) => {
                      try { return format(parseISO(String(v)), 'MMM d, yyyy') } catch { return String(v) }
                    }}
                  />
                  <Area
                    type="monotone"
                    connectNulls
                    dataKey="total_revenue"
                    name="Revenue"
                    stroke="#f0a500"
                    fill="url(#ov_rev)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    connectNulls
                    dataKey="total_cost"
                    name="Cost"
                    stroke="#f97316"
                    fill="url(#ov_cost)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 flex h-[280px] items-center justify-center rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
              <div>
                <p className="font-medium text-slate-500">No trend data available</p>
                <p className="mt-1 text-xs">Datasets need a date column with revenue/cost values to plot this chart.</p>
              </div>
            </div>
          )}
        </div>

        {/* Channel split bar chart */}
        <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Channel Split</h3>
          {loadingAnalytics ? (
            <div className="shimmer-cool h-[280px] rounded-[1.2rem]" />
          ) : googleTotals.cost !== null || metaTotals.cost !== null ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#e4e9f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="metric"
                    tick={{ fill: '#8a93a5', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#8a93a5', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) =>
                      v >= 1000
                        ? `$${(v / 1000).toFixed(0)}k`
                        : `$${v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e8e1d7',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
                    }}
                    formatter={(v: number) =>
                      `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="google" name="Google Ads" fill="#4285f4" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  <Bar dataKey="meta" name="Meta Ads" fill="#1877f2" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              No spend data available
            </div>
          )}
        </div>
      </div>

      {/* Channel breakdown table */}
      <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Channel Breakdown</h3>
        {loadingAnalytics ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="shimmer-cool h-10 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Channel', 'Impressions', 'Clicks', 'CTR', 'Cost', 'Revenue', 'ROAS', 'Avg CPC'].map((h) => (
                    <th
                      key={h}
                      className={`py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${h === 'Channel' ? 'pr-6 text-left' : 'px-3 text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  {
                    name: 'Google Ads',
                    color: '#4285f4',
                    t: googleTotals,
                    active: googleDataset !== null,
                  },
                  {
                    name: 'Meta Ads',
                    color: '#1877f2',
                    t: metaTotals,
                    active: metaDataset !== null,
                  },
                ].map(({ name, color, t, active }) => {
                  const roas = t.cost && t.revenue ? t.revenue / t.cost : null
                  const ctr = t.impressions && t.clicks ? t.clicks / t.impressions : null
                  const avgCpc = t.clicks && t.cost ? t.cost / t.clicks : null
                  return (
                    <tr key={name}>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-medium text-slate-700">{name}</span>
                          {!active && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                              No data
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtNum(t.impressions)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtNum(t.clicks)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtPct(ctr)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtCur(t.cost)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtCur(t.revenue)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{fmtRoas(roas)}</td>
                      <td className="py-3 pl-3 text-right font-mono text-slate-600">{fmtCpc(avgCpc)}</td>
                    </tr>
                  )
                })}
                {/* Combined totals row */}
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-semibold">
                  <td className="py-3 pr-6 text-slate-800">Combined</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtNum(combined.impressions)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtNum(combined.clicks)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtPct(combined.ctr)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtCur(combined.cost)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtCur(combined.revenue)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-800">{fmtRoas(combined.roas)}</td>
                  <td className="py-3 pl-3 text-right font-mono text-slate-800">{fmtCpc(combined.avgCpc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dataset labels */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        {googleDataset && (
          <span>
            Google: <span className="font-medium text-slate-500">{googleDataset.report_name || googleDataset.file_name}</span>
          </span>
        )}
        {metaDataset && (
          <span>
            Meta: <span className="font-medium text-slate-500">{metaDataset.report_name || metaDataset.file_name}</span>
          </span>
        )}
      </div>
    </div>
  )
}
