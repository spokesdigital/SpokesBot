'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, Calendar, ChevronDown, Lightbulb, TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { AnalyticsResult, Dataset } from '@/types'
import { KPICard } from '@/components/dashboard/KPICard'
import { buildPriorLabel, buildNoDataLabel } from '@/components/dashboard/channelMetrics'
import type { ComparisonWindow } from '@/components/dashboard/channelMetrics'

// ── Types ─────────────────────────────────────────────────────────────────────

type DateFilter = 'last_30_days' | 'last_90_days' | 'last_180_days' | 'all_time'

type ChannelTotals = Record<string, { current: number | null; previous: number | null }>

type TrendPoint = {
  date: string
  total_revenue?: number
  total_cost?: number
}

// ── Metric definitions ────────────────────────────────────────────────────────

const METRIC_DEFS = [
  {
    key: 'impressions',
    label: 'IMPRESSIONS',
    kind: 'number',
    patterns: [/impression/i, /\bimpr\b/i, /\bviews?\b/i, /\breach\b/i],
    tooltip: 'Times your ads were shown across channels.',
  },
  {
    key: 'clicks',
    label: 'CLICKS',
    kind: 'number',
    patterns: [/\bclick/i, /\bclicks\b/i, /\blink[\s_-]*click/i],
    tooltip: 'Total number of ad clicks.',
  },
  {
    key: 'ctr',
    label: 'CTR',
    kind: 'percent',
    patterns: [/\bctr\b/i, /click[\s_-]*through[\s_-]*rate/i],
    tooltip: 'Percentage of views that became clicks.',
  },
  {
    key: 'avg_cpc',
    label: 'AVG CPC',
    kind: 'currency',
    patterns: [/\bcpc\b/i, /cost[\s_-]*per[\s_-]*click/i],
    tooltip: 'Average cost per click.',
  },
  {
    key: 'cost',
    label: 'COST',
    kind: 'currency',
    patterns: [/\bcost\b/i, /\bspend\b/i, /ad[\s_-]*spend/i, /amount[\s_-]*spent/i],
    tooltip: 'Total ad spend this period.',
  },
  {
    key: 'revenue',
    label: 'REVENUE',
    kind: 'currency',
    patterns: [
      /\brevenue\b/i,
      /\bsales\b/i,
      /\bgmv\b/i,
      /\bpurchase[\s_-]*value/i,
      /\bconversion[\s_-]*value/i,
    ],
    tooltip: 'Revenue from ad-driven customers.',
  },
  {
    key: 'roas',
    label: 'ROAS',
    kind: 'ratio',
    patterns: [/\broas\b/i, /return[\s_-]*on[\s_-]*ad[\s_-]*spend/i],
    tooltip: 'Revenue earned per $1 of ad spend.',
  },
] as const

const INVERTED_TREND_KEYS = new Set(['cost', 'avg_cpc'])

// Donut chart colors: Google Ads = amber, Meta Ads = green (matches prototype palette)
const CHANNEL_COLORS: Record<string, string> = {
  'Google Ads': '#f0a500',
  'Meta Ads': '#22c55e',
}

const DATE_LABELS: Record<DateFilter, string> = {
  last_30_days: 'Last 30 Days',
  last_90_days: 'Last 90 Days',
  last_180_days: 'Last 180 Days',
  all_time: 'All Time',
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function extractTotals(result: AnalyticsResult | null, dataset: Dataset | null): ChannelTotals {
  const base = {
    impressions: { current: null, previous: null },
    clicks: { current: null, previous: null },
    cost: { current: null, previous: null },
    revenue: { current: null, previous: null },
  }
  if (!result || !dataset || !result.result) return base

  const numericTotals = (result.result.numeric_totals ?? {}) as Record<string, number>
  const comparison = (result.result.comparison ?? {}) as Record<string, { current?: number; previous?: number }>
  const mappings = dataset.metric_mappings ?? {}
  const numericCols = Object.keys((result.result.numeric_summary ?? {}) as Record<string, unknown>)

  const get = (key: string) => {
    let col = mappings[key]
    if (!col || !numericCols.includes(col)) {
      const def = METRIC_DEFS.find(d => d.key === key)
      if (def) {
        col = numericCols.find(c => def.patterns.some(p => p.test(c))) ?? null
      }
    }
    if (!col) return { current: null, previous: null }
    return {
      current: comparison[col]?.current ?? numericTotals[col] ?? null,
      previous: comparison[col]?.previous ?? null,
    }
  }

  return {
    impressions: get('impressions'),
    clicks: get('clicks'),
    cost: get('cost'),
    revenue: get('revenue'),
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

  let col = mappings[role]
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
  return new Map((mts[dateKey]?.[col] ?? []).map(pt => [pt.date, pt.value]))
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
    .map(date => {
      const tr = (gRev.get(date) ?? 0) + (mRev.get(date) ?? 0)
      const tc = (gCost.get(date) ?? 0) + (mCost.get(date) ?? 0)
      return { date, total_revenue: tr || undefined, total_cost: tc || undefined }
    })
    .filter(pt => pt.total_revenue || pt.total_cost)
}

function safeSum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

const fmtDate = (v: string) => {
  try { return format(parseISO(v), 'MMM d') } catch { return v }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientOverviewDashboard({ orgId, orgName }: { orgId: string; orgName?: string }) {
  const { session } = useAuth()

  const [dateFilter, setDateFilter] = useState<DateFilter>('last_30_days')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [googleAnalytics, setGoogleAnalytics] = useState<AnalyticsResult | null>(null)
  const [metaAnalytics, setMetaAnalytics] = useState<AnalyticsResult | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const googleDataset = useMemo(
    () =>
      datasets
        .filter(d => d.report_type === 'google_ads' && d.status === 'completed')
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0] ?? null,
    [datasets],
  )
  const metaDataset = useMemo(
    () =>
      datasets
        .filter(d => d.report_type === 'meta_ads' && d.status === 'completed')
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0] ?? null,
    [datasets],
  )

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoadingDatasets(true)
    setError(null)
    api.datasets
      .list(session.access_token, orgId)
      .then(ds => { if (!cancelled) setDatasets(ds) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load datasets') })
      .finally(() => { if (!cancelled) setLoadingDatasets(false) })
    return () => { cancelled = true }
  }, [session, orgId])

  useEffect(() => {
    if (!session || !googleDataset) { setGoogleAnalytics(null); setLoadingGoogle(false); return }
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
      .then(r => { if (!cancelled) setGoogleAnalytics(r) })
      .catch(e => { if (!cancelled) { setGoogleAnalytics(null); setError(e instanceof Error ? `Google Ads: ${e.message}` : 'Google Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingGoogle(false) })
    return () => { cancelled = true }
  }, [session, googleDataset, dateFilter, orgId])

  useEffect(() => {
    if (!session || !metaDataset) { setMetaAnalytics(null); setLoadingMeta(false); return }
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
      .then(r => { if (!cancelled) setMetaAnalytics(r) })
      .catch(e => { if (!cancelled) { setMetaAnalytics(null); setError(e instanceof Error ? `Meta Ads: ${e.message}` : 'Meta Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingMeta(false) })
    return () => { cancelled = true }
  }, [session, metaDataset, dateFilter, orgId])

  // Derived combined metrics
  const googleTotals = useMemo(() => extractTotals(googleAnalytics, googleDataset), [googleAnalytics, googleDataset])
  const metaTotals = useMemo(() => extractTotals(metaAnalytics, metaDataset), [metaAnalytics, metaDataset])

  const comparisonWindow = useMemo(
    () => (googleAnalytics?.result?.comparison_window ?? metaAnalytics?.result?.comparison_window ?? null) as ComparisonWindow | null,
    [googleAnalytics, metaAnalytics],
  )
  const priorLabel = buildPriorLabel(comparisonWindow)
  const noDataLabel = buildNoDataLabel(comparisonWindow !== null, priorLabel)

  const combined = useMemo(() => {
    const sum = (k: keyof ChannelTotals) => ({
      current: safeSum(googleTotals[k].current, metaTotals[k].current),
      previous: safeSum(googleTotals[k].previous, metaTotals[k].previous),
    })
    const imp = sum('impressions')
    const clk = sum('clicks')
    const cst = sum('cost')
    const rev = sum('revenue')
    const ratio = (n: typeof imp, d: typeof imp) => ({
      current: n.current != null && d.current != null && d.current > 0 ? n.current / d.current : null,
      previous: n.previous != null && d.previous != null && d.previous > 0 ? n.previous / d.previous : null,
    })
    return {
      impressions: imp, clicks: clk, cost: cst, revenue: rev,
      ctr: ratio(clk, imp),
      roas: ratio(rev, cst),
      avg_cpc: ratio(cst, clk),
    }
  }, [googleTotals, metaTotals])

  const cards = useMemo(() =>
    METRIC_DEFS.map(def => {
      const data = combined[def.key as keyof typeof combined] as { current: number | null; previous: number | null }
      let delta: number | null = null
      if (data.current != null && data.previous != null && data.previous !== 0) {
        delta = ((data.current - data.previous) / Math.abs(data.previous)) * 100
      }
      let value = '—'
      if (data.current != null) {
        if (def.kind === 'currency') value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(data.current)
        else if (def.kind === 'percent') value = `${(data.current * 100).toFixed(2)}%`
        else if (def.kind === 'ratio') value = `${data.current.toFixed(2)}x`
        else value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(data.current)
      }
      const trendDirection: 'positive' | 'negative' | 'neutral' =
        delta == null || Math.abs(delta) < 0.05
          ? 'neutral'
          : INVERTED_TREND_KEYS.has(def.key)
            ? delta > 0 ? 'negative' : 'positive'
            : delta > 0 ? 'positive' : 'negative'
      return { key: def.key, label: def.label, value, trendValue: delta, trendDirection, tooltip: def.tooltip }
    }),
    [combined],
  )

  const trendData = useMemo(() => {
    const gRev = extractTimeSeries(googleAnalytics, googleDataset, 'revenue')
    const gCost = extractTimeSeries(googleAnalytics, googleDataset, 'cost')
    const mRev = extractTimeSeries(metaAnalytics, metaDataset, 'revenue')
    const mCost = extractTimeSeries(metaAnalytics, metaDataset, 'cost')
    return buildTrend(gRev, gCost, mRev, mCost)
  }, [googleAnalytics, googleDataset, metaAnalytics, metaDataset])

  const revenueSplitData = useMemo(() => {
    const rows = [
      { name: 'Google Ads', value: googleTotals.revenue.current },
      { name: 'Meta Ads', value: metaTotals.revenue.current },
    ]
    return rows.filter(r => r.value != null && r.value > 0) as { name: string; value: number }[]
  }, [googleTotals, metaTotals])

  const hasAnyData = googleDataset !== null || metaDataset !== null
  const loadingAnalytics = loadingGoogle || loadingMeta

  // ── Shimmer (auth not ready or datasets loading) ──────────────────────────
  if (!session || loadingDatasets) {
    return (
      <div className="space-y-5 p-6 md:p-8">
        <div className="shimmer-warm h-7 w-48 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
              <div className="shimmer-warm h-3 w-20 rounded" />
              <div className="shimmer-warm mt-4 h-6 w-24 rounded" />
              <div className="shimmer-warm mt-3 h-3 w-28 rounded" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
          <div className="shimmer-warm h-[320px] rounded-xl" />
          <div className="shimmer-warm h-[320px] rounded-xl" />
        </div>
      </div>
    )
  }

  // ── No data state ─────────────────────────────────────────────────────────
  if (!hasAnyData) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 p-8 text-center">
        <TrendingUp className="h-12 w-12 text-slate-200" />
        <h2 className="text-xl font-semibold text-slate-700">No reports ready</h2>
        {error ? (
          <p className="max-w-md text-sm text-red-500">{error}</p>
        ) : (
          <p className="max-w-md text-sm text-slate-500">
            No processed Google Ads or Meta Ads datasets found yet. Performance data will appear
            here once your admin uploads and processes your channel CSV reports.
          </p>
        )}
      </div>
    )
  }

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">

      {/* Page header: org name + date filter */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {orgName && (
            <p className="text-sm font-medium text-slate-500 mb-1">{orgName}</p>
          )}
          <h2 className="text-2xl font-bold text-slate-800">Overview</h2>
          <p className="mt-0.5 text-sm text-slate-500">Combined performance across all active channels</p>
        </div>

        {/* Date filter dropdown — matches prototype style */}
        <div className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="appearance-none bg-transparent pr-5 text-sm font-medium text-slate-700 outline-none cursor-pointer"
          >
            {(Object.keys(DATE_LABELS) as DateFilter[]).map(k => (
              <option key={k} value={k}>{DATE_LABELS[k]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400" />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 7 KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {loadingAnalytics
          ? Array.from({ length: 7 }).map((_, i) => <KPICard key={i} title="" value="" loading={true} />)
          : cards.map(card => (
              <KPICard
                key={card.key}
                title={card.label}
                value={card.value}
                trendValue={card.trendValue}
                trendDirection={card.trendDirection}
                priorLabel={priorLabel}
                noDataLabel={noDataLabel}
                tooltip={card.tooltip}
              />
            ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">

        {/* Revenue vs Cost Trend */}
        <div className="rounded-xl border border-border bg-card p-6 card-shadow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Revenue vs Cost Trend</h3>
            <span className="text-[11px] text-slate-400">{trendData.length} data points</span>
          </div>
          {loadingAnalytics ? (
            <div className="shimmer-warm h-[280px] rounded-xl" />
          ) : trendData.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ov_rev" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#f0a500" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f0a500" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="ov_cost" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtDate}
                    interval={Math.max(0, Math.ceil(trendData.length / 7) - 1)}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) => `$${Math.round(v).toLocaleString('en-US')}`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}
                    formatter={(v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    labelFormatter={v => { try { return format(parseISO(String(v)), 'MMM d, yyyy') } catch { return String(v) } }}
                  />
                  <Area type="monotone" connectNulls dataKey="total_revenue" name="Revenue" stroke="#f0a500" fill="url(#ov_rev)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" connectNulls dataKey="total_cost" name="Cost" stroke="#94a3b8" fill="url(#ov_cost)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              <div className="text-center">
                <p className="font-medium text-slate-500">No trend data available</p>
                <p className="mt-1 text-xs">Datasets need a date column with revenue/cost values.</p>
              </div>
            </div>
          )}
        </div>

        {/* Revenue Split donut */}
        <div className="rounded-xl border border-border bg-card p-6 card-shadow flex flex-col">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Revenue Split</h3>
          {loadingAnalytics ? (
            <div className="shimmer-warm flex-1 min-h-[280px] rounded-xl" />
          ) : revenueSplitData.length > 0 ? (
            <div className="flex flex-col items-center justify-center flex-1">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={revenueSplitData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {revenueSplitData.map(entry => (
                      <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) =>
                      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
                    }
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-3">
                {revenueSplitData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHANNEL_COLORS[entry.name] ?? '#94a3b8' }} />
                    <span className="text-xs font-medium text-slate-600">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              No revenue data available
            </div>
          )}
        </div>
      </div>

      {/* Overall AI Insights */}
      <div className="rounded-xl border border-border bg-card p-6 card-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
              <Lightbulb className="h-4 w-4 text-amber-500" />
            </div>
            <h3 className="font-semibold text-slate-800">Overall AI Insights</h3>
          </div>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-600 uppercase">
            AI-POWERED
          </span>
        </div>
        <p className="ml-11 text-sm text-slate-500">
          Combined cross-channel strategic insights will be available once sufficient historical data is aggregated.
        </p>
      </div>

    </div>
  )
}
