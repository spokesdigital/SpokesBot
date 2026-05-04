'use client'

import { startTransition, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import dynamic from 'next/dynamic'
import { AlertCircle, Calendar, Check, ChevronDown } from 'lucide-react'
import { EmptyDashboardState } from '@/components/dashboard/EmptyDashboardState'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { AnalyticsResult, Dataset } from '@/types'
import { KPICard } from '@/components/dashboard/KPICard'
import { OverallInsights } from '@/components/dashboard/OverallInsights'
import { useDashboardStore } from '@/store/dashboard'
import { useShallow } from 'zustand/react/shallow'
import { buildPriorLabel, buildNoDataLabel } from '@/components/dashboard/channelMetrics'
import type { ComparisonWindow } from '@/components/dashboard/channelMetrics'
import type { AIInsight } from '@/types'

const OverviewAreaChart = dynamic(
  () => import('./OverviewCharts').then((m) => ({ default: m.OverviewAreaChart })),
  { ssr: false, loading: () => <div className="shimmer-warm h-[280px] rounded-xl" /> },
)
const OverviewPieChart = dynamic(
  () => import('./OverviewCharts').then((m) => ({ default: m.OverviewPieChart })),
  { ssr: false, loading: () => <div className="shimmer-warm flex-1 min-h-[300px] rounded-xl" /> },
)

// ── Types ─────────────────────────────────────────────────────────────────────

type PresetFilter = 'last_30_days' | 'last_90_days' | 'last_180_days' | 'last_12_months' | 'all_time' | 'custom'

type DateSelection =
  | { preset: Exclude<PresetFilter, 'custom'> }
  | { preset: 'custom'; startDate: string; endDate: string }

type ChannelTotals = Record<string, { current: number | null; previous: number | null }>

type TrendPoint = {
  date: string
  total_revenue?: number | null
  total_cost?: number | null
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

const INVERTED_TREND_KEYS = new Set(['cost', 'avg_cpc', 'cpa', 'cpm'])

const CHANNEL_COLORS: Record<string, string> = {
  'Google Ads': '#f0a500',
  'Meta Ads': '#22c55e',
}

const STATUS_PATTERNS = [
  /\bdelivered\b/i,
  /\bin[\s_-]?stock\b/i,
  /\bshipped\b/i,
  /\bpending\b/i,
  /\bprocessing\b/i,
  /\bcancell?ed\b/i,
  /\bcompleted?\b/i,
  /\bfulfill?ed?\b/i,
  /\breturned?\b/i,
  /\bout[\s_-]?of[\s_-]?stock\b/i,
]

const STATUS_COLORS = [
  '#22c55e', // green — Delivered / In Stock
  '#f0a500', // amber — Pending / Processing
  '#3b82f6', // blue  — Shipped / Completed
  '#f97316', // orange — Returned
  '#ef4444', // red   — Cancelled / Out of Stock
  '#a855f7', // purple — fallback
  '#06b6d4', // cyan   — fallback
]

const PRESET_LABELS: Record<Exclude<PresetFilter, 'custom'>, string> = {
  last_30_days: 'Last 30 Days',
  last_90_days: 'Last 90 Days',
  last_180_days: 'Last 180 Days',
  last_12_months: 'Last 12 Months',
  all_time: 'All Time',
}

const OVERVIEW_CACHE_LIMIT = 24
const overviewAnalyticsCache = new Map<string, AnalyticsResult>()
const overviewInsightsCache = new Map<string, AIInsight[]>()

function setOverviewCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size > OVERVIEW_CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

function serializeDateSelection(selection: DateSelection): string {
  if (selection.preset === 'custom') {
    return `custom:${selection.startDate}:${selection.endDate}`
  }

  return selection.preset
}

function buildOverviewAnalyticsKey(dataset: Dataset, orgId: string, dateSelection: DateSelection): string {
  return [
    orgId,
    dataset.id,
    dataset.detected_date_column ?? 'no-date-column',
    serializeDateSelection(dateSelection),
  ].join('::')
}

// ── Date filter dropdown ──────────────────────────────────────────────────────

function DateFilterDropdown({
  value,
  onChange,
}: {
  value: DateSelection
  onChange: (v: DateSelection) => void
}) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label =
    value.preset === 'custom'
      ? `${value.startDate} → ${value.endDate}`
      : PRESET_LABELS[value.preset]

  function applyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return
    onChange({ preset: 'custom', startDate: customStart, endDate: customEnd })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Preset options */}
          <div className="p-1.5">
            {(Object.entries(PRESET_LABELS) as [Exclude<PresetFilter, 'custom'>, string][]).map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => { onChange({ preset: key }); setOpen(false) }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  value.preset === key
                    ? 'bg-amber-50 font-semibold text-amber-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {lbl}
                {value.preset === key && <Check className="h-3.5 w-3.5 text-amber-500" />}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Custom date range */}
          <div className="p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Custom Range</p>
            <div className="space-y-1.5">
              <div>
                <label className="text-[11px] text-slate-500 mb-0.5 block">Start</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-0.5 block">End</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  min={customStart}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!customStart || !customEnd || customStart > customEnd}
              className="w-full rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
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
  const mappings = ((result.result.metric_mappings ?? dataset.metric_mappings) ?? {}) as Record<string, string | null>
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

  const mappings = ((result.result.metric_mappings ?? dataset.metric_mappings) ?? {}) as Record<string, string | null>
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

function extractStatusData(
  results: (AnalyticsResult | null)[],
): { name: string; value: number; color: string }[] | null {
  for (const result of results) {
    if (!result?.result) continue
    const charts = result.result.categorical_charts as Record<string, Record<string, number>> | undefined
    if (!charts) continue

    for (const [col, valueCounts] of Object.entries(charts)) {
      const colLower = col.toLowerCase()
      const isStatusCol = /status|delivery|fulfil|ship|stock|order[\s_-]?state/i.test(colLower)
      const entries = Object.entries(valueCounts)
      const matchingEntries = entries.filter(([k]) => STATUS_PATTERNS.some(p => p.test(k)))

      if (isStatusCol || matchingEntries.length >= 2) {
        const rows = (matchingEntries.length >= 2 ? matchingEntries : entries)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7)
          .map(([name, value], i) => ({ name, value, color: STATUS_COLORS[i % STATUS_COLORS.length] }))
        if (rows.length > 0) return rows
      }
    }
  }
  return null
}

function buildTrend(
  gRev: Map<string, number>,
  gCost: Map<string, number>,
  mRev: Map<string, number>,
  mCost: Map<string, number>,
  dateSelection: DateSelection
): TrendPoint[] {
  const allDates = new Set([...gRev.keys(), ...gCost.keys(), ...mRev.keys(), ...mCost.keys()])
  let datesArray = Array.from(allDates).sort()

  if (dateSelection.preset !== 'all_time') {
    let startStr: string
    let endStr: string

    if (dateSelection.preset === 'custom') {
      startStr = dateSelection.startDate
      endStr = dateSelection.endDate
    } else {
      const today = new Date()
      const days = dateSelection.preset === 'last_90_days' ? 90 : dateSelection.preset === 'last_180_days' ? 180 : dateSelection.preset === 'last_12_months' ? 365 : 30
      const start = new Date(today)
      start.setDate(today.getDate() - days + 1) // +1 because e.g. 30 days includes today
      startStr = start.toISOString().split('T')[0]
      endStr = today.toISOString().split('T')[0]
    }

    const range: string[] = []
    const cursor = new Date(`${startStr}T00:00:00Z`)
    const end = new Date(`${endStr}T00:00:00Z`)
    while (cursor <= end) {
      range.push(cursor.toISOString().split('T')[0])
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    datesArray = range
  } else if (datesArray.length > 0) {
    const range: string[] = []
    const cursor = new Date(`${datesArray[0]}T00:00:00Z`)
    const end = new Date(`${datesArray[datesArray.length - 1]}T00:00:00Z`)
    while (cursor <= end) {
      range.push(cursor.toISOString().split('T')[0])
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    datesArray = range
  }

  return datesArray.map(date => {
    const r1 = gRev.get(date)
    const m1 = mRev.get(date)
    const tr = (r1 == null && m1 == null) ? null : (r1 ?? 0) + (m1 ?? 0)

    const c1 = gCost.get(date)
    const cm1 = mCost.get(date)
    const tc = (c1 == null && cm1 == null) ? null : (c1 ?? 0) + (cm1 ?? 0)

    return { date, total_revenue: tr, total_cost: tc }
  })
}

function safeSum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

// Build analytics params for a dataset given the current date selection
function buildAnalyticsParams(dateSelection: DateSelection, dateCol: string | null) {
  if (dateSelection.preset === 'all_time' || !dateCol) return {}
  if (dateSelection.preset === 'custom') {
    return {
      date_preset: 'custom',
      date_column: dateCol,
      start_date: dateSelection.startDate,
      end_date: dateSelection.endDate,
    }
  }
  return { date_preset: dateSelection.preset, date_column: dateCol }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientOverviewDashboard({ orgId, orgName }: { orgId: string; orgName?: string }) {
  const { session } = useAuth()
  const { globalDatasets, globalDatasetsLoaded, datasetsOrgId, setGlobalDatasets } = useDashboardStore(
    useShallow(s => ({
      globalDatasets: s.datasets,
      globalDatasetsLoaded: s.datasetsLoaded,
      datasetsOrgId: s.datasetsOrgId,
      setGlobalDatasets: s.setDatasets,
    }))
  )

  const [dateSelection, setDateSelection] = useState<DateSelection>({ preset: 'last_12_months' })
  const datasets = useMemo(
    () => (datasetsOrgId === orgId && globalDatasetsLoaded ? globalDatasets : []),
    [datasetsOrgId, orgId, globalDatasetsLoaded, globalDatasets],
  )
  const hasPendingDatasets = useMemo(
    () =>
      datasetsOrgId === orgId && globalDatasetsLoaded
        ? globalDatasets.some((dataset) => dataset.status !== 'completed')
        : false,
    [datasetsOrgId, orgId, globalDatasetsLoaded, globalDatasets],
  )
  const shouldFetchDatasets = useMemo(
    () => datasetsOrgId !== orgId || !globalDatasetsLoaded || hasPendingDatasets,
    [datasetsOrgId, orgId, globalDatasetsLoaded, hasPendingDatasets],
  )
  const [loadingDatasets, setLoadingDatasets] = useState(datasets.length === 0)
  const [googleAnalytics, setGoogleAnalytics] = useState<AnalyticsResult | null>(null)
  const [metaAnalytics, setMetaAnalytics] = useState<AnalyticsResult | null>(null)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [insightsError, setInsightsError] = useState<string | null>(null)
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
  const googleAnalyticsKey = useMemo(
    () => (googleDataset ? buildOverviewAnalyticsKey(googleDataset, orgId, dateSelection) : null),
    [googleDataset, orgId, dateSelection],
  )
  const metaAnalyticsKey = useMemo(
    () => (metaDataset ? buildOverviewAnalyticsKey(metaDataset, orgId, dateSelection) : null),
    [metaDataset, orgId, dateSelection],
  )

  useEffect(() => {
    if (!session) return
    if (!shouldFetchDatasets) {
      setLoadingDatasets(false)
      return
    }
    let cancelled = false
    
    // Only show loading if we don't have datasets for this org yet
    if (datasetsOrgId !== orgId || !globalDatasetsLoaded) {
      setLoadingDatasets(true)
    }
    setError(null)
    api.datasets
      .list(session.access_token, orgId)
      .then(ds => { 
        if (!cancelled) {
          setGlobalDatasets(ds, orgId)
          setLoadingDatasets(false)
        }
      })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load datasets'); setLoadingDatasets(false) } })
    return () => { cancelled = true }
  }, [session, orgId, datasetsOrgId, globalDatasetsLoaded, setGlobalDatasets, shouldFetchDatasets])

  useEffect(() => {
    if (!session?.access_token) return
    if (googleDataset) {
      api.analytics.warm(googleDataset.id, session.access_token, orgId)
    }
    if (metaDataset && metaDataset.id !== googleDataset?.id) {
      api.analytics.warm(metaDataset.id, session.access_token, orgId)
    }
  }, [session?.access_token, googleDataset, metaDataset, orgId])

  useEffect(() => {
    if (!session || !googleDataset) { 
      setGoogleAnalytics(null)
      setLoadingGoogle(false)
      return 
    }
    let cancelled = false
    if (googleAnalyticsKey) {
      const cached = overviewAnalyticsCache.get(googleAnalyticsKey)
      if (cached) {
        startTransition(() => {
          setGoogleAnalytics(cached)
        })
        setLoadingGoogle(false)
        return () => { cancelled = true }
      }
    }
    setLoadingGoogle(true)
    api.analytics
      .compute(
        { dataset_id: googleDataset.id, operation: 'auto', ...buildAnalyticsParams(dateSelection, googleDataset.detected_date_column) },
        session.access_token,
        orgId,
      )
      .then(r => {
        if (googleAnalyticsKey) {
          setOverviewCache(overviewAnalyticsCache, googleAnalyticsKey, r)
        }
        if (!cancelled) {
          startTransition(() => {
            setGoogleAnalytics(r)
          })
        }
      })
      .catch(e => { if (!cancelled) { setGoogleAnalytics(null); setError(e instanceof Error ? `Google Ads: ${e.message}` : 'Google Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingGoogle(false) })
    return () => { cancelled = true }
  }, [session, googleDataset, dateSelection, orgId, googleAnalyticsKey])

  useEffect(() => {
    if (!session || !metaDataset) { 
      setMetaAnalytics(null)
      setLoadingMeta(false)
      return 
    }
    let cancelled = false
    if (metaAnalyticsKey) {
      const cached = overviewAnalyticsCache.get(metaAnalyticsKey)
      if (cached) {
        startTransition(() => {
          setMetaAnalytics(cached)
        })
        setLoadingMeta(false)
        return () => { cancelled = true }
      }
    }
    setLoadingMeta(true)
    api.analytics
      .compute(
        { dataset_id: metaDataset.id, operation: 'auto', ...buildAnalyticsParams(dateSelection, metaDataset.detected_date_column) },
        session.access_token,
        orgId,
      )
      .then(r => {
        if (metaAnalyticsKey) {
          setOverviewCache(overviewAnalyticsCache, metaAnalyticsKey, r)
        }
        if (!cancelled) {
          startTransition(() => {
            setMetaAnalytics(r)
          })
        }
      })
      .catch(e => { if (!cancelled) { setMetaAnalytics(null); setError(e instanceof Error ? `Meta Ads: ${e.message}` : 'Meta Ads analytics failed') } })
      .finally(() => { if (!cancelled) setLoadingMeta(false) })
    return () => { cancelled = true }
  }, [session, metaDataset, dateSelection, orgId, metaAnalyticsKey])

  // Fetch AI insights from the primary available dataset (Google first, then Meta)
  const insightsDataset = googleDataset ?? metaDataset
  const insightsCacheKey = useMemo(
    () => (insightsDataset ? buildOverviewAnalyticsKey(insightsDataset, orgId, dateSelection) : null),
    [insightsDataset, orgId, dateSelection],
  )
  useEffect(() => {
    if (!session || !insightsDataset) {
      setInsights([])
      setLoadingInsights(false)
      return
    }
    let cancelled = false

    async function load() {
      if (!session || !insightsDataset) return

      if (insightsCacheKey) {
        const cached = overviewInsightsCache.get(insightsCacheKey)
        if (cached) {
          startTransition(() => {
            setInsights(cached)
          })
          setLoadingInsights(false)
          return
        }
      }

      try {
        const result = await api.analytics.getInsights(
          { dataset_id: insightsDataset.id, ...buildAnalyticsParams(dateSelection, insightsDataset.detected_date_column) },
          session.access_token,
          orgId,
        )
        const nextInsights = Array.isArray(result.insights) ? result.insights : []
        if (insightsCacheKey) {
          setOverviewCache(overviewInsightsCache, insightsCacheKey, nextInsights)
        }
        if (!cancelled) {
          startTransition(() => {
            setInsights(nextInsights)
          })
        }
      } catch (e) {
        if (!cancelled) setInsightsError(e instanceof Error ? e.message : 'Failed to load insights')
      } finally {
        if (!cancelled) setLoadingInsights(false)
      }
    }

    setInsightsError(null)
    setLoadingInsights(true)
    void load()
    return () => { cancelled = true }
  }, [session, insightsDataset, dateSelection, orgId, insightsCacheKey])

  // Derived combined metrics
  const deferredGoogleAnalytics = useDeferredValue(googleAnalytics)
  const deferredMetaAnalytics = useDeferredValue(metaAnalytics)
  const deferredInsights = useDeferredValue(insights)

  const googleTotals = useMemo(() => extractTotals(deferredGoogleAnalytics, googleDataset), [deferredGoogleAnalytics, googleDataset])
  const metaTotals = useMemo(() => extractTotals(deferredMetaAnalytics, metaDataset), [deferredMetaAnalytics, metaDataset])

  const comparisonWindow = useMemo(
    () => (deferredGoogleAnalytics?.result?.comparison_window ?? deferredMetaAnalytics?.result?.comparison_window ?? null) as ComparisonWindow | null,
    [deferredGoogleAnalytics, deferredMetaAnalytics],
  )
  const priorLabel = buildPriorLabel(comparisonWindow)
  const noDataLabel = buildNoDataLabel(comparisonWindow !== null, priorLabel)

  const granularity = useMemo(
    () => (deferredGoogleAnalytics?.result?.granularity ?? deferredMetaAnalytics?.result?.granularity ?? 'daily') as 'daily' | 'monthly',
    [deferredGoogleAnalytics, deferredMetaAnalytics]
  )

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
        else if (def.kind === 'ratio') value = `${(data.current * 100).toFixed(2)}%`
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
    const gRev = extractTimeSeries(deferredGoogleAnalytics, googleDataset, 'revenue')
    const gCost = extractTimeSeries(deferredGoogleAnalytics, googleDataset, 'cost')
    const mRev = extractTimeSeries(deferredMetaAnalytics, metaDataset, 'revenue')
    const mCost = extractTimeSeries(deferredMetaAnalytics, metaDataset, 'cost')
    return buildTrend(gRev, gCost, mRev, mCost, dateSelection)
  }, [deferredGoogleAnalytics, googleDataset, deferredMetaAnalytics, metaDataset, dateSelection])

  // Revenue/status split — prefer order-status data, then revenue, then cost
  const { splitData, splitLabel, splitIsStatus } = useMemo(() => {
    // 1. Try to find delivery/inventory status data from categorical_charts
    const statusRows = extractStatusData([deferredGoogleAnalytics, deferredMetaAnalytics])
    if (statusRows && statusRows.length > 0) {
      return { splitData: statusRows, splitLabel: 'Order Status', splitIsStatus: true }
    }

    // 2. Revenue split (Google vs Meta)
    const revRows = [
      { name: 'Google Ads', value: googleTotals.revenue.current, color: CHANNEL_COLORS['Google Ads'] },
      { name: 'Meta Ads', value: metaTotals.revenue.current, color: CHANNEL_COLORS['Meta Ads'] },
    ].filter(r => r.value != null && r.value > 0) as { name: string; value: number; color: string }[]
    if (revRows.length > 0) return { splitData: revRows, splitLabel: 'Revenue Split', splitIsStatus: false }

    // 3. Spend split fallback
    const costRows = [
      { name: 'Google Ads', value: googleTotals.cost.current, color: CHANNEL_COLORS['Google Ads'] },
      { name: 'Meta Ads', value: metaTotals.cost.current, color: CHANNEL_COLORS['Meta Ads'] },
    ].filter(r => r.value != null && r.value > 0) as { name: string; value: number; color: string }[]
    return { splitData: costRows, splitLabel: 'Spend Split', splitIsStatus: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deferredGoogleAnalytics, 
    deferredMetaAnalytics, 
    googleTotals.revenue.current, 
    metaTotals.revenue.current, 
    googleTotals.cost.current, 
    metaTotals.cost.current
  ])

  const hasAnyData = googleDataset !== null || metaDataset !== null
  const loadingAnalytics = loadingGoogle || loadingMeta

  // ── Shimmer ───────────────────────────────────────────────────────────────
  if (!session || loadingDatasets) {
    return (
      <div className="space-y-5 p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="shimmer-warm h-4 w-36 rounded" />
            <div className="shimmer-warm h-7 w-28 rounded-lg" />
          </div>
          <div className="shimmer-warm h-10 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
              <div className="shimmer-warm h-3 w-20 rounded" />
              <div className="shimmer-warm mt-4 h-6 w-24 rounded" />
              <div className="shimmer-warm mt-3 h-3 w-28 rounded" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="shimmer-warm h-[320px] rounded-xl" />
          <div className="shimmer-warm h-[320px] rounded-xl" />
        </div>
      </div>
    )
  }

  // ── No data ───────────────────────────────────────────────────────────────
  if (!hasAnyData) {
    return (
      <div className="p-6 md:p-8">
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}
        <EmptyDashboardState />
      </div>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <div id="overview-pdf-content" className="space-y-6 sm:space-y-8 animate-fade-in px-4 py-6 sm:px-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          {orgName && <p className="mb-1 text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">{orgName}</p>}
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Overview</h1>
          <p className="text-sm text-muted-foreground">Combined performance across all active channels</p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilterDropdown value={dateSelection} onChange={setDateSelection} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 md:grid-cols-4 xl:grid-cols-7">
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

      {/* Charts */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">

        {/* Revenue vs Cost Trend */}
        <div className="rounded-xl border border-border bg-card p-6 card-shadow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Revenue vs Cost Trend</h3>
          </div>
          {loadingAnalytics ? (
            <div className="shimmer-warm h-[280px] rounded-xl" />
          ) : trendData.length > 0 ? (
            <OverviewAreaChart data={trendData} granularity={granularity} />
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              <div className="text-center">
                <p className="font-medium text-slate-500">No trend data available</p>
                <p className="mt-1 text-xs">Datasets need a date column with revenue/cost values.</p>
              </div>
            </div>
          )}
        </div>

        {/* Revenue / Spend Split donut — matches Lovable prototype */}
        <div className="rounded-xl border border-border bg-card p-6 card-shadow flex flex-col">
          <h3 className="text-sm font-semibold text-slate-700">{splitLabel}</h3>
          {loadingAnalytics ? (
            <div className="shimmer-warm mt-3 flex-1 min-h-[300px] rounded-xl" />
          ) : splitData.length > 0 ? (
            <OverviewPieChart data={splitData} isStatus={splitIsStatus} />
          ) : (
            <div className="flex flex-1 min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              No channel data available
            </div>
          )}
        </div>
      </div>

      {/* Overall AI Insights */}
      <OverallInsights
        title="Overall AI Insights"
        subtitle={insightsDataset ? `Based on ${insightsDataset.report_type === 'google_ads' ? 'Google Ads' : 'Meta Ads'} data` : undefined}
        insights={deferredInsights}
        loading={loadingInsights}
        error={insightsError}
        emptyMessage="Insights will appear once your channel data is ready for AI analysis."
      />

    </div>
  )
}
